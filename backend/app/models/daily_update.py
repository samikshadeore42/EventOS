# backend/app/models/daily_update.py
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import EventScopedMixin


class DailyUpdate(EventScopedMixin, Base):
    __tablename__ = "daily_updates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    what_i_built: Mapped[str] = mapped_column(Text, nullable=False)
    blockers: Mapped[str | None] = mapped_column(Text, nullable=True)
    hours_worked: Mapped[int | None] = mapped_column(Integer, nullable=True)

    update_date: Mapped[date] = mapped_column(Date, nullable=False)

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_daily_updates_event_date", "event_id", "update_date"),
        Index("ix_daily_update_participant_date", "participant_id", "update_date", unique=True),
        Index("ix_daily_update_team_date", "team_id", "update_date"),
    )