import io
import uuid
import zipfile
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy.orm import sessionmaker

from app.core.security import generate_score_hash
from app.models.assignment import EvaluatorTeamAssignment
from app.models.daily_update import DailyUpdate
from app.models.evaluation import Evaluation, Evaluator
from app.models.event import Event, EventStatus
from app.models.mentor import Mentor, MentorAssignment
from app.models.notification import InAppNotification
from app.models.participant import Participant, Team
from app.models.scheduled_action import ScheduledAction
from app.models.stage_definition import StageDefinition
from app.models.stage_run import StageRun
from app.schemas.mentor_schemas import MentorFeedbackCreate, MentorSessionCreate
from app.services.mentor_notification_service import (
    materialize_due_mentor_notifications,
    mentor_role_key,
)
from app.services.mentor_service import MentorService
from app.services.portal_notification_service import (
    evaluator_role_key,
    notify_evaluator,
    notify_participant,
    participant_role_key,
)
from app.services.score_service import ScoreService
from app.services.stage_service import StageService


ORG_ID = uuid.UUID("a1111111-1111-1111-1111-111111111111")
ADMIN_USER_ID = uuid.UUID("a2222222-2222-2222-2222-222222222222")


def _hdr(event_id):
    return {"X-Event-Id": str(event_id), "X-Organization-Id": str(ORG_ID)}


