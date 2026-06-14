# File: backend/app/api/participant_routes.py

import uuid
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io

from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- Import the Bouncer
from app.services.participant_service import ParticipantService
from app.schemas.participant_crud_schemas import (
    ParticipantCreateRequest,
    ParticipantUpdateRequest,
    ParticipantResponse,
    PaginatedParticipants,
    ParticipantFilter,
    ParticipantSortField,
    CSVUploadResponse,
    RosterSummary,
    ProgressionConfirmRequest,
)

# 1. Update Prefix to enforce event_id in the URL
router = APIRouter(prefix="/events/{event_id}/participants", tags=["Participants"])

# ── GET /participants — paginated list ───────────────────────────────

@router.get(
    "",
    response_model=PaginatedParticipants,
    summary="List all participants with filtering and pagination",
)
def list_participants(
    institution:    str | None  = Query(default=None),
    team_assigned:  bool | None = Query(default=None, description="True=assigned, False=unassigned"),
    search:         str | None  = Query(default=None, description="Search by name or email"),
    page:           int         = Query(default=1,  ge=1),
    page_size:      int         = Query(default=20, ge=1, le=100),
    sort_by:        ParticipantSortField = Query(default=ParticipantSortField.CREATED_AT),
    sort_desc:      bool        = Query(default=True),
    # 2. Inject the Event Scope
    scope:          ScopedEventService = Depends(get_event_scope),
):
    filters = ParticipantFilter(
        institution   = institution,
        team_assigned = team_assigned,
        search        = search,
        page          = page,
        page_size     = page_size,
        sort_by       = sort_by,
        sort_desc     = sort_desc,
    )
    # Pass event_id and scoped DB to the service
    return ParticipantService.list_participants(scope.event_id, filters, scope.db)


# ── GET /participants/roster/summary ─────────────────────────────────

@router.get(
    "/roster/summary",
    response_model=RosterSummary,
    summary="Aggregated roster stats for the admin dashboard",
)
def get_roster_summary(scope: ScopedEventService = Depends(get_event_scope)):
    return ParticipantService.get_roster_summary(scope.event_id, scope.db)


# ── GET /participants/csv-template — downloadable CSV template ────────

@router.get(
    "/csv-template",
    summary="Download a blank CSV template for roster upload",
)
def download_csv_template(scope: ScopedEventService = Depends(get_event_scope)):
    template = (
        "first_name,last_name,email,institution,"
        "python,ml,frontend,embedded,hardware,dsp\n"
        "Jane,Doe,jane@example.com,IIT Example,"
        "7.0,6.5,8.0,3.0,2.0,1.0\n"
    )
    return StreamingResponse(
        io.StringIO(template),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=eventos_roster_template.csv"
        }
    )


# ── POST /participants/upload — CSV bulk upload ───────────────────────

@router.post(
    "/upload",
    response_model=CSVUploadResponse,
    status_code=201,
    summary="Upload a CSV roster file",
)
def upload_csv(
    file:   UploadFile = File(..., description="CSV file with participant roster"),
    upsert: bool       = Query(default=False, description="Update existing participants by email"),
    scope:  ScopedEventService = Depends(get_event_scope),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only .csv files are accepted."
        )

    content = file.file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum size is 5MB."
        )

    return ParticipantService.process_csv_upload(scope.event_id, content, upsert, scope.db)


# ── GET /participants/{id} — single participant ───────────────────────

@router.get(
    "/{participant_id}",
    response_model=ParticipantResponse,
    summary="Get a single participant by ID",
)
def get_participant(
    participant_id: uuid.UUID,
    scope:          ScopedEventService = Depends(get_event_scope),
):
    p = ParticipantService.get_by_id(scope.event_id, participant_id, scope.db)
    data = ParticipantResponse.model_validate(p)

    # Enrich with team name securely
    if p.team_id:
        from app.models.participant import Team
        # Add event_id safety net here too
        team = scope.db.query(Team).filter(
            Team.id == p.team_id, 
            Team.event_id == scope.event_id
        ).first()
        
        if team and team.approval_status == "published":
            data.team_name = team.team_name
        else:
            data.team_name = None

    return data


# ── POST /participants — create single participant ────────────────────

@router.post(
    "",
    response_model=ParticipantResponse,
    status_code=201,
    summary="Register a single participant",
)
def create_participant(
    body:  ParticipantCreateRequest,
    scope: ScopedEventService = Depends(get_event_scope),
):
    p    = ParticipantService.create(scope.event_id, body, scope.db)
    data = ParticipantResponse.model_validate(p)

    # 3. Dynamic email adaptation!
    try:
        from app.tasks.communications import send_registration_email
        send_registration_email.delay(
            to_email         = p.email,
            participant_name = f"{p.first_name} {p.last_name}",
            event_name       = scope.event.name  # Dynamically pull the event name!
        )
    except Exception:
        pass  

    return data


# ── PATCH /participants/{id} — update participant ─────────────────────

@router.patch(
    "/{participant_id}",
    response_model=ParticipantResponse,
    summary="Partially update a participant",
)
def update_participant(
    participant_id: uuid.UUID,
    body:           ParticipantUpdateRequest,
    scope:          ScopedEventService = Depends(get_event_scope),
):
    p = ParticipantService.update(scope.event_id, participant_id, body, scope.db)
    return ParticipantResponse.model_validate(p)


# ── DELETE /participants/{id} — delete participant ────────────────────

@router.delete(
    "/{participant_id}",
    summary="Delete a participant",
)
def delete_participant(
    participant_id: uuid.UUID,
    scope:          ScopedEventService = Depends(get_event_scope),
):
    return ParticipantService.delete(scope.event_id, participant_id, scope.db)


@router.post(
    "/{participant_id}/confirm-progression",
    response_model=ParticipantResponse,
    summary="Confirm or decline progression invitation for qualifying teams",
)
def confirm_progression(
    participant_id: uuid.UUID,
    body:           ProgressionConfirmRequest,
    scope:          ScopedEventService = Depends(get_event_scope),
):
    p = ParticipantService.confirm_progression(scope.event_id, participant_id, body.confirmed, scope.db)
    return ParticipantResponse.model_validate(p)