from sqlalchemy.orm import Session
from app.models.mentor import MentorFeedback, MentorSession, MentorAssignment, Mentor
from app.models.evaluation import Evaluation, Evaluator
from app.models.communication_log import CommunicationLog
from app.models.participant import Participant, Team
from app.models.project_submission import ProjectSubmission
from app.models.assignment import EvaluatorTeamAssignment
from app.models.event_state import EventState
import os
import shutil

from app.models.event_config import EventConfig

# Use the same upload dir as ProjectSubmissionService
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "project_submissions"))

def get_demo_status(db: Session):
    return {
        "participants": db.query(Participant).count(),
        "teams": db.query(Team).count(),
        "evaluations": db.query(Evaluation).count(),
        "mentors": db.query(Mentor).count(),
        "mentor_assignments": db.query(MentorAssignment).count(),
        "communication_logs": db.query(CommunicationLog).count()
    }

def reset_demo_data(db: Session, preserve_admins: bool = True):
    try:
        deleted_counts = {}
        
        # 1. Clear team foreign keys safely
        db.query(Participant).update({Participant.team_id: None}, synchronize_session=False)

        # 2. mentor_feedback
        deleted_counts["mentor_feedback"] = db.query(MentorFeedback).delete(synchronize_session=False)
        # 3. mentor_sessions
        deleted_counts["mentor_sessions"] = db.query(MentorSession).delete(synchronize_session=False)
        # 4. mentor_assignments
        deleted_counts["mentor_assignments"] = db.query(MentorAssignment).delete(synchronize_session=False)
        # 5. evaluations / scorecards
        deleted_counts["evaluations"] = db.query(Evaluation).delete(synchronize_session=False)
        
        # 6. communication logs
        deleted_counts["communication_logs"] = db.query(CommunicationLog).delete(synchronize_session=False)
        
        # 7. project submissions — MUST come before participants (FK: uploaded_by_participant_id)
        deleted_counts["project_submissions"] = db.query(ProjectSubmission).delete(synchronize_session=False)

        # 8. clean submission files from disk
        if os.path.isdir(UPLOAD_DIR):
            for filename in os.listdir(UPLOAD_DIR):
                file_path = os.path.join(UPLOAD_DIR, filename)
                try:
                    if os.path.isfile(file_path):
                        os.unlink(file_path)
                except Exception as e:
                    print(f"Failed to delete {file_path}. Reason: {e}")

        # 9. evaluator-team assignments — MUST come before evaluators/teams (FK)
        deleted_counts["evaluator_assignments"] = db.query(EvaluatorTeamAssignment).delete(synchronize_session=False)
        
        # 10. participants
        deleted_counts["participants"] = db.query(Participant).delete(synchronize_session=False)
        
        # 11. teams
        deleted_counts["teams"] = db.query(Team).delete(synchronize_session=False)
        
        # 12. evaluators/judges
        deleted_counts["evaluators"] = db.query(Evaluator).delete(synchronize_session=False)
        
        # 13. mentors
        deleted_counts["mentors"] = db.query(Mentor).delete(synchronize_session=False)
        
        # 14. reset event stage to registration
        state = db.query(EventState).first()
        if state:
            state.current_stage = "registration"
        
        config = db.query(EventConfig).first()
        if config:
            config.current_stage = "registration"

        db.commit()
        return deleted_counts
    except Exception as e:
        db.rollback()
        raise e
