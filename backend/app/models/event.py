# backend/app/models/event.py
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.participant import Participant
    from app.models.team import Team

class EventStatus:
    DRAFT = "draft"
    PUBLISHED = "published"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"

class Event(Base):
    __tablename__ = "events"

    id : Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Template linkage
    event_type: Mapped[str] = mapped_column(String(50), default="hackathon")
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates.id", ondelete="SET NULL"),
        nullable=True
    )
    template_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active_capabilities: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    configuration: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    status: Mapped[str] = mapped_column(String(30), default=EventStatus.DRAFT)
    is_legacy: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships mapping to the isolated tenants
    participants: Mapped[list["Participant"]] = relationship("Participant", back_populates="event", cascade="all, delete-orphan")
    teams: Mapped[list["Team"]] = relationship("Team", back_populates="event", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_events_org_slug"),
    )

    def __repr__(self) -> str:
        return f"<Event {self.slug}>"