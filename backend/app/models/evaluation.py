# File: backend/app/models/evaluation.py
# Two tables:
#   Evaluator — judges assigned to grade teams
#   Evaluation — a scorecard submitted by one evaluator for one team

import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Float, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Evaluator(Base):
    __tablename__ = "evaluators"

    id:               Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name:       Mapped[str]       = mapped_column(String(50),  nullable=False)
    last_name:        Mapped[str]       = mapped_column(String(50),  nullable=False)
    email:            Mapped[str]       = mapped_column(String(255), nullable=False, unique=True, index=True)
    expertise_areas:  Mapped[dict]      = mapped_column(JSONB, nullable=False, default=list)
    is_active:        Mapped[bool]      = mapped_column(Boolean, default=True, index=True)
    access_link_sent: Mapped[bool]      = mapped_column(Boolean, default=False)
    created_at:       Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow)
    evaluations:      Mapped[list["Evaluation"]] = relationship("Evaluation", backref="evaluator")

    def __repr__(self):
        return f"<Evaluator {self.first_name} {self.last_name} | {self.email}>"


class Evaluation(Base):
    __tablename__ = "evaluations"

    id:           Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id:      Mapped[uuid.UUID]      = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    evaluator_id: Mapped[uuid.UUID]      = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("evaluators.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    scores:       Mapped[dict]           = mapped_column(JSONB, nullable=False, default=dict)
    is_flagged:   Mapped[bool]           = mapped_column(Boolean, default=False, index=True)
    flag_reason:  Mapped[str | None]     = mapped_column(Text, nullable=True)
    anomaly_score: Mapped[float | None]  = mapped_column(Float, nullable=True)
    submitted_at: Mapped[datetime]       = mapped_column(DateTime, default=datetime.utcnow)
    updated_at:   Mapped[datetime]       = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint(
            "team_id", "evaluator_id",
            name="uq_evaluation_team_evaluator"
        ),
    )

    def __repr__(self):
        return f"<Evaluation team={self.team_id} evaluator={self.evaluator_id} flagged={self.is_flagged}>"