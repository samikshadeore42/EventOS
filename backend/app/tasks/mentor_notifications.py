from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.mentor import MentorAssignment
from app.services.mentor_notification_service import materialize_due_mentor_notifications


@celery_app.task(name="app.tasks.mentor_notifications.process_mentor_portal_notifications")
def process_mentor_portal_notifications():
    db = SessionLocal()
    processed = 0
    generated = 0

    try:
        rows = db.query(
            MentorAssignment.event_id,
            MentorAssignment.mentor_id,
        ).filter(
            MentorAssignment.is_active == True,
        ).distinct().all()

        for event_id, mentor_id in rows:
            generated += materialize_due_mentor_notifications(db, event_id, mentor_id)
            processed += 1

        return {"processed_mentors": processed, "generated": generated}
    finally:
        db.close()
