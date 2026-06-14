import uuid
import pytest
from datetime import datetime, timezone, timedelta
from app.models.mentor import MentorAssignment
from app.services.mentor_service import MentorService
from app.services.mentor_ops_service import MentorOpsService
from app.schemas.mentor_schemas import MentorCreate, MentorAssignmentCreate, MentorSessionCreate, MentorFeedbackCreate
from app.core.security import create_access_token
from tests.conftest import TEST_EVENT_ID

class TestMentorOps:
    def _mentor_token(self, mentor_id: uuid.UUID) -> str:
        return create_access_token(subject=str(mentor_id), role="mentor", stage="mentoring", expires_in=timedelta(hours=1), event_id=str(TEST_EVENT_ID))

    def test_mentor_creation(self, db_session):
        data = MentorCreate(first_name="John", last_name="Doe", email="john@ti.com", organization="TI", expertise_areas=["embedded"])
        mentor = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=data, db=db_session)
        assert mentor.id is not None

    def test_mentor_assignment(self, db_session, approved_team):
        mentor = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=MentorCreate(first_name="Jane", last_name="Doe", email="jane@ti.com", organization="TI", expertise_areas=["frontend"]), db=db_session)
        assignment = MentorService.assign_mentor_to_team(event_id=TEST_EVENT_ID, data=MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id), db=db_session)
        assert assignment.is_active is True

    def test_one_active_mentor_per_team(self, db_session, approved_team):
        mentor1 = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=MentorCreate(first_name="A", last_name="B", email="a@b.com", organization="TI", expertise_areas=[]), db=db_session)
        mentor2 = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=MentorCreate(first_name="C", last_name="D", email="c@d.com", organization="TI", expertise_areas=[]), db=db_session)
        MentorService.assign_mentor_to_team(event_id=TEST_EVENT_ID, data=MentorAssignmentCreate(mentor_id=mentor1.id, team_id=approved_team.id), db=db_session)
        MentorService.assign_mentor_to_team(event_id=TEST_EVENT_ID, data=MentorAssignmentCreate(mentor_id=mentor2.id, team_id=approved_team.id), db=db_session)
        active = db_session.query(MentorAssignment).filter(MentorAssignment.team_id == approved_team.id, MentorAssignment.is_active == True).all()
        assert len(active) == 1

    def test_session_creation(self, db_session, approved_team):
        mentor = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=MentorCreate(first_name="A", last_name="B", email="session@ti.com", organization="TI", expertise_areas=[]), db=db_session)
        MentorService.assign_mentor_to_team(event_id=TEST_EVENT_ID, data=MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id), db=db_session)
        session = MentorService.create_session(event_id=TEST_EVENT_ID, mentor_id=mentor.id, data=MentorSessionCreate(team_id=approved_team.id, title="Sync", scheduled_at=datetime.now(timezone.utc), duration_minutes=30, meeting_url="http://meet"), db=db_session)
        assert session.id is not None

    def test_feedback_creation(self, db_session, approved_team):
        mentor = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=MentorCreate(first_name="A", last_name="B", email="fb@ti.com", organization="TI", expertise_areas=[]), db=db_session)
        MentorService.assign_mentor_to_team(event_id=TEST_EVENT_ID, data=MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id), db=db_session)
        fb = MentorService.submit_team_feedback(event_id=TEST_EVENT_ID, mentor_id=mentor.id, data=MentorFeedbackCreate(team_id=approved_team.id, feedback_type="daily", progress_score=8, feedback_text="Good", visible_to_participant=True), db=db_session)
        assert fb.id is not None

    def test_participant_safe_feedback_filtering(self, db_session, approved_team):
        mentor = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=MentorCreate(first_name="A", last_name="B", email="fbsafe@ti.com", organization="TI", expertise_areas=[]), db=db_session)
        MentorService.assign_mentor_to_team(event_id=TEST_EVENT_ID, data=MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id), db=db_session)
        MentorService.submit_team_feedback(event_id=TEST_EVENT_ID, mentor_id=mentor.id, data=MentorFeedbackCreate(team_id=approved_team.id, feedback_type="daily", progress_score=8, feedback_text="Private", visible_to_participant=False), db=db_session)
        MentorService.submit_team_feedback(event_id=TEST_EVENT_ID, mentor_id=mentor.id, data=MentorFeedbackCreate(team_id=approved_team.id, feedback_type="daily", progress_score=8, feedback_text="Public", visible_to_participant=True), db=db_session)
        visible = MentorService.get_visible_feedback_for_participant(event_id=TEST_EVENT_ID, participant_id=uuid.uuid4(), team_id=approved_team.id, db=db_session)
        assert len(visible) == 1

    def test_mentor_cannot_read_feedback_unassigned(self, client, db_session, approved_team):
        mentor = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=MentorCreate(first_name="A", last_name="B", email="unassign@ti.com", organization="TI", expertise_areas=[]), db=db_session)
        token = self._mentor_token(mentor.id)
        r = client.get(f"/events/{TEST_EVENT_ID}/mentor-portal/feedback/team/{approved_team.id}?token={token}", headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert r.status_code in [403, 404]

    def test_risk_score_no_mentor(self, db_session, approved_team):
        risk = MentorOpsService.calculate_team_risk_score(db_session, approved_team.id)
        assert risk.risk_score >= 35

    def test_risk_score_missing_daily_update(self, db_session, approved_team):
        mentor = MentorService.create_mentor(event_id=TEST_EVENT_ID, data=MentorCreate(first_name="A", last_name="B", email="risk@ti.com", organization="TI", expertise_areas=[]), db=db_session)
        MentorService.assign_mentor_to_team(event_id=TEST_EVENT_ID, data=MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id), db=db_session)
        MentorService.create_session(event_id=TEST_EVENT_ID, mentor_id=mentor.id, data=MentorSessionCreate(team_id=approved_team.id, title="Sync", scheduled_at=datetime.now(timezone.utc) + timedelta(days=1), duration_minutes=30, meeting_url="http://meet"), db=db_session)
        risk = MentorOpsService.calculate_team_risk_score(db_session, approved_team.id)
        assert risk.risk_score >= 25
