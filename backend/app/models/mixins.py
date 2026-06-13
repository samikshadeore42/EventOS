# backend/app/models/mixins.py
import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, declared_attr

class EventScopedMixin:
    """
    Mixin for any model that belongs to a specific event.
    Enforces that every query on this model MUST filter by event_id.
    """
    @declared_attr
    def event_id(cls)-> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("events.id",ondelete="CASCADE"),
            nullable=False,
            index=True
        )