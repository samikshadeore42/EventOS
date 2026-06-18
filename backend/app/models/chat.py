# File: backend/app/models/chat.py
"""
In-app chat — two conversation kinds per team:
  team_internal: all members of one team, group chat.
  team_mentor:   one team + their assigned mentor, shared thread (the whole
                 team sees it; the mentor talks to the team as a unit — not
                 a separate DM per participant).

A conversation is identified by (event_id, team_id, kind) — at most one of
each kind per team, enforced by a unique constraint. Messages reference the
conversation, not the team directly, so history is preserved even if a
mentor assignment later changes.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, UniqueConstraint, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.mixins import EventScopedMixin

CONVERSATION_KINDS = ("team_internal", "team_mentor")


class ChatConversation(EventScopedMixin, Base):
    __tablename__ = "chat_conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("event_id", "team_id", "kind", name="uq_chat_conversation_team_kind"),
        CheckConstraint("kind IN ('team_internal', 'team_mentor')", name="ck_chat_conversation_kind"),
    )

    def __repr__(self) -> str:
        return f"<ChatConversation {self.kind} team={self.team_id}>"


class ChatMessage(EventScopedMixin, Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Exactly one of these is set, identifying who sent the message.
    sender_participant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    sender_mentor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Denormalised at send time so message history reads correctly even if
    # the sender's name changes or they're later removed from the team.
    sender_name: Mapped[str] = mapped_column(String(120), nullable=False)
    sender_role: Mapped[str] = mapped_column(String(20), nullable=False)  # 'participant' | 'mentor'

    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("sender_role IN ('participant', 'mentor')", name="ck_chat_message_sender_role"),
        Index("ix_chat_messages_conversation_created", "conversation_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ChatMessage {self.sender_role}:{self.sender_name} in {self.conversation_id}>"