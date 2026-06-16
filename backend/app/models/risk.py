import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.models.mixins import EventScopedMixin
from app.core.database import Base

class RiskSignal(EventScopedMixin, Base):
    __tablename__ = "risk_signals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    participant_id = Column(UUID(as_uuid=True), ForeignKey("participants.id", ondelete="CASCADE"), nullable=True)
    signal_type = Column(String(80), nullable=False)
    severity = Column(Integer, nullable=False, default=0)
    payload = Column(JSONB, nullable=False, default=dict)
    source = Column(String(80), nullable=False, default="phase9_risk_engine")
    observed_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("ix_risk_signals_event_signal", "event_id", "signal_type"),
        Index("ix_risk_signals_event_team", "event_id", "team_id"),
        Index("ix_risk_signals_observed_at", "observed_at"),
    )

class TeamRiskSnapshot(EventScopedMixin, Base):
    __tablename__ = "team_risk_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    risk_score = Column(Integer, nullable=False)
    risk_level = Column(String(30), nullable=False)
    signals = Column(JSONB, nullable=False, default=list)
    reasons = Column(JSONB, nullable=False, default=list)
    recommended_actions = Column(JSONB, nullable=False, default=list)
    source = Column(String(80), nullable=False, default="phase9_risk_engine")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("ix_team_risk_snapshots_event_team_created", "event_id", "team_id", "created_at"),
        Index("ix_team_risk_snapshots_event_level", "event_id", "risk_level"),
        Index("ix_team_risk_snapshots_created", "created_at"),
    )
