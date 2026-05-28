# File: backend/app/models/mentor.py
# Mentor operations data models:
#   Mentor           — a domain expert assigned to guide teams
#   MentorAssignment — links a mentor to a team (one active primary per team)
#   MentorSession    — scheduled meetings between mentor and team
#   MentorFeedback   — daily progress & individual feedback from mentor

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Float, Text, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Mentor(Base):
    __tablename__ = "mentors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    organization: Mapped[str | None] = mapped_column(String(100), nullable=True)
    expertise_areas: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    access_link_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    assignments: Mapped[list["MentorAssignment"]] = relationship(
        "MentorAssignment", backref="mentor", lazy="selectin"
    )
    sessions: Mapped[list["MentorSession"]] = relationship(
        "MentorSession", backref="mentor", lazy="selectin"
    )
    feedback: Mapped[list["MentorFeedback"]] = relationship(
        "MentorFeedback", backref="mentor", lazy="selectin"
    )

    def __repr__(self):
        return f"<Mentor {self.first_name} {self.last_name} | {self.email}>"


class MentorAssignment(Base):
    __tablename__ = "mentor_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    mentor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mentors.id", ondelete="CASCADE"),
        nullable=False,
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    stage: Mapped[str] = mapped_column(String(50), default="mentoring")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_mentor_assignments_team_id", "team_id"),
        Index("ix_mentor_assignments_mentor_id", "mentor_id"),
        Index("ix_mentor_assignments_active", "team_id", "is_active"),
    )

    def __repr__(self):
        return f"<MentorAssignment mentor={self.mentor_id} team={self.team_id} active={self.is_active}>"


class MentorSession(Base):
    __tablename__ = "mentor_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    mentor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mentors.id", ondelete="CASCADE"),
        nullable=False,
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    meeting_url: Mapped[str] = mapped_column(String(500), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    duration_minutes: Mapped[int] = mapped_column(default=30)
    agenda: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_mentor_sessions_team_id", "team_id"),
        Index("ix_mentor_sessions_scheduled_at", "scheduled_at"),
        Index("ix_mentor_sessions_mentor_id", "mentor_id"),
    )

    def __repr__(self):
        return f"<MentorSession {self.title} | {self.status}>"


class MentorFeedback(Base):
    __tablename__ = "mentor_feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    mentor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mentors.id", ondelete="CASCADE"),
        nullable=False,
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    participant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="SET NULL"),
        nullable=True,
    )
    feedback_type: Mapped[str] = mapped_column(String(30), nullable=False, default="daily_update")
    progress_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    collaboration_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    execution_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    clarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    blockers: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback_text: Mapped[str] = mapped_column(Text, nullable=False)
    action_items: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    visible_to_participant: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_mentor_feedback_team_id", "team_id"),
        Index("ix_mentor_feedback_participant_id", "participant_id"),
        Index("ix_mentor_feedback_created_at", "created_at"),
        Index("ix_mentor_feedback_visible", "team_id", "visible_to_participant"),
    )

    def __repr__(self):
        target = f"participant={self.participant_id}" if self.participant_id else "team-level"
        return f"<MentorFeedback {target} | {self.feedback_type}>"
