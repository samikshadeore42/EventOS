import uuid
from app.core.database import SessionLocal
from app.models.event import Event  # Import your Event model
from app.services.notification_service import NotificationService
from app.tasks.notifications import process_notification_outbox

def verify():
    db = SessionLocal()
    
    # 1. Fetch an actual existing event
    event = db.query(Event).first()
    if not event:
        print("Error: No events found in the database. Create an event first!")
        return
        
    event_id = event.id
    print(f"--- Enqueueing notification for existing event {event_id} ---")
    
    svc = NotificationService(db, event_id)
    
    # Enqueue a test notification
    outbox_row = svc.enqueue(
        notification_type="test_notification",
        title="Verification Test",
        message="If you see this, the outbox works!",
        user_id=None, 
        role="admin",
        idempotency_key="test-key-123"
    )
    
    if not outbox_row:
        print("Error: enqueue() returned None. Check DB logs for integrity issues.")
        return

    db.commit()
    print(f"Notification enqueued with status: {outbox_row.status}")

    # 2. Manually trigger the task
    print("--- Running processor manually ---")
    result = process_notification_outbox()
    print(f"Processor result: {result}")

    # 3. Check status
    db.refresh(outbox_row)
    print(f"Final status in DB: {outbox_row.status}")
    db.close()

if __name__ == "__main__":
    verify()