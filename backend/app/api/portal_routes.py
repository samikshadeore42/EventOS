# File: backend/app/api/portal_routes.py

import os
from fastapi import APIRouter, Depends, Query, HTTPException
from app.core.security import create_access_token
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- 1. Import Bouncer
from app.services.link_service import LinkService
from app.core.auth_deps import RequireOrganizationRole
from datetime import timedelta

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
    # Pass event_id down to ensure the token actually belongs to this specific event
    return LinkService.resolve_portal_access(scope.event_id, token=token, db=scope.db)


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