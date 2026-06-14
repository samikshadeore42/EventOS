# File: backend/app/api/event_management_routes.py
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth_deps import RequireOrganizationRole
from app.core.capabilities import validate_capabilities
from app.core.database import get_db
from app.models.event import Event, EventStatus
from app.models.template import Template
from app.schemas.event import EventCreate, EventResponse, TemplateResponse


router = APIRouter(tags=["Events"])


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower().replace(" ", "-"))
    return cleaned.strip("-")


def _template_for_event_type(db: Session, event_type: str) -> Template:
    key = event_type.strip().lower().replace(" ", "_")
    template = db.query(Template).filter(
        Template.key == key,
        Template.is_system_template == True,
    ).order_by(Template.version.desc()).first()

    if template:
        return template

    fallback = db.query(Template).filter(
        Template.key == "generic_competitive_event",
        Template.is_system_template == True,
    ).order_by(Template.version.desc()).first()

    if not fallback:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Generic competitive event template is missing.",
        )

    return fallback


@router.get("/templates", response_model=list[TemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    membership=Depends(RequireOrganizationRole("owner", "admin", "member")),
):
    return db.query(Template).filter(
        Template.is_system_template == True,
    ).order_by(Template.name.asc()).all()


@router.get("/events", response_model=list[EventResponse])
def list_events(
    db: Session = Depends(get_db),
    membership=Depends(RequireOrganizationRole("owner", "admin", "member")),
):
    return db.query(Event).filter(
        Event.organization_id == membership.organization_id,
    ).order_by(Event.created_at.desc()).all()


@router.post("/events", response_model=EventResponse, status_code=201)
def create_event(
    body: EventCreate,
    db: Session = Depends(get_db),
    membership=Depends(RequireOrganizationRole("owner", "admin")),
):
    event_slug = _slug(body.slug)

    existing = db.query(Event).filter(
        Event.organization_id == membership.organization_id,
        Event.slug == event_slug,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An event with this slug already exists in this organization.",
        )

    if body.template_id:
        template = db.query(Template).filter(Template.id == body.template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found.")
    else:
        template = _template_for_event_type(db, body.event_type)

    capabilities = validate_capabilities(list(template.default_capabilities or []))

    event = Event(
        organization_id=membership.organization_id,
        name=body.name.strip(),
        slug=event_slug,
        description=body.description,
        event_type=template.key,
        template_id=template.id,
        template_version=template.version,
        active_capabilities=capabilities,
        configuration=dict(body.configuration or {}),
        status=EventStatus.DRAFT,
        is_legacy=False,
    )

    db.add(event)
    db.commit()
    db.refresh(event)
    return event