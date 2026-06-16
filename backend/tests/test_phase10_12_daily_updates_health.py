from datetime import date
from uuid import uuid4

from jose import jwt

from app.core.security import JWT_SECRET_KEY, ALGORITHM
from app.models.daily_update import DailyUpdate
from app.models.event import Event
from app.models.event_config import EventConfig
from app.models.organization import Organization, OrganizationMember
from app.models.participant import Participant, Team
from app.models.user import User


def make_token(participant_id, event_id):
    return jwt.encode(
        {
            "sub": str(participant_id),
            "role": "participant",
            "type": "access",
            "token_type": "access",
            "event_id": str(event_id),
        },
        JWT_SECRET_KEY,
        algorithm=ALGORITHM,
    )


def create_org_user_event(db, *, risk_monitoring=True, role="owner"):
    org = Organization(id=uuid4(), name=f"Org {uuid4()}", slug=f"org-{uuid4()}")
    user = User(
        id=uuid4(),
        email=f"user-{uuid4()}@example.com",
        hashed_password="x",
        is_active=True,
        is_verified=True,
    )
    member = OrganizationMember(
        id=uuid4(),
        organization_id=org.id,
        user_id=user.id,
        role=role,
        status="active",
    )
    event = Event(
        id=uuid4(),
        organization_id=org.id,
        name=f"Event {uuid4()}",
        status="draft",
    )
    config = EventConfig(
        id=uuid4(),
        event_id=event.id,
        config={"capabilities": {"risk_monitoring": risk_monitoring}},
    )

    db.add_all([org, user, member, event, config])
    db.commit()
    return org, user, event


def create_team_with_participant(db, event_id):
    team = Team(
        id=uuid4(),
        event_id=event_id,
        team_name=f"Team {uuid4()}",
        is_approved=True,
        approval_status="approved",
    )
    participant = Participant(
        id=uuid4(),
        event_id=event_id,
        first_name="Test",
        last_name="User",
        email=f"p-{uuid4()}@example.com",
        team_id=team.id,
    )
    db.add_all([team, participant])
    db.commit()
    return team, participant


def auth_headers(user, org, role="owner"):
    token = jwt.encode(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": role,
            "type": "access",
            "token_type": "access",
        },
        JWT_SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return {
        "Authorization": f"Bearer {token}",
        "X-Organization-Id": str(org.id),
    }


def test_participant_can_submit_daily_update_event_scoped(client, db):
    _, _, event = create_org_user_event(db)
    team, participant = create_team_with_participant(db, event.id)
    token = make_token(participant.id, event.id)

    res = client.post(
        f"/events/{event.id}/daily-updates/submit",
        params={"token": token},
        json={
            "what_i_built": "Built login flow",
            "blockers": None,
            "hours_worked": 4,
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["participant_id"] == str(participant.id)
    assert body["team_id"] == str(team.id)

    row = db.query(DailyUpdate).filter_by(participant_id=participant.id).one()
    assert row.event_id == event.id


def test_participant_token_from_event_a_cannot_submit_to_event_b(client, db):
    _, _, event_a = create_org_user_event(db)
    _, _, event_b = create_org_user_event(db)

    _, participant = create_team_with_participant(db, event_a.id)
    token = make_token(participant.id, event_a.id)

    res = client.post(
        f"/events/{event_b.id}/daily-updates/submit",
        params={"token": token},
        json={"what_i_built": "Wrong event", "hours_worked": 1},
    )

    assert res.status_code == 403


def test_submitting_twice_same_day_updates_existing_row(client, db):
    _, _, event = create_org_user_event(db)
    _, participant = create_team_with_participant(db, event.id)
    token = make_token(participant.id, event.id)

    url = f"/events/{event.id}/daily-updates/submit"

    first = client.post(
        url,
        params={"token": token},
        json={"what_i_built": "First update", "hours_worked": 2},
    )
    second = client.post(
        url,
        params={"token": token},
        json={
            "what_i_built": "Updated work",
            "blockers": "Need mentor",
            "hours_worked": 5,
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200

    rows = db.query(DailyUpdate).filter_by(participant_id=participant.id).all()
    assert len(rows) == 1
    assert rows[0].what_i_built == "Updated work"
    assert rows[0].blockers == "Need mentor"
    assert rows[0].event_id == event.id
    assert rows[0].update_date == date.today()


def test_health_dashboard_requires_owner_or_admin(client, db):
    org, user, event = create_org_user_event(db, role="member")
    headers = auth_headers(user, org, role="member")

    res = client.get(f"/events/{event.id}/health-dashboard/teams", headers=headers)

    assert res.status_code in (401, 403)


def test_health_dashboard_requires_risk_monitoring_capability(client, db):
    org, user, event = create_org_user_event(db, risk_monitoring=False)
    headers = auth_headers(user, org)

    res = client.get(f"/events/{event.id}/health-dashboard/teams", headers=headers)

    assert res.status_code in (403, 404)


def test_health_dashboard_returns_only_current_event_teams(client, db):
    org, user, event_a = create_org_user_event(db)
    _, _, event_b = create_org_user_event(db)

    team_a, _ = create_team_with_participant(db, event_a.id)
    team_b, _ = create_team_with_participant(db, event_b.id)

    headers = auth_headers(user, org)

    res = client.get(f"/events/{event_a.id}/health-dashboard/teams", headers=headers)

    assert res.status_code == 200
    names = [item["team_name"] for item in res.json()]
    assert team_a.team_name in names
    assert team_b.team_name not in names


def test_health_cache_key_is_event_specific(client, db):
    org, user, event = create_org_user_event(db)
    create_team_with_participant(db, event.id)

    headers = auth_headers(user, org)

    res = client.get(f"/events/{event.id}/health-dashboard/teams", headers=headers)

    assert res.status_code == 200


def test_refresh_health_dashboard_writes_per_event_cache_key(client, db):
    org, user, event = create_org_user_event(db)
    create_team_with_participant(db, event.id)

    headers = auth_headers(user, org)

    res = client.post(f"/events/{event.id}/health-dashboard/refresh", headers=headers)

    assert res.status_code == 200
    assert "teams_at_risk" in res.json()
