# backend/app/models/scheduled_action.py
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.mixins import EventScopedMixin

class ScheduledAction(EventScopedMixin, Base):
    __tablename__ = "scheduled_actions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stage_definition_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stage_definitions.id"),
        nullable=True,
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False) # stage_start, stage_end, stage_warning, finalization_email
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False) # pending, running, completed, failed, cancelled
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

    stage_definition = relationship("StageDefinition")
