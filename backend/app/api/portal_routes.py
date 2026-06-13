# File: backend/app/api/portal_routes.py

import os
from fastapi import HTTPException
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import create_access_token
from app.services.link_service import LinkService
from app.core.auth_deps import RequireOrganizationRole
from datetime import timedelta

router = APIRouter(prefix="/portal", tags=["Portal"])
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
    db:    Session = Depends(get_db)
):
    return LinkService.resolve_portal_access(token=token, db=db)


@router.post(
    "/generate-links",
    summary="Generate secure access links for all participants or evaluators",
    description="Admin triggers this to generate + email access links to everyone.",
)
def generate_and_dispatch_links(
    
    role:  str = Query(..., description="participant or evaluator"),
    stage: str = Query(default="evaluation", description="current event stage"),
    send_emails: bool = Query(default=True, description="whether to dispatch emails now"),
    db:    Session = Depends(get_db),
    membership = Depends(RequireOrganizationRole('owner', 'admin'))
):
    if not DEBUG_ROUTES_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    from app.tasks.communications import send_access_links

    if role == "participant":
        links = LinkService.generate_all_participant_links(db, stage)
        if not links:
            return {
                "generated": 0,
                "emails_queued": False,
                "message": "No participants found. Upload roster before dispatching links."
            }
    elif role == "evaluator":
        links = LinkService.generate_all_evaluator_links(db, stage)
    else:
        raise HTTPException(status_code=400, detail="role must be 'participant' or 'evaluator'")

    task_id = None
    if send_emails and links:
        task = send_access_links.delay(links=links, role=role, stage=stage)
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
        "preview":      links[:2] if links else [],   # show first 2 for debug
    }


@router.post(
    "/debug/generate-test-link",
    tags=["Debug"],
    summary="Generate a single test JWT link (debug only, admin-only)",
)
def debug_generate_test_link(
    role: str = Query(default="participant"),
    stage: str = Query(default="evaluation"),
    membership = Depends(RequireOrganizationRole('owner', 'admin'))
):
    if not DEBUG_ROUTES_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    import uuid
    token = create_access_token(
        subject=str(uuid.uuid4()),
        role=role,
        stage=stage,
        expires_in=timedelta(hours=1)
    )
    return {
        "token":      token,
        "portal_url": f"http://localhost:8000/portal/access?token={token}",
        "note":       "This is a debug token with a random UUID subject. Portal will return 404 since the entity doesn't exist in DB."
    }