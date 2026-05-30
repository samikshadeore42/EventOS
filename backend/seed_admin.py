from app.core.database import SessionLocal, engine, Base
from app.models.admin import Employee, Admin
from app.models.participant import Participant, Team
from app.models.event_config import EventConfig
from app.models.evaluation import Evaluation
from app.models.communication_log import CommunicationLog
from app.models.mentor import Mentor, MentorAssignment, MentorSession, MentorFeedback
from sqlalchemy import text

def seed_db():
    print("Recreating database tables...")
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Dummy Employees
        dummy_employees = [
            {"employee_id": "EMP001", "name": "Misha Raj"},
            {"employee_id": "EMP002", "name": "Samiksha"},
            {"employee_id": "EMP003", "name": "Mishka"},
            {"employee_id": "EMP004", "name": "Bhavika"},
        ]
        
        for emp_data in dummy_employees:
            emp = Employee(employee_id=emp_data["employee_id"], name=emp_data["name"])
            db.add(emp)
        
        db.commit()
        print("Successfully seeded employees!")
    except Exception as e:
        print(f"Error seeding db: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
