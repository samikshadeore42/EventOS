# backend/app/models/stage_transition.py
"""
Immutable audit trail for everything that happens to an event's timeline.

A transition row is written (never updated, never deleted) whenever:
  * an event is published                    -> transition_type="publish"
  * a stage run is advanced / completed      -> transition_type="advance"
  * the schedule is edited                   -> transition_type="schedule_change"
  * stages are reordered                     -> transition_type="reorder"
  * an organiser performs a manual override  -> transition_type="manual_override"

This satisfies the Phase-4 exit condition "schedule changes are audited" and the
blueprint's `stage_transitions` table. It is append-only by convention; there is
deliberately no update path in the service layer.
"""
import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.mixins import EventScopedMixin

# Allowed transition_type values — kept in sync with the CheckConstraint below.
TRANSITION_TYPES = (
    "publish",
    "advance",
    "schedule_change",
    "reorder",
    "manual_override",
)


class StageTransition(EventScopedMixin, Base):
    __tablename__ = "stage_transitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Nullable: event-level transitions (e.g. "publish") have no single stage.
    stage_definition_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Nullable: not every transition involves a materialised run.
    stage_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    transition_type: Mapped[str] = mapped_column(String(50), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Who triggered it (committee member). Nullable for system/automatic actions.
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Arbitrary structured detail (old/new values, violation snapshot, etc.).
    context: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # Tenancy-safe composite FK: a transition can only reference a stage
        # definition that lives in the SAME event. Mirrors stage_runs /
        # scheduled_actions. Because stage_definition_id is nullable, the FK is
        # simply not enforced for event-level rows (SQL MATCH SIMPLE semantics).
        ForeignKeyConstraint(
            ["event_id", "stage_definition_id"],
            ["stage_definitions.event_id", "stage_definitions.id"],
            name="fk_stage_transition_event_stage_definition",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "transition_type IN "
            "('publish', 'advance', 'schedule_change', 'reorder', 'manual_override')",
            name="ck_stage_transition_type",
        ),
    )

    def __repr__(self) -> str:
        return f"<StageTransition {self.transition_type} {self.from_status}->{self.to_status}>"