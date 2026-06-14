# File: backend/app/services/event_scope.py
import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.event import Event


class ScopedEventService:
    def __init__(self, event: Event, db: Session) -> None:
        self.event = event
        self.event_id = event.id
        self.organization_id = event.organization_id
        self.db = db


def get_event_scope(
    event_id: uuid.UUID,
    x_organization_id: uuid.UUID | None = Header(None, alias="X-Organization-Id"),
    db: Session = Depends(get_db),
) -> ScopedEventService:
    event = db.query(Event).filter(Event.id == event_id).first()

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found.",
        )

    if x_organization_id is not None and str(event.organization_id) != str(x_organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Event does not belong to the active organization.",
        )

    return ScopedEventService(event=event, db=db)