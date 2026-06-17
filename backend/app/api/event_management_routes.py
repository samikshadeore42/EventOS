# File: backend/app/api/event_management_routes.py
import re
import uuid as uuid_lib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth_deps import RequireOrganizationRole
from app.core.capabilities import validate_capabilities
from app.core.database import get_db
from app.models.event import Event, EventStatus
from app.models.stage_definition import StageDefinition
from app.models.template import Template
from app.schemas.event import EventCreate, EventResponse, TemplateResponse
from app.schemas.langgraph_schemas import EventConfig as LangGraphEventConfig, CreateFromConfigResponse


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


def _stage_key(value: str, fallback: str) -> str:
    key = re.sub(r"[^a-z0-9_]+", "_", (value or fallback).strip().lower().replace(" ", "_"))
    return key.strip("_") or fallback


def _stage_description(stage_key: str, stage_name: str) -> str:
    descriptions = {
        "registration": "Participant registration, CSV roster intake, and eligibility verification.",
        "team_formation": "Team generation, team review, and approval workflow.",
        "development": "Teams build their project while mentors track progress.",
        "submission": "Teams upload final project files and supporting material.",
        "evaluation": "Judges review assigned teams and submit scorecards.",
        "review": "Judges review submissions and scoring evidence.",
        "presentation": "Teams present their solution for evaluation.",
        "results": "Leaderboard review, result finalization, and winner announcement.",
        "fixtures": "Tournament fixture generation and match schedule preparation.",
        "matches": "Tournament matches, score tracking, and progression.",
        "coding": "Contestants solve coding problems and submit solutions.",
        "competition": "Core competition window for submissions and scoring.",
        "case_solving": "Teams analyze the case and prepare their recommendation.",
    }
    return descriptions.get(stage_key, f"{stage_name} stage for this event.")


def _stage_capabilities(stage_key: str, active_capabilities: list[str]) -> list[str]:
    desired_by_stage = {
        "registration": ["teams"],
        "team_formation": ["teams"],
        "development": ["mentors"],
        "submission": ["submissions"],
        "evaluation": ["evaluators", "weighted_scoring", "presentation_evaluation"],
        "review": ["evaluators", "weighted_scoring", "live_scoring"],
        "presentation": ["presentation_evaluation", "evaluators"],
        "results": ["leaderboard", "weighted_scoring", "live_scoring"],
        "fixtures": ["fixtures"],
        "matches": ["matches", "live_scoring", "elimination"],
        "coding": ["submissions", "live_scoring", "evaluators"],
        "competition": ["teams", "submissions", "evaluators"],
        "case_solving": ["teams", "submissions"],
    }
    enabled = set(active_capabilities or [])
    return [cap for cap in desired_by_stage.get(stage_key, []) if cap in enabled]


def _materialize_stage_definitions(
    db: Session,
    event: Event,
    suggested_stages: list,
    active_capabilities: list[str],
) -> None:
    if not suggested_stages:
        return

    cursor = datetime.now(timezone.utc) + timedelta(hours=1)
    seen_keys: set[str] = set()

    for index, raw_stage in enumerate(suggested_stages, start=1):
        if isinstance(raw_stage, dict):
            raw_key = raw_stage.get("key") or raw_stage.get("name") or f"stage_{index}"
            name = raw_stage.get("name") or str(raw_key).replace("_", " ").title()
            ratio = float(raw_stage.get("ratio") or 0)
        else:
            raw_key = str(raw_stage)
            name = raw_key.replace("_", " ").title()
            ratio = 0

        key = _stage_key(str(raw_key), f"stage_{index}")
        if key in seen_keys:
            key = f"{key}_{index}"
        seen_keys.add(key)

        duration_hours = max(1, round((ratio or 0.2) * 24))
        start_at = cursor
        end_at = start_at + timedelta(hours=duration_hours)
        cursor = end_at

        db.add(StageDefinition(
            event_id=event.id,
            key=key,
            name=name,
            description=_stage_description(key, name),
            position=index,
            start_at=start_at,
            end_at=end_at,
            timezone="Asia/Kolkata",
            transition_policy="manual",
            reminder_policy={},
            required_capabilities=_stage_capabilities(key, active_capabilities),
            is_active=True,
        ))


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
    db.flush()
    _materialize_stage_definitions(
        db=db,
        event=event,
        suggested_stages=list(template.suggested_stages or []),
        active_capabilities=capabilities,
    )
    db.commit()
    db.refresh(event)
    return event


# ── POST /events/create-from-config ──────────────────────────────────────────
# Called by the ConfigureEvent page after LangGraph returns is_complete=True.
# Creates a real Event row in the org from the agent's structured JSON output.

@router.post(
    "/events/create-from-config",
    response_model=CreateFromConfigResponse,
    status_code=201,
    summary="Create an event from a LangGraph-generated config",
    description=(
        "Takes the structured JSON produced by POST /ai/configure-event (when "
        "is_complete=True) and creates a proper Event row in the database, "
        "scoped to the admin's organisation. The event starts in DRAFT status. "
        "scoring_weights, stages, rounds, elimination, and approval_gates are "
        "stored in the event's configuration JSONB column."
    ),
)
def create_event_from_config(
    body: LangGraphEventConfig,
    db: Session = Depends(get_db),
    membership=Depends(RequireOrganizationRole("owner", "admin")),
):
    # Build a URL-safe slug from the event name + short uuid suffix to avoid collisions
    raw_slug = _slug(body.event_name)
    event_slug = f"{raw_slug}-{str(uuid_lib.uuid4())[:8]}"

    # Use hackathon template or fall back to generic
    template = _template_for_event_type(db, body.event_type)
    capabilities = validate_capabilities(list(template.default_capabilities or []))

    # Pack all agent-extracted fields into the configuration JSONB
    configuration = {
        "rounds":              body.rounds,
        "stages":              body.stages,
        "team_size":           body.team_size,
        "scoring_weights":     body.scoring_weights,
        "elimination":         body.elimination,
        "approval_gates":      body.approval_gates,
        # Solver-compatible keys derived from team_size
        "k_min":               max(2, body.team_size - 1),
        "k_max":               body.team_size + 1,
        "max_per_institution": 1,
        "skill_balance":       True,
        "_source":             "langgraph_agent",
        "event_type": body.event_type,
    }

    event = Event(
        organization_id=membership.organization_id,
        name=body.event_name.strip(),
        slug=event_slug,
        description=(
            f"Created via AI configuration assistant. "
            f"{body.rounds} round(s), team size {body.team_size}."
        ),
        event_type=template.key,
        template_id=template.id,
        template_version=template.version,
        active_capabilities=capabilities,
        configuration=configuration,
        status=EventStatus.DRAFT,
        is_legacy=False,
    )

    db.add(event)
    db.flush()
    _materialize_stage_definitions(
        db=db,
        event=event,
        suggested_stages=list(body.stages or template.suggested_stages or []),
        active_capabilities=capabilities,
    )
    db.commit()
    db.refresh(event)

    return CreateFromConfigResponse(
        event_id=str(event.id),
        event_name=event.name,
        status="created",
        message=(
            f"Event '{event.name}' created successfully. "
            f"You can now manage it from the dashboard."
        ),
    )