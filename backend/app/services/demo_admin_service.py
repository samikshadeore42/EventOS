from sqlalchemy.orm import Session
from app.models.mentor import MentorFeedback, MentorSession, MentorAssignment, Mentor
from app.models.evaluation import Evaluation, Evaluator
from app.models.communication_log import CommunicationLog
from app.models.participant import Participant, Team

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
        
        # 1. mentor_feedback
        deleted_counts["mentor_feedback"] = db.query(MentorFeedback).delete()
        # 2. mentor_sessions
        deleted_counts["mentor_sessions"] = db.query(MentorSession).delete()
        # 3. mentor_assignments
        deleted_counts["mentor_assignments"] = db.query(MentorAssignment).delete()
        # 4. evaluations / scorecards
        deleted_counts["evaluations"] = db.query(Evaluation).delete()
        # 5. anomaly flags are on evaluations, already deleted
        
        # 6. communication logs
        deleted_counts["communication_logs"] = db.query(CommunicationLog).delete()
        
        # 7. participants
        deleted_counts["participants"] = db.query(Participant).delete()
        
        # 8. teams
        deleted_counts["teams"] = db.query(Team).delete()
        
        # 9. evaluators/judges
        deleted_counts["evaluators"] = db.query(Evaluator).delete()
        
        # 10. mentors
        deleted_counts["mentors"] = db.query(Mentor).delete()
        
        db.commit()
        return deleted_counts
    except Exception as e:
        db.rollback()
        raise e
