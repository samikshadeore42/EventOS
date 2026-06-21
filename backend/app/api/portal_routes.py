# File: backend/app/api/portal_routes.py

import os
from fastapi import APIRouter, Depends, Query, HTTPException
from app.core.security import (
    create_access_token,
    decode_access_token,
    get_token_subject,
    parse_uuid_subject,
    verify_token_role,
)
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- 1. Import Bouncer
from app.services.link_service import LinkService
from app.core.auth_deps import RequireOrganizationRole
from datetime import timedelta
from uuid import UUID
from app.services.portal_notification_service import (
    list_for_participant,
    unread_count_for_participant,
    mark_read_by_role,
    mark_all_read_by_role,
    participant_role_key,
)

# FIXED: Added prefix back to lock down this router!
router = APIRouter(prefix="/events/{event_id}/portal", tags=["Portal"])
DEBUG_ROUTES_ENABLED = os.getenv("ENABLE_DEBUG_ROUTES", "false").lower() == "true"


@router.get(
    "/access",
    summary="Portal access via signed JWT link",
    description=(
        "The endpoint all secure email links point to. "
        "Decodes the JWT, identifies the user, and returns their "
        "personalized portal data — team info for participants, "
        "grading interface data for evaluators."
    )
)
def portal_access(
    token: str     = Query(..., description="Signed JWT from email link"),
    scope: ScopedEventService = Depends(get_event_scope)  # <-- 3. Inject Scope
):
    # Pass event_id down to ensure the token actually belongs to this specific event.
    # Then attach the actual scoped event name resolved from /events/{event_id}.
    payload = LinkService.resolve_portal_access(scope.event_id, token=token, db=scope.db)

    if payload.get("participant_id"):
        payload["event_name"] = scope.event.name

    return payload

@router.get("/participant-portal/notifications")
def participant_portal_notifications(
    unread_only: bool = False,
    token: str = Query(...),
    scope: ScopedEventService = Depends(get_event_scope),
):
    payload = decode_access_token(token)
    verify_token_role(payload, "participant")

    if str(payload.get("event_id")) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    participant_id = parse_uuid_subject(get_token_subject(payload), "participant ID")
    rows = list_for_participant(scope.db, scope.event_id, participant_id, unread_only=unread_only)

    return {
        "notifications": [
            {
                "id": str(row.id),
                "title": row.title,
                "message": row.message,
                "notification_type": row.notification_type,
                "read": row.read_at is not None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    }


@router.get("/participant-portal/notifications/unread-count")
def participant_portal_notification_count(
    token: str = Query(...),
    scope: ScopedEventService = Depends(get_event_scope),
):
    payload = decode_access_token(token)
    verify_token_role(payload, "participant")

    if str(payload.get("event_id")) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    participant_id = parse_uuid_subject(get_token_subject(payload), "participant ID")
    return {"unread": unread_count_for_participant(scope.db, scope.event_id, participant_id)}


@router.post("/participant-portal/notifications/{notification_id}/read")
def participant_portal_mark_notification_read(
    notification_id: UUID,
    token: str = Query(...),
    scope: ScopedEventService = Depends(get_event_scope),
):
    payload = decode_access_token(token)
    verify_token_role(payload, "participant")

    if str(payload.get("event_id")) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    participant_id = parse_uuid_subject(get_token_subject(payload), "participant ID")
    roles = [participant_role_key(participant_id), "participant", "all"]
    row = mark_read_by_role(scope.db, scope.event_id, roles, notification_id)

    if not row:
        raise HTTPException(status_code=404, detail="Notification not found.")

    return {"id": str(row.id), "read": row.read_at is not None}


@router.post("/participant-portal/notifications/read-all")
def participant_portal_mark_all_notifications_read(
    token: str = Query(...),
    scope: ScopedEventService = Depends(get_event_scope),
):
    payload = decode_access_token(token)
    verify_token_role(payload, "participant")

    if str(payload.get("event_id")) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    participant_id = parse_uuid_subject(get_token_subject(payload), "participant ID")
    roles = [participant_role_key(participant_id), "participant", "all"]

    return {"marked_read": mark_all_read_by_role(scope.db, scope.event_id, roles)}


@router.post(
    "/generate-links",
    summary="Generate secure access links for all participants or evaluators",
    description="Admin triggers this to generate + email access links to everyone.",
)
def generate_and_dispatch_links(
    role:  str = Query(..., description="participant or evaluator"),
    stage: str = Query(default="evaluation", description="current event stage"),
    send_emails: bool = Query(default=True, description="whether to dispatch emails now"),
    scope: ScopedEventService = Depends(get_event_scope), # <-- FIXED: Added our Phase 2 dependency
    membership = Depends(RequireOrganizationRole('owner', 'admin')) # <-- Awesome Phase 1 teammate dependency!
):
    # if not DEBUG_ROUTES_ENABLED:
        # raise HTTPException(status_code=404, detail="Not found")
    from app.tasks.communications import send_access_links

    if role == "participant":
        # Pass event_id down to the service layer
        links = LinkService.generate_all_participant_links(scope.event_id, scope.db, stage)
        if not links:
            return {
                "generated": 0,
                "emails_queued": False,
                "message": "No participants found in this event. Upload roster before dispatching links."
            }
    elif role == "evaluator":
        # Pass event_id down to the service layer
        links = LinkService.generate_all_evaluator_links(scope.event_id, scope.db, stage)
    else:
        raise HTTPException(status_code=400, detail="role must be 'participant' or 'evaluator'")

    task_id = None
    if send_emails and links:
        # 4. Dynamically inject the event name into the email dispatcher!
        task = send_access_links.delay(
            links=links, 
            role=role, 
            stage=stage,
            event_name=scope.event.name,
            event_id=str(scope.event_id)
        )
        task_id = task.id

    message = "Generated links but dispatch skipped."
    if send_emails and links:
        message = f"{len(links)} links generated and email dispatch queued. Check Communications tab for delivery status."

    return {
        "generated":    len(links),
        "role":         role,
        "stage":        stage,
        "emails_queued": bool(send_emails and links),
        "task_id":      task_id,
        "message":      message,
        "preview":      links[:2] if links else [],   
    }


@router.post(
    "/debug/generate-test-link",
    tags=["Debug"],
    summary="Generate a single test JWT link (debug only, admin-only)",
)
def debug_generate_test_link(
    role: str = Query(default="participant"),
    stage: str = Query(default="evaluation"),
    scope: ScopedEventService = Depends(get_event_scope), # <-- FIXED: Added our Phase 2 dependency
    membership = Depends(RequireOrganizationRole('owner', 'admin')) # <-- Awesome Phase 1 teammate dependency!
):
    if not DEBUG_ROUTES_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    import uuid
    # 5. Embed the event_id directly into the debug token
    token = create_access_token(
        subject=str(uuid.uuid4()),
        role=role,
        stage=stage,
        event_id=str(scope.event_id),
        expires_in=timedelta(hours=1)
    )
    return {
        "token":      token,
        "portal_url": f"http://localhost:8000/events/{scope.event_id}/portal/access?token={token}",
        "note":       "This is a debug token. Portal will return 404 since the entity doesn't exist in DB."
    }