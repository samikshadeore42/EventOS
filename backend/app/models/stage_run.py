import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
# Import dialect helpers
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy import String as SA_String

from app.core.database import Base
from app.models.mixins import EventScopedMixin

# Helper to ensure SQLite compatibility during testing
def get_uuid_type():
    return PG_UUID(as_uuid=True).with_variant(SA_String(36), "sqlite")

class StageRun(EventScopedMixin, Base):
    __tablename__ = "stage_runs"

    id: Mapped[uuid.UUID] = mapped_column(get_uuid_type(), primary_key=True, default=uuid.uuid4)
    stage_definition_id: Mapped[uuid.UUID] = mapped_column(get_uuid_type(), nullable=False)
    
    status: Mapped[str] = mapped_column(String(50), nullable=False) 
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Consistent Mapped annotation
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Use string reference to avoid circular import issues
    stage_definition = relationship("StageDefinition")

    __table_args__ = (
        UniqueConstraint("event_id", "stage_definition_id", name="uq_stage_run_event_stage"),
        ForeignKeyConstraint(
            ["event_id", "stage_definition_id"],
            ["stage_definitions.event_id", "stage_definitions.id"],
            name="fk_stage_run_event_stage_definition",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "status IN ('pending', 'awaiting_approval', 'active', 'completed', 'skipped')",
            name="ck_stage_run_status",
        ),
    )