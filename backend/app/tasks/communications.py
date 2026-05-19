# File: backend/app/tasks/communications.py
from app.core.celery_app import celery_app

@celery_app.task(bind=True, queue="notifications", name="app.tasks.communications.send_batch_emails")
def send_batch_emails(self, recipient_ids: list, template: str):
    """
    Day 2 implementation: SendGrid batch email dispatch.
    Stub for Day 1 — registers the task with Celery.
    """
    print(f"[STUB] send_batch_emails called for {len(recipient_ids)} recipients")
    return {"queued": len(recipient_ids)}