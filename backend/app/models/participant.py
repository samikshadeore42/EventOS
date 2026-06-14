# File: backend/app/models/participant.py
# This defines what the 'participants' and 'teams' TABLES look like in PostgreSQL
# SQLAlchemy turns these Python classes into actual SQL CREATE TABLE statements

import uuid
from datetime import datetime,timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.mixins import EventScopedMixin

class Participant(EventScopedMixin,Base):
    __tablename__ = "participants"

    # UUID primary key — more secure than auto-increment integers
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    first_name:  Mapped[str]           = mapped_column(String(50),  nullable=False)
    last_name:   Mapped[str]           = mapped_column(String(50),  nullable=False)
    email:       Mapped[str]           = mapped_column(String(255), nullable=False, index=True)
    institution: Mapped[str]           = mapped_column(String(100), nullable=False)

    skill_vector: Mapped[dict]         = mapped_column(JSONB, nullable=False, default=dict)

    team_id: Mapped[uuid.UUID | None]  = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True   
    )

    email_verified:    Mapped[bool]    = mapped_column(Boolean, default=False)
    welcome_email_sent: Mapped[bool]   = mapped_column(Boolean, default=False)
    team_link_sent:    Mapped[bool]    = mapped_column(Boolean, default=False, server_default='false')

    progression_confirmed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    
    created_at: Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime]       = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )
    
    event: Mapped["Event"] = relationship("Event", back_populates="participants")
    
    __table_args__ = (
        Index("ix_participants_inst_team_id", "institution", "team_id"),
        UniqueConstraint("email", "event_id", name="uq_participant_email_event"),
        Index(
            "ix_participants_skill_vector_gin",
            "skill_vector",
            postgresql_using="gin",
        ),
    )

    def __repr__(self):
        return f"<Participant {self.first_name} {self.last_name} | {self.institution}>"


class Team(EventScopedMixin,Base):
    __tablename__ = "teams"

    id:          Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_name:   Mapped[str]       = mapped_column(String(100), nullable=False)
    rationale:   Mapped[str | None]= mapped_column(Text, nullable=True)  # LLM-generated explanation
    is_approved: Mapped[bool]      = mapped_column(Boolean, default=False, index=True)
    approval_status: Mapped[str]   = mapped_column(String(20), default="pending", nullable=False, server_default="pending", index=True)
    created_at:  Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    members: Mapped[list["Participant"]] = relationship("Participant", backref="team")

    event: Mapped["Event"]=relationship("Event", back_populates="teams")
    def __repr__(self):
        return f"<Team {self.team_name} | status={self.approval_status} | approved={self.is_approved}>"
