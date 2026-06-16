# backend/app/models/daily_update.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Index
from app.core.database import Base


class DailyUpdate(Base):
    __tablename__ = "daily_updates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
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

    # The actual update content
    what_i_built: Mapped[str] = mapped_column(Text, nullable=False)
    blockers:     Mapped[str | None] = mapped_column(Text, nullable=True)
    hours_worked: Mapped[int | None] = mapped_column(nullable=True)

    # Date of the update (one per participant per day)
    update_date: Mapped[datetime] = mapped_column(
        Date, nullable=False
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        # One update per participant per day
        Index("ix_daily_update_participant_date",
              "participant_id", "update_date", unique=True),
        Index("ix_daily_update_team_date", "team_id", "update_date"),
    )

    def __repr__(self):
        return f"<DailyUpdate participant={self.participant_id} date={self.update_date}>"
