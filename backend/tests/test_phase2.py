import uuid

from app.models.event import Event, EventStatus
from app.models.organization import Organization
from app.models.participant import Participant


ORG_A = uuid.UUID("a1111111-1111-1111-1111-111111111111")
ORG_B = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2")
EVENT_A = uuid.UUID("cccccccc-cccc-cccc-cccc-ccccccccccc1")
EVENT_B = uuid.UUID("cccccccc-cccc-cccc-cccc-ccccccccccc2")


def seed_phase2_events(db_session):
    org_a = db_session.query(Organization).filter(Organization.id == ORG_A).first()
    org_b = db_session.query(Organization).filter(Organization.id == ORG_B).first()

    if not org_a:
        db_session.add(Organization(id=ORG_A, name="Phase2 Org A", slug="phase2-org-a", is_active=True))
    if not org_b:
        db_session.add(Organization(id=ORG_B, name="Phase2 Org B", slug="phase2-org-b", is_active=True))

    event_a = db_session.query(Event).filter(Event.id == EVENT_A).first()
    event_b = db_session.query(Event).filter(Event.id == EVENT_B).first()

    if not event_a:
        db_session.add(Event(
            id=EVENT_A,
            organization_id=ORG_A,
            name="Phase2 Hackathon",
            slug="phase2-hackathon",
            event_type="hackathon",
            active_capabilities=["teams", "mentors", "evaluators", "submissions"],
            status=EventStatus.ACTIVE,
            is_legacy=False,
        ))

    if not event_b:
        db_session.add(Event(
            id=EVENT_B,
            organization_id=ORG_A,
            name="Phase2 Coding Contest",
            slug="phase2-coding-contest",
            event_type="coding_contest",
            active_capabilities=["submissions", "live_scoring", "evaluators"],
            status=EventStatus.ACTIVE,
            is_legacy=False,
        ))

    db_session.commit()


def test_phase2_test_file_is_not_skipped():
    assert True


def test_participants_do_not_leak_between_events(client, db_session):
    seed_phase2_events(db_session)
    email = f"phase2.{uuid.uuid4().hex[:8]}@test.com"

    create_resp = client.post(
        f"/events/{EVENT_A}/participants",
        json={
            "first_name": "Phase",
            "last_name": "Two",
            "email": email,
            "institution": "IIITL",
            "skill_vector": {"python": 8.0},
        },
        headers={"X-Organization-Id": str(ORG_A)},
    )
    assert create_resp.status_code == 201, create_resp.text

    event_b_resp = client.get(
        f"/events/{EVENT_B}/participants",
        headers={"X-Organization-Id": str(ORG_A)},
    )
    assert event_b_resp.status_code == 200, event_b_resp.text
    emails = [p["email"] for p in event_b_resp.json()["participants"]]
    assert email not in emails


def test_same_email_can_exist_in_two_different_events(db_session):
    seed_phase2_events(db_session)
    email = f"shared.{uuid.uuid4().hex[:8]}@test.com"

    db_session.add_all([
        Participant(
            event_id=EVENT_A,
            first_name="Same",
            last_name="User",
            email=email,
            institution="Org A",
            skill_vector={},
        ),
        Participant(
            event_id=EVENT_B,
            first_name="Same",
            last_name="User",
            email=email,
            institution="Org B",
            skill_vector={},
        ),
    ])
    db_session.commit()

    count = db_session.query(Participant).filter(Participant.email == email).count()
    assert count == 2


def test_wrong_organization_header_cannot_access_event(client, db_session):
    seed_phase2_events(db_session)

    resp = client.get(
        f"/events/{EVENT_A}/participants",
        headers={"X-Organization-Id": str(ORG_B)},
    )
    assert resp.status_code == 403


def test_disabled_team_capability_blocks_solver(client, db_session):
    seed_phase2_events(db_session)

    resp = client.post(
        f"/events/{EVENT_B}/solver/run",
        json={
            "config": {
                "num_teams": 1,
                "target_size": 4,
                "k_min": 3,
                "k_max": 5,
                "use_mock_data": True,
            }
        },
        headers={"X-Organization-Id": str(ORG_A)},
    )
    assert resp.status_code == 403