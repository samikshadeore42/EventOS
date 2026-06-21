import uuid
from unittest.mock import patch

from app.models.event import Event, EventStatus
from app.models.participant import Participant, Team
from app.services.approval_service import ApprovalService


ORG_ID = uuid.UUID("a1111111-1111-1111-1111-111111111111")


def _make_event(db_session, name="Team Mail Event"):
    event_id = uuid.uuid4()
    event = Event(
        id=event_id,
        organization_id=ORG_ID,
        name=name,
        slug=f"team-mail-{uuid.uuid4().hex[:8]}",
        event_type="hackathon",
        active_capabilities=["teams"],
        status=EventStatus.ACTIVE,
    )
    db_session.add(event)
    db_session.commit()
    return event


def _make_team_with_participants(db_session, event_id, status="approved", sent=False):
    team = Team(
        event_id=event_id,
        team_name=f"Team Mail {uuid.uuid4().hex[:6]}",
        rationale="Balanced team",
        is_approved=True,
        approval_status=status,
    )
    db_session.add(team)
    db_session.flush()

    p1 = Participant(
        event_id=event_id,
        first_name="Aman",
        last_name="Test",
        email=f"aman.{uuid.uuid4().hex[:8]}@test.com",
        institution="IIITL",
        skill_vector={"python": 8},
        team_id=team.id,
        team_link_sent=sent,
    )
    p2 = Participant(
        event_id=event_id,
        first_name="Bhavika",
        last_name="Test",
        email=f"bhavika.{uuid.uuid4().hex[:8]}@test.com",
        institution="IIITL",
        skill_vector={"frontend": 8},
        team_id=team.id,
        team_link_sent=sent,
    )

    db_session.add_all([p1, p2])
    db_session.commit()
    return team, [p1, p2]


def test_publish_formation_queues_team_assignment_email_with_event_id(db_session):
    event = _make_event(db_session)
    _make_team_with_participants(db_session, event.id, status="approved", sent=False)

    with patch("app.tasks.communications.send_batch_emails.delay") as mock_delay:
        result = ApprovalService.publish_formation(event.id, db_session)

    assert result["success"] is True
    assert mock_delay.call_count == 1

    kwargs = mock_delay.call_args.kwargs
    assert kwargs["template"] == "team_assignment"
    assert kwargs["event_name"] == event.name
    assert kwargs["event_id"] == str(event.id)
    assert len(kwargs["recipient_list"]) == 2


def test_publish_formation_can_retry_unsent_published_team_emails(db_session):
    event = _make_event(db_session, name="Retry Published Mail Event")
    _make_team_with_participants(db_session, event.id, status="published", sent=False)

    with patch("app.tasks.communications.send_batch_emails.delay") as mock_delay:
        result = ApprovalService.publish_formation(event.id, db_session)

    assert result["success"] is True
    assert mock_delay.call_count == 1

    kwargs = mock_delay.call_args.kwargs
    assert kwargs["event_id"] == str(event.id)
    assert len(kwargs["recipient_list"]) == 2


def test_publish_formation_does_not_resend_already_sent_team_emails(db_session):
    event = _make_event(db_session, name="No Duplicate Mail Event")
    _make_team_with_participants(db_session, event.id, status="published", sent=True)

    with patch("app.tasks.communications.send_batch_emails.delay") as mock_delay:
        result = ApprovalService.publish_formation(event.id, db_session)

    assert result["success"] is True
    assert mock_delay.call_count == 0