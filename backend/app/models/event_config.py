# File: backend/app/models/event_config.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


# Fixed pipeline stages for WiSE@TI hackathon
PIPELINE_STAGES = [
    "registration",
    "team_formation",
    "evaluation",
    "results",
]


class EventConfig(Base):
    """
    Single-row table that stores the active event configuration
    and current pipeline stage. There is always exactly one row.
    """
    __tablename__ = "event_config"

    id:            Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_name:    Mapped[str]       = mapped_column(String(200), default="WiSE@TI Hackathon")
    current_stage: Mapped[str]       = mapped_column(String(50),  default="registration", index=True)

    # Distribution rules stored as JSONB — configurable from dashboard
    distribution_rules: Mapped[dict] = mapped_column(JSONB, default=lambda: {
        "team_size":            4,
        "k_min":                3,
        "k_max":                5,
        "max_per_institution":  1,
        "skill_balance":        True,
    })

    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc))
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc))
