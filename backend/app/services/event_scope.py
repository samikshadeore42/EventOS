# File: backend/app/services/event_scope.py
import uuid
from typing import Any, Generic, Optional, Type, TypeVar

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session # <-- Changed to standard synchronous Session

from app.core.database import get_db
from app.models.event import Event

ModelT = TypeVar("ModelT")

class ScopedEventService:
    """
    Holds the verified event_id for a request and provides scoped repositories.
    Instantiated via FastAPI Depends.
    """
    def __init__(self, event: Event, db: Session) -> None:
        self.event = event
        self.event_id = event.id
        self.db = db

def get_event_scope(
    event_id: uuid.UUID,  # <-- FIXED: Now expects a secure UUID instead of an integer!
    db: Session = Depends(get_db),
) -> ScopedEventService:
    """
    FastAPI dependency that resolves and validates the event scope.
    """
    # FIXED: Switched to synchronous query to match the rest of your backend
    event = db.query(Event).filter(Event.id == event_id).first()
    
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID {event_id} not found.",
        )

    return ScopedEventService(event=event, db=db)