# File: backend/app/models/event_config.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import EventScopedMixin


PIPELINE_STAGES = [
    "registration",
    "team_formation",
    "evaluation",
    "results",
]


class EventConfig(EventScopedMixin, Base):
    __tablename__ = "event_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    event_name: Mapped[str] = mapped_column(
        String(200),
        default="EventOS Event",
        nullable=False,
    )

    current_stage: Mapped[str] = mapped_column(
        String(50),
        default="registration",
        nullable=False,
        index=True,
    )

    distribution_rules: Mapped[dict] = mapped_column(
        JSONB,
        default=lambda: {
            "team_size": 4,
            "k_min": 3,
            "k_max": 5,
            "max_per_institution": 1,
            "skill_balance": True,
        },
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("event_id", name="uq_event_config_event_id"),
    )