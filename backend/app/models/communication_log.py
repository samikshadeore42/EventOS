# File: backend/app/models/communication_log.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class CommunicationLog(Base):
    """Tracks every email dispatched by the system."""
    __tablename__ = "communication_logs"

    id:          Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient_email: Mapped[str]   = mapped_column(String(255), nullable=False, index=True)
    recipient_name:  Mapped[str]   = mapped_column(String(120), nullable=False)
    template:        Mapped[str]   = mapped_column(String(80),  nullable=False)  # "registration", "team_assignment", etc.
    subject:         Mapped[str]   = mapped_column(String(255), nullable=False)
    stage:           Mapped[str]   = mapped_column(String(50),  nullable=False)
    success:         Mapped[bool]  = mapped_column(Boolean,     default=False)
    error_message:   Mapped[str | None] = mapped_column(Text,   nullable=True)
    message_id:      Mapped[str | None] = mapped_column(String(200), nullable=True)  # SendGrid msg ID
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    sent_at:         Mapped[datetime]   = mapped_column(DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc))
