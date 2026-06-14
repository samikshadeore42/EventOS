# File: backend/app/models/evaluation.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Float, Text, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import EventScopedMixin  # <-- 1. Import the Mixin


# 2. Add EventScopedMixin
class Evaluator(EventScopedMixin, Base):
    __tablename__ = "evaluators"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name: Mapped[str] = mapped_column(String(50),  nullable=False)
    last_name: Mapped[str] = mapped_column(String(50),  nullable=False)
    
    # 3. CRITICAL: Removed unique=True. Uniqueness is scoped per-event below.
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    
    expertise_areas: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    passed_out_institution: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    access_link_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Updated to timezone-aware standard
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    evaluations: Mapped[list["Evaluation"]] = relationship("Evaluation", backref="evaluator")

    __table_args__ = (
        # 4. Enforce that an evaluator can only register ONCE per event
        UniqueConstraint("email", "event_id", name="uq_evaluator_email_event"),
    )

    def __repr__(self):
        return f"<Evaluator {self.first_name} {self.last_name} | {self.email}>"


# 5. Add EventScopedMixin
class Evaluation(EventScopedMixin, Base):
    __tablename__ = "evaluations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    evaluator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("evaluators.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    scores: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    score_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    flag_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    anomaly_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    # Updated to timezone-aware standard
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        # A judge should only submit ONE scorecard per team. 
        UniqueConstraint(
            "team_id", "evaluator_id",
            name="uq_evaluation_team_evaluator"
        ),
        Index("ix_evaluation_team_id", "team_id","is_flagged"),
        Index("ix_evaluation_flagged", "is_flagged"),
    )

    def __repr__(self):
        return f"<Evaluation team={self.team_id} evaluator={self.evaluator_id} flagged={self.is_flagged}>"