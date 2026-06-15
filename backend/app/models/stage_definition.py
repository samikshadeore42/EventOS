# backend/app/models/stage_definition.py
import uuid
from datetime import datetime
from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.mixins import EventScopedMixin

class StageDefinition(EventScopedMixin, Base):
    __tablename__ = "stage_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata", nullable=False)
    transition_policy: Mapped[str] = mapped_column(String(50), nullable=False) # manual or automatic
    reminder_policy: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    required_capabilities: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("event_id", "id", name="uq_stage_def_event_id"),
        UniqueConstraint("event_id", "key", name="uq_stage_def_event_key"),
        UniqueConstraint("event_id", "position", name="uq_stage_def_event_position"),
        CheckConstraint("position > 0", name="ck_stage_def_position_positive"),
        CheckConstraint("end_at > start_at", name="ck_stage_def_time_order"),
        CheckConstraint(
            "transition_policy IN ('manual', 'automatic')",
            name="ck_stage_def_transition_policy",
        ),
    )
