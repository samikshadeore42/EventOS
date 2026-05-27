import uuid
import pytest
from datetime import datetime, timezone, timedelta
from app.models.mentor import Mentor, MentorAssignment, MentorSession, MentorFeedback
from app.services.mentor_service import MentorService
from app.services.mentor_ops_service import MentorOpsService
from app.schemas.mentor_schemas import MentorCreate, MentorAssignmentCreate, MentorSessionCreate, MentorFeedbackCreate
from app.core.security import create_access_token

class TestMentorOps:
    
    def _mentor_token(self, mentor_id: uuid.UUID) -> str:
        return create_access_token(
            subject=str(mentor_id),
            role="mentor",
            stage="mentoring",
            expires_in=timedelta(hours=1)
        )

    def test_mentor_creation(self, db_session):
        data = MentorCreate(
            first_name="John", last_name="Doe",
            email="john@ti.com", organization="TI",
            expertise_areas=["embedded"]
        )
        mentor = MentorService.create_mentor(db_session, data)
        assert mentor.id is not None
        assert mentor.email == "john@ti.com"

    def test_mentor_assignment(self, db_session, approved_team):
        mentor_data = MentorCreate(
            first_name="Jane", last_name="Doe",
            email="jane@ti.com", organization="TI",
            expertise_areas=["frontend"]
        )
        mentor = MentorService.create_mentor(db_session, mentor_data)
        
        assign_data = MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id)
        assignment = MentorService.assign_mentor_to_team(db_session, assign_data)
        assert assignment.is_active is True
        assert assignment.team_id == approved_team.id

    def test_one_active_mentor_per_team(self, db_session, approved_team):
        mentor1 = MentorService.create_mentor(db_session, MentorCreate(first_name="A", last_name="B", email="a@b.com", organization="TI", expertise_areas=[]))
        mentor2 = MentorService.create_mentor(db_session, MentorCreate(first_name="C", last_name="D", email="c@d.com", organization="TI", expertise_areas=[]))
        
        MentorService.assign_mentor_to_team(db_session, MentorAssignmentCreate(mentor_id=mentor1.id, team_id=approved_team.id))
        MentorService.assign_mentor_to_team(db_session, MentorAssignmentCreate(mentor_id=mentor2.id, team_id=approved_team.id))
        
        active_assignments = db_session.query(MentorAssignment).filter(
            MentorAssignment.team_id == approved_team.id, MentorAssignment.is_active == True
        ).all()
        assert len(active_assignments) == 1
        assert active_assignments[0].mentor_id == mentor2.id

    def test_session_creation(self, db_session, approved_team):
        mentor = MentorService.create_mentor(db_session, MentorCreate(first_name="A", last_name="B", email="session@ti.com", organization="TI", expertise_areas=[]))
        MentorService.assign_mentor_to_team(db_session, MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id))
        
        session_data = MentorSessionCreate(team_id=approved_team.id, title="Sync", scheduled_at=datetime.now(timezone.utc), duration_minutes=30, meeting_url="https://meet.google.com/test")
        session = MentorService.create_session(db_session, mentor.id, session_data)
        assert session.id is not None

    def test_feedback_creation(self, db_session, approved_team):
        mentor = MentorService.create_mentor(db_session, MentorCreate(first_name="A", last_name="B", email="fb@ti.com", organization="TI", expertise_areas=[]))
        MentorService.assign_mentor_to_team(db_session, MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id))
        
        fb_data = MentorFeedbackCreate(team_id=approved_team.id, feedback_type="daily", progress_score=8, feedback_text="Good", visible_to_participant=True)
        fb = MentorService.submit_team_feedback(db_session, mentor.id, fb_data)
        assert fb.id is not None

    def test_participant_safe_feedback_filtering(self, db_session, approved_team):
        mentor = MentorService.create_mentor(db_session, MentorCreate(first_name="A", last_name="B", email="fbsafe@ti.com", organization="TI", expertise_areas=[]))
        MentorService.assign_mentor_to_team(db_session, MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id))
        
        MentorService.submit_team_feedback(db_session, mentor.id, MentorFeedbackCreate(team_id=approved_team.id, feedback_type="daily", progress_score=8, feedback_text="Private", visible_to_participant=False))
        MentorService.submit_team_feedback(db_session, mentor.id, MentorFeedbackCreate(team_id=approved_team.id, feedback_type="daily", progress_score=8, feedback_text="Public", visible_to_participant=True))
        
        visible = MentorService.get_visible_feedback_for_participant(db_session, uuid.uuid4(), approved_team.id)
        assert len(visible) == 1
        assert visible[0].feedback_text == "Public"

    def test_mentor_cannot_read_feedback_unassigned(self, client, db_session, approved_team):
        mentor = MentorService.create_mentor(db_session, MentorCreate(first_name="A", last_name="B", email="unassign@ti.com", organization="TI", expertise_areas=[]))
        token = self._mentor_token(mentor.id)
        
        r = client.get(f"/mentor-portal/feedback/team/{approved_team.id}?token={token}")
        assert r.status_code == 403

    def test_risk_score_no_mentor(self, db_session, approved_team):
        risk = MentorOpsService.calculate_team_risk_score(db_session, approved_team.id)
        assert risk.risk_score >= 35
        assert "No active mentor assigned" in risk.reasons

    def test_risk_score_missing_daily_update(self, db_session, approved_team):
        mentor = MentorService.create_mentor(db_session, MentorCreate(first_name="A", last_name="B", email="risk@ti.com", organization="TI", expertise_areas=[]))
        MentorService.assign_mentor_to_team(db_session, MentorAssignmentCreate(mentor_id=mentor.id, team_id=approved_team.id))
        MentorService.create_session(db_session, mentor.id, MentorSessionCreate(team_id=approved_team.id, title="Sync", scheduled_at=datetime.now(timezone.utc) + timedelta(days=1), duration_minutes=30, meeting_url="https://meet.google.com/test"))
        
        risk = MentorOpsService.calculate_team_risk_score(db_session, approved_team.id)
        assert risk.risk_score >= 25
        assert "No team-level feedback in last 24 hours" in risk.reasons
