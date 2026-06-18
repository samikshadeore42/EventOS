# File: backend/app/api/chat_routes.py
"""
Chat for the participant and mentor portals.

REST:
  GET  /events/{event_id}/chat/{team_id}/{kind}/history
       Initial message load when a chat panel opens. token = portal JWT.

WebSocket:
  WS   /events/{event_id}/chat/{team_id}/{kind}/ws?token=...
       Live connection. Client sends {"body": "..."} text frames; receives
       every message in the conversation (including its own, echoed back
       after persistence — keeps client state simple, no optimistic-UI
       reconciliation needed).

`kind` is 'internal' (team-only group chat) or 'mentor' (team <-> mentor
shared thread). Auth is the same portal JWT participants/mentors already use
to access /portal/access — decoded and checked against event_id exactly like
submission_routes.py / portal_routes.py do, since this isn't an org-context
HTTP request, it's a portal-token request.
"""
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.database import get_db, SessionLocal
from app.core.security import decode_access_token, get_token_subject, parse_uuid_subject
from app.models.event import Event
from app.services.chat_service import ChatService
from app.services.chat_connection_manager import chat_manager

router = APIRouter(prefix="/events/{event_id}/chat", tags=["Chat"])

_KIND_MAP = {"internal": "team_internal", "mentor": "team_mentor"}


def _resolve_kind(kind: str) -> str:
    resolved = _KIND_MAP.get(kind)
    if not resolved:
        raise HTTPException(status_code=400, detail="kind must be 'internal' or 'mentor'.")
    return resolved


def _check_event(event_id: uuid.UUID, db: Session) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


def _authorize_from_token(
    event_id: uuid.UUID, db: Session, team_id: uuid.UUID, kind: str, token: str,
) -> tuple[str, str, Optional[uuid.UUID], Optional[uuid.UUID]]:
    """Decodes the portal token, checks it belongs to this event, and
    authorizes access to this team's conversation. Returns
    (sender_role, sender_name, participant_id_or_None, mentor_id_or_None)."""
    payload = decode_access_token(token)
    role = payload.get("role")
    token_event_id = payload.get("event_id")

    if str(token_event_id) != str(event_id):
        raise HTTPException(status_code=403, detail="Token mismatch. This link belongs to a different event.")

    subject_id = parse_uuid_subject(get_token_subject(payload), f"{role} ID")

    if role == "participant":
        participant = ChatService.authorize_participant(event_id, db, subject_id, team_id, kind)
        return "participant", f"{participant.first_name} {participant.last_name}", participant.id, None
    elif role == "mentor":
        if kind != "team_mentor":
            raise HTTPException(status_code=403, detail="Mentors can only access the team-mentor chat.")
        mentor = ChatService.authorize_mentor(event_id, db, subject_id, team_id)
        return "mentor", f"{mentor.first_name} {mentor.last_name}", None, mentor.id
    else:
        raise HTTPException(status_code=403, detail="Only participants and mentors can use chat.")


# ── REST: history ────────────────────────────────────────────────────────

@router.get("/{team_id}/{kind}/history")
def get_chat_history(
    event_id: uuid.UUID,
    team_id: uuid.UUID,
    kind: str,
    token: str = Query(..., description="Portal JWT"),
    db: Session = Depends(get_db),
):
    resolved_kind = _resolve_kind(kind)
    _check_event(event_id, db)
    _authorize_from_token(event_id, db, team_id, resolved_kind, token)

    convo = ChatService.get_or_create_conversation(event_id, db, team_id, resolved_kind)
    messages = ChatService.list_messages(event_id, db, convo.id)
    return {
        "conversation_id": str(convo.id),
        "kind": kind,
        "messages": [ChatService.serialize_message(m) for m in messages],
    }


# ── WebSocket: live connection ──────────────────────────────────────────

@router.websocket("/{team_id}/{kind}/ws")
async def chat_websocket(
    websocket: WebSocket,
    event_id: uuid.UUID,
    team_id: uuid.UUID,
    kind: str,
    token: str = Query(...),
):
    # WebSocket routes can't use the normal Depends(get_db) request-scoped
    # session cleanly across the connection's whole lifetime, so a fresh
    # session is opened per DB operation instead (same SessionLocal used by
    # Celery tasks elsewhere in this codebase).
    db = SessionLocal()
    try:
        resolved_kind = _resolve_kind(kind)
        _check_event(event_id, db)
        sender_role, sender_name, participant_id, mentor_id = _authorize_from_token(
            event_id, db, team_id, resolved_kind, token
        )
        convo = ChatService.get_or_create_conversation(event_id, db, team_id, resolved_kind)
    except HTTPException as exc:
        db.close()
        # Reject before accept() — client sees the close code/reason.
        await websocket.close(code=4403, reason=exc.detail)
        return

    await chat_manager.connect(convo.id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
                body = payload.get("body", "")
            except (json.JSONDecodeError, AttributeError):
                body = raw  # tolerate plain-text frames too

            try:
                msg = ChatService.save_message(
                    event_id, db, convo.id,
                    sender_role=sender_role, sender_name=sender_name, body=body,
                    sender_participant_id=participant_id, sender_mentor_id=mentor_id,
                )
            except HTTPException as exc:
                # Validation error (empty/too-long message) — tell just this
                # client, don't disconnect or broadcast anything.
                await websocket.send_text(json.dumps({"error": exc.detail}))
                continue

            await chat_manager.publish(convo.id, ChatService.serialize_message(msg))
    except WebSocketDisconnect:
        pass
    finally:
        await chat_manager.disconnect(convo.id, websocket)
        db.close()