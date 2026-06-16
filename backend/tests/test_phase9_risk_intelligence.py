import pytest
import uuid
from unittest.mock import patch
from datetime import datetime, timezone

from app.models.event import Event, EventStatus
from app.models.participant import Team, Participant
from app.models.mentor import Mentor, MentorAssignment, MentorFeedback
from app.models.risk import RiskSignal, TeamRiskSnapshot
from app.tasks.risk import process_risk_sweeps


TEST_ORG_ID = uuid.UUID("a1111111-1111-1111-1111-111111111111")
TEST_PHASE9_EVENT_ID = uuid.UUID("a9999999-9999-9999-9999-999999999999")
TEST_PHASE9_TEAM_ID = uuid.UUID("a8888888-8888-8888-8888-888888888888")

BASE_CAPABILITIES = [
    "teams",
    "mentors",
    "evaluators",
    "submissions",
    "weighted_scoring",
    "leaderboard",
]


@pytest.fixture(autouse=True)
def isolate_phase9_data(db_session):
    from app.models.event import Event
    from app.models.notification_outbox import NotificationOutbox
    from app.models.project_submission import ProjectSubmission

    def cleanup():
        db_session.query(NotificationOutbox).filter(
            NotificationOutbox.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(TeamRiskSnapshot).filter(
            TeamRiskSnapshot.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(RiskSignal).filter(
            RiskSignal.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(ProjectSubmission).filter(
            ProjectSubmission.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(MentorFeedback).filter(
            MentorFeedback.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(MentorAssignment).filter(
            MentorAssignment.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(Mentor).filter(
            Mentor.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(Participant).filter(
            Participant.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(Team).filter(
            Team.event_id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.query(Event).filter(
            Event.id == TEST_PHASE9_EVENT_ID
        ).delete(synchronize_session=False)

        db_session.commit()

    cleanup()
    yield
    cleanup()


@pytest.fixture
def event_with_risk(db_session):
    event = db_session.query(Event).filter_by(id=TEST_PHASE9_EVENT_ID).first()

    if not event:
        event = Event(
            id=TEST_PHASE9_EVENT_ID,
            organization_id=TEST_ORG_ID,
            name="Risk Test Event",
            slug=f"risk-test-{TEST_PHASE9_EVENT_ID}",
            event_type="hackathon",
            active_capabilities=[*BASE_CAPABILITIES, "risk_monitoring"],
            status=EventStatus.ACTIVE,
            is_legacy=False,
        )
        db_session.add(event)
    else:
        event.active_capabilities = [*BASE_CAPABILITIES, "risk_monitoring"]

    db_session.commit()
    return event


@pytest.fixture
def event_without_risk(db_session):
    event = db_session.query(Event).filter_by(id=TEST_PHASE9_EVENT_ID).first()

    if not event:
        event = Event(
            id=TEST_PHASE9_EVENT_ID,
            organization_id=TEST_ORG_ID,
            name="Risk Test Event",
            slug=f"risk-test-{TEST_PHASE9_EVENT_ID}",
            event_type="hackathon",
            active_capabilities=BASE_CAPABILITIES,
            status=EventStatus.ACTIVE,
            is_legacy=False,
        )
        db_session.add(event)
    else:
        event.active_capabilities = BASE_CAPABILITIES

    db_session.commit()
    return event


@pytest.fixture
def risk_team(db_session):
    team = db_session.query(Team).filter_by(id=TEST_PHASE9_TEAM_ID).first()

    if not team:
        team = Team(
            id=TEST_PHASE9_TEAM_ID,
            event_id=TEST_PHASE9_EVENT_ID,
            team_name="Risk Test Team",
            is_approved=True,
        )
        db_session.add(team)
    else:
        team.is_approved = True

    db_session.commit()
    return team


def test_risk_endpoints_require_capability(client, event_without_risk):
    res = client.get(f"/events/{TEST_PHASE9_EVENT_ID}/risk/summary")

    assert res.status_code == 403
    assert "does not enable capability: risk_monitoring" in res.text


def test_risk_summary_returns_empty_before_sweep(client, event_with_risk, risk_team):
    res = client.get(f"/events/{TEST_PHASE9_EVENT_ID}/risk/summary")

    assert res.status_code == 200
    data = res.json()
    assert data["total_teams"] == 1
    assert data["average_risk_score"] == 0.0


def test_sweep_creates_snapshot_per_team(client, event_with_risk, risk_team):
    res = client.post(f"/events/{TEST_PHASE9_EVENT_ID}/risk/sweep")

    assert res.status_code == 200
    data = res.json()
    assert data["processed_teams"] == 1
    assert data["created_snapshots"] == 1


def test_high_risk_team(client, event_with_risk, risk_team):
    res = client.post(f"/events/{TEST_PHASE9_EVENT_ID}/risk/sweep")

    assert res.status_code == 200
    data = res.json()
    assert data["created_snapshots"] == 1
    assert data["high_risk_count"] + data["critical_risk_count"] > 0

    res2 = client.get(f"/events/{TEST_PHASE9_EVENT_ID}/risk/teams")

    assert res2.status_code == 200
    teams = res2.json()
    assert len(teams) == 1
    assert teams[0]["risk_level"] in ["high", "critical"]


def test_low_risk_team(client, event_with_risk, risk_team, db_session):
    from app.models.project_submission import ProjectSubmission

    p1 = Participant(
        id=uuid.uuid4(),
        event_id=TEST_PHASE9_EVENT_ID,
        team_id=TEST_PHASE9_TEAM_ID,
        first_name="A",
        last_name="B",
        email="phase9-a@b.com",
        institution="X",
    )
    p2 = Participant(
        id=uuid.uuid4(),
        event_id=TEST_PHASE9_EVENT_ID,
        team_id=TEST_PHASE9_TEAM_ID,
        first_name="C",
        last_name="D",
        email="phase9-c@d.com",
        institution="X",
    )
    db_session.add_all([p1, p2])

    mentor = Mentor(
        id=uuid.uuid4(),
        event_id=TEST_PHASE9_EVENT_ID,
        first_name="M",
        last_name="M",
        email="phase9-mentor@m.com",
    )
    db_session.add(mentor)

    assignment = MentorAssignment(
        mentor_id=mentor.id,
        team_id=TEST_PHASE9_TEAM_ID,
        event_id=TEST_PHASE9_EVENT_ID,
        is_active=True,
    )
    db_session.add(assignment)

    feedback = MentorFeedback(
        mentor_id=mentor.id,
        team_id=TEST_PHASE9_TEAM_ID,
        event_id=TEST_PHASE9_EVENT_ID,
        feedback_text="All good",
        blockers="",
    )
    db_session.add(feedback)

    sub = ProjectSubmission(
        id=uuid.uuid4(),
        event_id=TEST_PHASE9_EVENT_ID,
        team_id=TEST_PHASE9_TEAM_ID,
        uploaded_by_participant_id=p1.id,
        original_filename="test.zip",
        stored_filename="test.zip",
        file_path="/tmp/test.zip",
        file_size_bytes=100,
    )
    db_session.add(sub)

    risk_team.created_at = datetime.now(timezone.utc)
    db_session.commit()

    res = client.post(f"/events/{TEST_PHASE9_EVENT_ID}/risk/sweep")
    assert res.status_code == 200

    res2 = client.get(f"/events/{TEST_PHASE9_EVENT_ID}/risk/teams")
    assert res2.status_code == 200

    teams = res2.json()
    assert teams[0]["risk_level"] in ["low", "medium"]


@patch("app.tasks.risk.SessionLocal")
def test_celery_risk_task_processes_only_active_events_with_capability(
    mock_session_local,
    db_session,
    event_with_risk,
    risk_team,
):
    mock_session_local.return_value = db_session

    db_session.query(TeamRiskSnapshot).filter(
        TeamRiskSnapshot.event_id == TEST_PHASE9_EVENT_ID
    ).delete(synchronize_session=False)
    db_session.commit()

    result = process_risk_sweeps()

    assert result["processed_events"] >= 1
    assert result["created_snapshots"] >= 1


def test_team_history_is_event_scoped(client, event_with_risk, risk_team, db_session):
    event2_id = uuid.uuid4()

    event2 = Event(
        id=event2_id,
        organization_id=TEST_ORG_ID,
        name="Risk Isolation Event",
        slug=f"risk-isolation-{event2_id}",
        event_type="hackathon",
        active_capabilities=[*BASE_CAPABILITIES, "risk_monitoring"],
        status=EventStatus.ACTIVE,
        is_legacy=False,
    )
    db_session.add(event2)
    db_session.commit()

    res = client.get(
        f"/events/{event2_id}/risk/teams/{TEST_PHASE9_TEAM_ID}/history",
        headers={"X-Event-Id": str(event2_id)},
    )

    assert res.status_code == 200
    assert len(res.json()) == 0


def test_org_a_cannot_access_org_b_risk(client, event_with_risk):
    headers = {
        "X-Organization-Id": "99999999-9999-9999-9999-999999999999",
        "X-Event-Id": str(TEST_PHASE9_EVENT_ID),
    }

    res = client.get(
        f"/events/{TEST_PHASE9_EVENT_ID}/risk/summary",
        headers=headers,
    )

    assert res.status_code in [401, 403]