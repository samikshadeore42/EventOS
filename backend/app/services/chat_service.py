# File: backend/app/services/chat_service.py
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.chat import ChatConversation, ChatMessage
from app.models.participant import Participant, Team
from app.models.mentor import Mentor, MentorAssignment


class ChatService:

    # ── conversation resolution ─────────────────────────────────────────

    @staticmethod
    def get_or_create_conversation(
        event_id: uuid.UUID, db: Session, team_id: uuid.UUID, kind: str
    ) -> ChatConversation:
        if kind not in ("team_internal", "team_mentor"):
            raise HTTPException(status_code=400, detail=f"Invalid conversation kind '{kind}'.")

        convo = db.query(ChatConversation).filter(
            ChatConversation.event_id == event_id,
            ChatConversation.team_id == team_id,
            ChatConversation.kind == kind,
        ).first()
        if convo:
            return convo

        convo = ChatConversation(event_id=event_id, team_id=team_id, kind=kind)
        db.add(convo)
        db.commit()
        db.refresh(convo)
        return convo

    # ── authorization ───────────────────────────────────────────────────

    @staticmethod
    def authorize_participant(
        event_id: uuid.UUID, db: Session, participant_id: uuid.UUID, team_id: uuid.UUID, kind: str
    ) -> Participant:
        """A participant may access team_internal or team_mentor chat for
        their OWN team only."""
        participant = db.query(Participant).filter(
            Participant.id == participant_id,
            Participant.event_id == event_id,
        ).first()
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found in this event.")
        if participant.team_id != team_id:
            raise HTTPException(status_code=403, detail="You are not a member of this team.")

        if kind == "team_mentor":
            has_mentor = db.query(MentorAssignment).filter(
                MentorAssignment.event_id == event_id,
                MentorAssignment.team_id == team_id,
                MentorAssignment.is_active == True,
            ).first()
            if not has_mentor:
                raise HTTPException(
                    status_code=403,
                    detail="Your team doesn't have an active mentor assigned yet.",
                )
        return participant

    @staticmethod
    def authorize_mentor(
        event_id: uuid.UUID, db: Session, mentor_id: uuid.UUID, team_id: uuid.UUID
    ) -> Mentor:
        """A mentor may only access the team_mentor chat for teams they are
        actively assigned to. Mentors never have access to team_internal."""
        mentor = db.query(Mentor).filter(
            Mentor.id == mentor_id, Mentor.event_id == event_id,
        ).first()
        if not mentor:
            raise HTTPException(status_code=404, detail="Mentor not found in this event.")

        assignment = db.query(MentorAssignment).filter(
            MentorAssignment.event_id == event_id,
            MentorAssignment.mentor_id == mentor_id,
            MentorAssignment.team_id == team_id,
            MentorAssignment.is_active == True,
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=403,
                detail="You are not the active mentor for this team.",
            )
        return mentor

    # ── messages ─────────────────────────────────────────────────────────

    @staticmethod
    def list_messages(
        event_id: uuid.UUID, db: Session, conversation_id: uuid.UUID, limit: int = 100,
    ) -> list[ChatMessage]:
        return (
            db.query(ChatMessage)
            .filter(ChatMessage.event_id == event_id, ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
            .all()
        )

    @staticmethod
    def save_message(
        event_id: uuid.UUID, db: Session, conversation_id: uuid.UUID,
        sender_role: str, sender_name: str, body: str,
        sender_participant_id: Optional[uuid.UUID] = None,
        sender_mentor_id: Optional[uuid.UUID] = None,
    ) -> ChatMessage:
        body = (body or "").strip()
        if not body:
            raise HTTPException(status_code=422, detail="Message cannot be empty.")
        if len(body) > 4000:
            raise HTTPException(status_code=422, detail="Message is too long (max 4000 characters).")

        msg = ChatMessage(
            event_id=event_id,
            conversation_id=conversation_id,
            sender_participant_id=sender_participant_id,
            sender_mentor_id=sender_mentor_id,
            sender_name=sender_name,
            sender_role=sender_role,
            body=body,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return msg

    @staticmethod
    def serialize_message(msg: ChatMessage) -> dict:
        return {
            "id": str(msg.id),
            "conversation_id": str(msg.conversation_id),
            "sender_role": msg.sender_role,
            "sender_name": msg.sender_name,
            "sender_participant_id": str(msg.sender_participant_id) if msg.sender_participant_id else None,
            "sender_mentor_id": str(msg.sender_mentor_id) if msg.sender_mentor_id else None,
            "body": msg.body,
            "created_at": msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
        }