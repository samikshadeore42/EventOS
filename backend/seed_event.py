import uuid
from app.core.database import SessionLocal
from app.models.event import Event

def seed_test_event():
    db = SessionLocal()
    try:
        new_event = Event(
            id=uuid.uuid4(),
            name="Zero Trust Test Hackathon",
            slug="zero-trust-test-hackathon"  # <-- Added the required slug!
        )
        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        print("\n" + "="*50)
        print("SUCCESS! Your Test Event has been created.")
        print(f"Your REAL event_id is: {new_event.id}")
        print("="*50 + "\n")
    except Exception as e:
        print(f"Error creating event: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_test_event()