# backend/app/models/mixins.py
import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, declared_attr

class EventScopedMixin:
    """
    Mixin for any model that belongs to a specific event.
    Enforces that every query on this model MUST filter by event_id.

    NOTE on UUID typing: this stays a plain postgresql.UUID (no SQLite variant)
    deliberately, because it has a real ForeignKey to events.id, and Event.id
    (app/models/event.py) is ALSO a plain UUID with no variant. The two sides of
    any FK/comparison must use the SAME type on SQLite or pysqlite's bind
    processor breaks ("type 'UUID' is not supported") — see StageDefinition.id
    for the matching fix on the stage_definitions side.
    """
    @declared_attr
    def event_id(cls)-> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("events.id",ondelete="CASCADE"),
            nullable=False,
            index=True
        )