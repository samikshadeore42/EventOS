# File: backend/app/api/portal_routes.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import create_access_token
from app.services.link_service import LinkService
from datetime import timedelta

router = APIRouter(prefix="/portal", tags=["Portal"])


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
    db:    Session = Depends(get_db)
):
    from app.tasks.communications import send_access_links

    if role == "participant":
        links = LinkService.generate_all_participant_links(db, stage)
    elif role == "evaluator":
        links = LinkService.generate_all_evaluator_links(db, stage)
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="role must be 'participant' or 'evaluator'")

    if send_emails and links:
        send_access_links.delay(links=links, role=role, stage=stage)

    return {
        "generated":    len(links),
        "role":         role,
        "stage":        stage,
        "emails_queued": send_emails and len(links) > 0,
        "message":      "Email dispatch queued." if (send_emails and len(links) > 0) else "Generated links but dispatch skipped.",
        "preview":      links[:2] if links else [],   # show first 2 for debug
    }


@router.post(
    "/debug/generate-test-link",
    tags=["Debug"],
    summary="Generate a single test JWT link (debug only)",
)
def debug_generate_test_link(
    role: str = Query(default="participant"),
    stage: str = Query(default="evaluation")
):
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