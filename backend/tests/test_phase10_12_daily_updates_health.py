import uuid
from datetime import date, datetime, timezone, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.core.security import create_access_token
from app.models.daily_update import DailyUpdate
from app.models.event import Event, EventStatus
from app.models.evaluation import Evaluation, Evaluator
from app.models.participant import Participant, Team
from tests.conftest import TEST_EVENT_ID


TEST_ORG_ID = uuid.UUID("a1111111-1111-1111-1111-111111111111")
PHASE10_EVENT_ID = uuid.UUID("b1010101-1010-1010-1010-101010101010")
PHASE10_OTHER_EVENT_ID = uuid.UUID("b1212121-1212-1212-1212-121212121212")

BASE_CAPABILITIES = [
    "teams",
    "mentors",
    "evaluators",
    "submissions",
    "weighted_scoring",
    "leaderboard",
]


class FakeRedis:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def set(self, key, value, ex=None):
        self.store[key] = value

    def delete(self, key):
        self.store.pop(key, None)


def _participant_token(participant_id, event_id=PHASE10_EVENT_ID):
    return create_access_token(
        subject=str(participant_id),
        role="participant",
        stage="active",
        expires_in=timedelta(hours=1),
        event_id=str(event_id),
    )


def _make_event(db, event_id, capabilities=None, slug_suffix=None):
    event = Event(
        id=event_id,
        organization_id=TEST_ORG_ID,
        name=f"Phase 10/12 Event {slug_suffix or event_id}",
        slug=f"phase10-12-{slug_suffix or str(event_id)[:8]}",
        event_type="hackathon",
        active_capabilities=capabilities or [*BASE_CAPABILITIES, "risk_monitoring"],
        status=EventStatus.ACTIVE,
        is_legacy=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    return event


def _make_team(db, event_id, name="Phase Team", approved=True):
    team = Team(
        id=uuid.uuid4(),
        event_id=event_id,
        team_name=f"{name} {uuid.uuid4().hex[:6]}",
        rationale="Test team",
        is_approved=approved,
        approval_status="approved" if approved else "pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(team)
    db.commit()
    return team


def _make_participant(db, event_id, team_id=None, email_prefix="phase10"):
    participant = Participant(
        id=uuid.uuid4(),
        event_id=event_id,
        first_name="Phase",
        last_name="Participant",
        email=f"{email_prefix}-{uuid.uuid4().hex[:8]}@test.com",
        institution="Test Institute",
        skill_vector={},
        team_id=team_id,
        email_verified=True,
    )
    db.add(participant)
    db.commit()
    return participant


def _cleanup_event(db, event_id):
    db.query(DailyUpdate).filter(DailyUpdate.event_id == event_id).delete(synchronize_session=False)
    db.query(Evaluation).filter(Evaluation.event_id == event_id).delete(synchronize_session=False)
    db.query(Evaluator).filter(Evaluator.event_id == event_id).delete(synchronize_session=False)
    db.query(Participant).filter(Participant.event_id == event_id).delete(synchronize_session=False)
    db.query(Team).filter(Team.event_id == event_id).delete(synchronize_session=False)
    db.query(Event).filter(Event.id == event_id).delete(synchronize_session=False)
    db.commit()


def test_participant_can_submit_daily_update(client, db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)
    _make_event(db_session, PHASE10_EVENT_ID)
    team = _make_team(db_session, PHASE10_EVENT_ID)
    participant = _make_participant(db_session, PHASE10_EVENT_ID, team.id)

    token = _participant_token(participant.id)

    res = client.post(
        f"/events/{PHASE10_EVENT_ID}/daily-updates/submit",
        params={"token": token},
        json={
            "what_i_built": "Built the onboarding flow.",
            "blockers": None,
            "hours_worked": 4,
        },
    )

    assert res.status_code == 200
    data = res.json()
    assert data["participant_id"] == str(participant.id)
    assert data["team_id"] == str(team.id)
    assert data["what_i_built"] == "Built the onboarding flow."

    row = db_session.query(DailyUpdate).filter(DailyUpdate.participant_id == participant.id).one()
    assert row.event_id == PHASE10_EVENT_ID


def test_participant_token_from_event_a_cannot_submit_to_event_b(client, db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)
    _cleanup_event(db_session, PHASE10_OTHER_EVENT_ID)

    _make_event(db_session, PHASE10_EVENT_ID, slug_suffix="event-a")
    _make_event(db_session, PHASE10_OTHER_EVENT_ID, slug_suffix="event-b")

    team = _make_team(db_session, PHASE10_EVENT_ID)
    participant = _make_participant(db_session, PHASE10_EVENT_ID, team.id)

    token = _participant_token(participant.id, PHASE10_EVENT_ID)

    res = client.post(
        f"/events/{PHASE10_OTHER_EVENT_ID}/daily-updates/submit",
        params={"token": token},
        json={
            "what_i_built": "Trying wrong event.",
            "blockers": None,
            "hours_worked": 2,
        },
    )

    assert res.status_code == 403
    assert "Token does not belong to this event" in res.text


def test_submitting_twice_same_day_updates_existing_row(client, db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)

    _make_event(db_session, PHASE10_EVENT_ID)
    team = _make_team(db_session, PHASE10_EVENT_ID)
    participant = _make_participant(db_session, PHASE10_EVENT_ID, team.id)
    token = _participant_token(participant.id)

    first = client.post(
        f"/events/{PHASE10_EVENT_ID}/daily-updates/submit",
        params={"token": token},
        json={
            "what_i_built": "First update.",
            "blockers": "Blocked on API.",
            "hours_worked": 3,
        },
    )
    assert first.status_code == 200

    second = client.post(
        f"/events/{PHASE10_EVENT_ID}/daily-updates/submit",
        params={"token": token},
        json={
            "what_i_built": "Edited update.",
            "blockers": None,
            "hours_worked": 5,
        },
    )
    assert second.status_code == 200

    rows = db_session.query(DailyUpdate).filter(
        DailyUpdate.event_id == PHASE10_EVENT_ID,
        DailyUpdate.participant_id == participant.id,
        DailyUpdate.update_date == date.today(),
    ).all()

    assert len(rows) == 1
    assert rows[0].what_i_built == "Edited update."
    assert rows[0].blockers is None
    assert rows[0].hours_worked == 5


def test_my_updates_returns_only_current_participant_event(client, db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)

    _make_event(db_session, PHASE10_EVENT_ID)
    team = _make_team(db_session, PHASE10_EVENT_ID)
    participant = _make_participant(db_session, PHASE10_EVENT_ID, team.id)
    token = _participant_token(participant.id)

    db_session.add(
        DailyUpdate(
            event_id=PHASE10_EVENT_ID,
            participant_id=participant.id,
            team_id=team.id,
            what_i_built="Visible update",
            blockers=None,
            hours_worked=4,
            update_date=date.today(),
            submitted_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    res = client.get(
        f"/events/{PHASE10_EVENT_ID}/daily-updates/my-updates",
        params={"token": token},
    )

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["what_i_built"] == "Visible update"


def test_health_dashboard_requires_risk_monitoring_capability(client, db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)

    _make_event(
        db_session,
        PHASE10_EVENT_ID,
        capabilities=BASE_CAPABILITIES,
        slug_suffix="no-risk",
    )

    res = client.get(f"/events/{PHASE10_EVENT_ID}/health-dashboard/teams")

    assert res.status_code == 403
    assert "risk_monitoring" in res.text


def test_health_dashboard_requires_admin_auth(db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)

    _make_event(db_session, PHASE10_EVENT_ID)

    unauthenticated_client = TestClient(app)
    res = unauthenticated_client.get(f"/events/{PHASE10_EVENT_ID}/health-dashboard/teams")

    assert res.status_code in (401, 403)


def test_health_dashboard_returns_only_current_event_teams(client, db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)
    _cleanup_event(db_session, PHASE10_OTHER_EVENT_ID)

    _make_event(db_session, PHASE10_EVENT_ID, slug_suffix="health-a")
    _make_event(db_session, PHASE10_OTHER_EVENT_ID, slug_suffix="health-b")

    team_a = _make_team(db_session, PHASE10_EVENT_ID, name="Current Event Team")
    team_b = _make_team(db_session, PHASE10_OTHER_EVENT_ID, name="Other Event Team")

    _make_participant(db_session, PHASE10_EVENT_ID, team_a.id, email_prefix="current")
    _make_participant(db_session, PHASE10_OTHER_EVENT_ID, team_b.id, email_prefix="other")

    fake_redis = FakeRedis()

    with patch("app.api.health_routes.get_redis", return_value=fake_redis):
        res = client.get(f"/events/{PHASE10_EVENT_ID}/health-dashboard/teams")

    assert res.status_code == 200
    data = res.json()

    team_ids = {item["team_id"] for item in data}
    assert str(team_a.id) in team_ids
    assert str(team_b.id) not in team_ids


def test_health_cache_key_is_event_specific(client, db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)
    _cleanup_event(db_session, PHASE10_OTHER_EVENT_ID)

    _make_event(db_session, PHASE10_EVENT_ID, slug_suffix="cache-a")
    _make_event(db_session, PHASE10_OTHER_EVENT_ID, slug_suffix="cache-b")

    team_a = _make_team(db_session, PHASE10_EVENT_ID, name="Cache Team A")
    team_b = _make_team(db_session, PHASE10_OTHER_EVENT_ID, name="Cache Team B")

    _make_participant(db_session, PHASE10_EVENT_ID, team_a.id, email_prefix="cache-a")
    _make_participant(db_session, PHASE10_OTHER_EVENT_ID, team_b.id, email_prefix="cache-b")

    fake_redis = FakeRedis()

    with patch("app.api.health_routes.get_redis", return_value=fake_redis):
        res_a = client.post(f"/events/{PHASE10_EVENT_ID}/health-dashboard/refresh")
        res_b = client.post(f"/events/{PHASE10_OTHER_EVENT_ID}/health-dashboard/refresh")

    assert res_a.status_code == 200
    assert res_b.status_code == 200

    assert f"health:{PHASE10_EVENT_ID}:all_teams" in fake_redis.store
    assert f"health:{PHASE10_OTHER_EVENT_ID}:all_teams" in fake_redis.store
    assert fake_redis.store[f"health:{PHASE10_EVENT_ID}:all_teams"] != fake_redis.store[f"health:{PHASE10_OTHER_EVENT_ID}:all_teams"]


def test_team_health_404_for_other_event_team(client, db_session):
    _cleanup_event(db_session, PHASE10_EVENT_ID)
    _cleanup_event(db_session, PHASE10_OTHER_EVENT_ID)

    _make_event(db_session, PHASE10_EVENT_ID, slug_suffix="team-health-a")
    _make_event(db_session, PHASE10_OTHER_EVENT_ID, slug_suffix="team-health-b")

    other_team = _make_team(db_session, PHASE10_OTHER_EVENT_ID, name="Other Team")

    res = client.get(
        f"/events/{PHASE10_EVENT_ID}/health-dashboard/team/{other_team.id}"
    )

    assert res.status_code == 404