def _make_event(db, *, name="Notification Test Event", status=EventStatus.ACTIVE, capabilities=None):
    event_id = uuid.uuid4()
    event = Event(
        id=event_id,
        organization_id=ORG_ID,
        name=f"{name} {uuid.uuid4().hex[:6]}",
        slug=f"notif-{uuid.uuid4().hex[:10]}",
        event_type="hackathon",
        active_capabilities=capabilities or [
            "teams",
            "mentors",
            "evaluators",
            "submissions",
            "weighted_scoring",
            "leaderboard",
        ],
        configuration={},
        status=status,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def _make_team(db, event_id, *, name="Team Notify"):
    team = Team(
        event_id=event_id,
        team_name=f"{name} {uuid.uuid4().hex[:5]}",
        rationale="Notification test team",
        is_approved=True,
        approval_status="approved",
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


def _make_participant(db, event_id, team=None, *, first_name="Bhavika"):
    participant = Participant(
        event_id=event_id,
        first_name=first_name,
        last_name="Test",
        email=f"{first_name.lower()}.{uuid.uuid4().hex[:8]}@test.com",
        institution="IIITL",
        skill_vector={"python": 8, "frontend": 7},
        team_id=team.id if team else None,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def _make_mentor(db, event_id, team=None):
    mentor = Mentor(
        event_id=event_id,
        first_name="Aman",
        last_name="Badhe",
        email=f"mentor.{uuid.uuid4().hex[:8]}@test.com",
        organization="EventOS Labs",
        expertise_areas=["AI", "ML", "Full Stack"],
        is_active=True,
    )
    db.add(mentor)
    db.flush()

    if team:
        db.add(MentorAssignment(
            event_id=event_id,
            mentor_id=mentor.id,
            team_id=team.id,
            stage="mentoring",
            is_active=True,
        ))

    db.commit()
    db.refresh(mentor)
    return mentor


def _make_evaluator(db, event_id, team=None):
    evaluator = Evaluator(
        event_id=event_id,
        first_name="Judge",
        last_name="One",
        email=f"judge.{uuid.uuid4().hex[:8]}@test.com",
        expertise_areas=["ai", "systems"],
        is_active=True,
    )
    db.add(evaluator)
    db.flush()

    if team:
        db.add(EvaluatorTeamAssignment(
            event_id=event_id,
            evaluator_id=evaluator.id,
            team_id=team.id,
        ))

    db.commit()
    db.refresh(evaluator)
    return evaluator


def _create_stage(client, event_id, *, key, position, start_at, end_at, policy="automatic", reminder_policy=None):
    payload = {
        "key": key,
        "name": key.replace("_", " ").title(),
        "position": position,
        "start_at": start_at.isoformat(),
        "end_at": end_at.isoformat(),
        "timezone": "Asia/Kolkata",
        "transition_policy": policy,
        "reminder_policy": reminder_policy or {},
    }
    return client.post(f"/events/{event_id}/stages", json=payload, headers=_hdr(event_id))


def _run_stage_engine(monkeypatch, db_session):
    test_session = sessionmaker(bind=db_session.get_bind(), autocommit=False, autoflush=False)
    monkeypatch.setattr("app.tasks.stages.SessionLocal", test_session)

    from app.tasks.stages import process_scheduled_actions

    return process_scheduled_actions()


def _process_outbox(monkeypatch, db_session):
    test_session = sessionmaker(bind=db_session.get_bind(), autocommit=False, autoflush=False)
    monkeypatch.setattr("app.tasks.notifications.SessionLocal", test_session)
    monkeypatch.setattr(
        "app.services.email_service.EmailService.send_email",
        lambda **kwargs: True,
    )

    from app.tasks.notifications import process_notification_outbox

    return process_notification_outbox()


def _notification_exists(db, event_id, *, notification_type=None, role=None, user_id=None, message_contains=None):
    query = db.query(InAppNotification).filter(InAppNotification.event_id == event_id)

    if notification_type:
        query = query.filter(InAppNotification.notification_type == notification_type)

    if role:
        query = query.filter(InAppNotification.role == role)

    if user_id:
        query = query.filter(InAppNotification.user_id == user_id)

    rows = query.all()

    if message_contains:
        return any(message_contains.lower() in (row.message or "").lower() for row in rows)

    return len(rows) > 0


def _valid_zip_bytes():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("README.md", "EventOS notification test submission")
    buffer.seek(0)
    return buffer


def test_automatic_stage_start_creates_admin_and_participant_notifications(client, db_session, monkeypatch):
    event = _make_event(db_session, status=EventStatus.DRAFT)
    now = datetime.now(timezone.utc)

    response = _create_stage(
        client,
        event.id,
        key="registration",
        position=1,
        start_at=now - timedelta(minutes=5),
        end_at=now + timedelta(hours=2),
        policy="automatic",
        reminder_policy={
            "notify_roles": ["participants"],
            "warn_before_minutes": [],
            "notify_on_start": True,
        },
    )
    assert response.status_code in (200, 201), response.text

    publish_response = client.post(f"/events/{event.id}/publish", headers=_hdr(event.id))
    assert publish_response.status_code == 200, publish_response.text

    stage_result = _run_stage_engine(monkeypatch, db_session)
    assert stage_result["processed"] >= 1

    _process_outbox(monkeypatch, db_session)
    db_session.expire_all()

    run = db_session.query(StageRun).filter(StageRun.event_id == event.id).first()
    assert run.status == "active"

    assert _notification_exists(
        db_session,
        event.id,
        notification_type="stage_started_admin",
        user_id=ADMIN_USER_ID,
    )

    assert _notification_exists(
        db_session,
        event.id,
        notification_type="stage_started",
        role="participant",
        message_contains="Registration has began",
    )


def test_manual_stage_creates_admin_awaiting_approval_notification(client, db_session, monkeypatch):
    event = _make_event(db_session, status=EventStatus.DRAFT)
    now = datetime.now(timezone.utc)

    response = _create_stage(
        client,
        event.id,
        key="team_formation",
        position=1,
        start_at=now - timedelta(minutes=5),
        end_at=now + timedelta(hours=2),
        policy="manual",
    )
    assert response.status_code in (200, 201), response.text

    publish_response = client.post(f"/events/{event.id}/publish", headers=_hdr(event.id))
    assert publish_response.status_code == 200, publish_response.text

    stage_result = _run_stage_engine(monkeypatch, db_session)
    assert stage_result["processed"] >= 1

    _process_outbox(monkeypatch, db_session)
    db_session.expire_all()

    run = db_session.query(StageRun).filter(StageRun.event_id == event.id).first()
    assert run.status == "awaiting_approval"

    assert _notification_exists(
        db_session,
        event.id,
        notification_type="stage_awaiting_approval",
        user_id=ADMIN_USER_ID,
        message_contains="awaits to start",
    )


def test_stage_warning_creates_reminder_notification_for_selected_roles(client, db_session, monkeypatch):
    event = _make_event(db_session, status=EventStatus.DRAFT)
    now = datetime.now(timezone.utc)

    response = _create_stage(
        client,
        event.id,
        key="development",
        position=1,
        start_at=now - timedelta(hours=2),
        end_at=now + timedelta(minutes=5),
        policy="automatic",
        reminder_policy={
            "notify_roles": ["mentors"],
            "warn_before_minutes": [10],
            "notify_on_start": False,
        },
    )
    assert response.status_code in (200, 201), response.text

    publish_response = client.post(f"/events/{event.id}/publish", headers=_hdr(event.id))
    assert publish_response.status_code == 200, publish_response.text

    stage_result = _run_stage_engine(monkeypatch, db_session)
    assert stage_result["processed"] >= 1

    _process_outbox(monkeypatch, db_session)
    db_session.expire_all()

    assert _notification_exists(
        db_session,
        event.id,
        notification_type="stage_reminder",
        role="mentor",
        message_contains="Development ends in 10 minutes",
    )


def test_participant_notification_api_returns_participant_specific_notification(client, db_session):
    event = _make_event(db_session)
    team = _make_team(db_session, event.id)
    participant = _make_participant(db_session, event.id, team)

    notification = notify_participant(
        db_session,
        event_id=event.id,
        participant_id=participant.id,
        notification_type="participant_feedback_received",
        title="Mentor feedback received",
        message="Mentor Aman has sent a feedback for you.",
        dedupe_key=f"test-participant-notification:{event.id}:{participant.id}",
    )

    with patch("app.api.portal_routes.decode_access_token") as mock_decode:
        mock_decode.return_value = {
            "sub": str(participant.id),
            "role": "participant",
            "event_id": str(event.id),
        }

        response = client.get(
            f"/events/{event.id}/portal/participant-portal/notifications",
            params={"token": "mock-participant-token"},
            headers=_hdr(event.id),
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    items = payload.get("notifications", payload)

    assert any(item["id"] == str(notification.id) for item in items)
    assert any("feedback" in item["message"].lower() for item in items)


def test_evaluator_notification_api_returns_evaluator_specific_notification(client, db_session):
    event = _make_event(db_session)
    team = _make_team(db_session, event.id)
    evaluator = _make_evaluator(db_session, event.id, team)

    notification = notify_evaluator(
        db_session,
        event_id=event.id,
        evaluator_id=evaluator.id,
        notification_type="evaluator_team_submission",
        title="Final project submitted",
        message=f"Team {team.team_name} submitted their final project.",
        dedupe_key=f"test-evaluator-notification:{event.id}:{evaluator.id}",
    )

    with patch("app.api.evaluation_routes.decode_access_token") as mock_decode:
        mock_decode.return_value = {
            "sub": str(evaluator.id),
            "role": "evaluator",
            "event_id": str(event.id),
        }

        response = client.get(
            f"/events/{event.id}/evaluations/portal/notifications",
            params={"token": "mock-evaluator-token"},
            headers=_hdr(event.id),
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    items = payload.get("notifications", payload)

    assert any(item["id"] == str(notification.id) for item in items)
    assert any("submitted their final project" in item["message"] for item in items)


def test_mentor_daily_update_notification_created_when_participant_submits_update(client, db_session):
    event = _make_event(db_session)
    team = _make_team(db_session, event.id)
    participant = _make_participant(db_session, event.id, team, first_name="Bhavika")
    mentor = _make_mentor(db_session, event.id, team)

    with patch("app.api.daily_update_routes.decode_access_token") as mock_decode:
        mock_decode.return_value = {
            "sub": str(participant.id),
            "role": "participant",
            "event_id": str(event.id),
        }

        response = client.post(
            f"/events/{event.id}/daily-updates/submit",
            params={"token": "mock-participant-token"},
            json={
                "what_i_built": "Implemented notification flow",
                "blockers": None,
                "hours_worked": 4,
            },
            headers=_hdr(event.id),
        )

    assert response.status_code == 200, response.text

    db_session.expire_all()
    assert _notification_exists(
        db_session,
        event.id,
        notification_type="mentor_daily_update_submitted",
        role=mentor_role_key(mentor.id),
        message_contains="Bhavika",
    )


def test_mentor_missed_update_notification_does_not_appear_before_11pm_window(db_session, monkeypatch):
    event = _make_event(db_session)
    team = _make_team(db_session, event.id)
    mentor = _make_mentor(db_session, event.id, team)

    class FakeEarlyDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc)

    monkeypatch.setattr("app.services.mentor_notification_service.datetime", FakeEarlyDatetime)

    created = materialize_due_mentor_notifications(db_session, event.id, mentor.id)

    assert created == 0
    assert not _notification_exists(
        db_session,
        event.id,
        notification_type="mentor_no_update_today",
        role=mentor_role_key(mentor.id),
    )


def test_mentor_meeting_reminders_use_60_10_and_now(db_session, monkeypatch):
    event = _make_event(db_session)
    team = _make_team(db_session, event.id)
    mentor = _make_mentor(db_session, event.id, team)

    fixed_now = datetime(2026, 6, 21, 10, 0, tzinfo=timezone.utc)

    class FakeDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now

    monkeypatch.setattr("app.services.mentor_notification_service.datetime", FakeDatetime)

    MentorService.create_session(
        event.id,
        db_session,
        mentor.id,
        MentorSessionCreate(
            team_id=team.id,
            title="One hour sync",
            meeting_url="https://meet.test/one-hour",
            scheduled_at=fixed_now + timedelta(minutes=60),
            duration_minutes=30,
            agenda="Sync",
        ),
    )

    MentorService.create_session(
        event.id,
        db_session,
        mentor.id,
        MentorSessionCreate(
            team_id=team.id,
            title="Ten minute sync",
            meeting_url="https://meet.test/ten-min",
            scheduled_at=fixed_now + timedelta(minutes=10),
            duration_minutes=30,
            agenda="Sync",
        ),
    )

    MentorService.create_session(
        event.id,
        db_session,
        mentor.id,
        MentorSessionCreate(
            team_id=team.id,
            title="Start now sync",
            meeting_url="https://meet.test/now",
            scheduled_at=fixed_now,
            duration_minutes=30,
            agenda="Sync",
        ),
    )

    materialize_due_mentor_notifications(db_session, event.id, mentor.id)

    notifications = db_session.query(InAppNotification).filter(
        InAppNotification.event_id == event.id,
        InAppNotification.role == mentor_role_key(mentor.id),
        InAppNotification.notification_type == "mentor_meeting_reminder",
    ).all()

    titles = " ".join(row.title for row in notifications)

    assert "1 hour" in titles
    assert "10 minutes" in titles
    assert "starting now" in titles.lower()
    assert "30 minutes" not in titles
    assert "5 minutes" not in titles


def test_participant_gets_notification_when_mentor_schedules_meeting(db_session):
    event = _make_event(db_session)
    team = _make_team(db_session, event.id)
    participant = _make_participant(db_session, event.id, team)
    mentor = _make_mentor(db_session, event.id, team)

    MentorService.create_session(
        event.id,
        db_session,
        mentor.id,
        MentorSessionCreate(
            team_id=team.id,
            title="Team planning meet",
            meeting_url="https://meet.test/planning",
            scheduled_at=datetime.now(timezone.utc) + timedelta(hours=2),
            duration_minutes=30,
            agenda="Plan next milestone",
        ),
    )

    db_session.expire_all()
    assert _notification_exists(
        db_session,
        event.id,
        notification_type="participant_meeting_scheduled",
        role=participant_role_key(participant.id),
        message_contains="has scheduled a meet",
    )


def test_participant_gets_notification_when_visible_feedback_is_submitted(db_session):
    event = _make_event(db_session)
    team = _make_team(db_session, event.id)
    participant = _make_participant(db_session, event.id, team)
    mentor = _make_mentor(db_session, event.id, team)

    MentorService.submit_team_feedback(
        event.id,
        db_session,
        mentor.id,
        MentorFeedbackCreate(
            team_id=team.id,
            participant_id=participant.id,
            feedback_type="daily_update",
            progress_score=8,
            feedback_text="Good work on the prototype.",
            visible_to_participant=True,
        ),
    )

    db_session.expire_all()
    assert _notification_exists(
        db_session,
        event.id,
        notification_type="participant_feedback_received",
        role=participant_role_key(participant.id),
        message_contains="feedback for you",
    )


def test_evaluator_gets_notification_when_assigned_team_submits_final_project(client, db_session):
    event = _make_event(db_session, capabilities=["teams", "evaluators", "submissions"])
    team = _make_team(db_session, event.id)
    participant = _make_participant(db_session, event.id, team)
    evaluator = _make_evaluator(db_session, event.id, team)

    with patch("app.api.submission_routes.decode_access_token") as mock_decode:
        mock_decode.return_value = {
            "sub": str(participant.id),
            "role": "participant",
            "event_id": str(event.id),
        }

        response = client.post(
            f"/events/{event.id}/submissions/participant/project",
            params={"token": "mock-participant-token"},
            files={"file": ("project.zip", _valid_zip_bytes(), "application/zip")},
            headers=_hdr(event.id),
        )

    assert response.status_code == 200, response.text

    db_session.expire_all()
    assert _notification_exists(
        db_session,
        event.id,
        notification_type="evaluator_team_submission",
        role=evaluator_role_key(evaluator.id),
        message_contains="submitted their final project",
    )


def test_results_announced_notification_appears_when_all_evaluations_are_submitted(db_session, monkeypatch):
    event = _make_event(db_session, capabilities=["teams", "evaluators", "weighted_scoring", "leaderboard"])
    team = _make_team(db_session, event.id)
    evaluator = _make_evaluator(db_session, event.id, team)

    scores = {
        "technical_depth": 8.0,
        "innovation": 8.0,
        "presentation": 8.0,
        "feasibility": 8.0,
    }

    evaluation = Evaluation(
        event_id=event.id,
        team_id=team.id,
        evaluator_id=evaluator.id,
        scores=scores,
        score_hash=generate_score_hash(str(evaluator.id), team.id, scores),
        is_flagged=False,
    )
    db_session.add(evaluation)
    db_session.commit()

    result = ScoreService.consolidate_all_teams(event.id, db_session)
    assert result["teams_processed"] == 1

    _process_outbox(monkeypatch, db_session)
    db_session.expire_all()

    assert _notification_exists(
        db_session,
        event.id,
        notification_type="results_announced",
        role="participant",
        message_contains=f"results for {event.name}",
    )
