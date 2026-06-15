# backend/app/models/event.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

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
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
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

    def __repr__(self) -> str:
        return f"<Event {self.slug}>"