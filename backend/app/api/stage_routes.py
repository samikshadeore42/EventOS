# backend/app/api/stage_routes.py
import uuid
from typing import List

from fastapi import APIRouter, Depends, status

from app.core.auth_deps import get_current_user
from app.models.user import User
from app.services.event_scope import ScopedEventService, get_event_scope
from app.services.stage_service import StageService
from app.schemas.stage_schemas import (
    StageDefinitionCreate,
    StageDefinitionResponse,
    StageDefinitionUpdate,
    StageReorderRequest,
    StageRunResponse,
    ScheduleValidationReport,
)

# Router is mounted in main.py under `legacy_dependency` (RequireOrganizationRole
# 'owner','admin'), so owner/admin is already enforced at the include level.
# NOTE: literal sub-paths (/validation, /reorder, /runs) are declared BEFORE the
# parameterised /{stage_id} routes so Starlette matches them first.
router = APIRouter(prefix="/events/{event_id}/stages", tags=["Stages"])


def _svc(scope: ScopedEventService) -> StageService:
    return StageService(db=scope.db, event_id=scope.event_id)


# ── collection ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[StageDefinitionResponse])
def list_stages(scope: ScopedEventService = Depends(get_event_scope)):
    return _svc(scope).list_stage_definitions()


@router.post("", response_model=StageDefinitionResponse, status_code=status.HTTP_201_CREATED)
def create_stage(
    data: StageDefinitionCreate,
    scope: ScopedEventService = Depends(get_event_scope),
):
    return _svc(scope).create_stage_definition(data.model_dump())


# ── literal sub-paths (must precede /{stage_id}) ─────────────────────────────

@router.get("/validation", response_model=ScheduleValidationReport)
def validate_schedule(scope: ScopedEventService = Depends(get_event_scope)):
    """Read-only Hard-Gate preflight. The committee dashboard calls this to show
    live green/red status without attempting a publish."""
    return _svc(scope).validate_schedule()


@router.post("/reorder", response_model=List[StageDefinitionResponse])
def reorder_stages(
    body: StageReorderRequest,
    scope: ScopedEventService = Depends(get_event_scope),
    actor: User = Depends(get_current_user),
):
    return _svc(scope).reorder_stages(body.ordered_ids, actor_user_id=actor.id)


@router.get("/runs", response_model=List[StageRunResponse])
def list_stage_runs(scope: ScopedEventService = Depends(get_event_scope)):
    return _svc(scope).list_stage_runs()


@router.post("/runs/generate")
def generate_stage_runs(scope: ScopedEventService = Depends(get_event_scope)):
    created = _svc(scope).generate_stage_runs()
    return {"message": "Stage runs generated", "runs_created": created}


# ── single stage ─────────────────────────────────────────────────────────────

@router.get("/{stage_id}", response_model=StageDefinitionResponse)
def get_stage(stage_id: uuid.UUID, scope: ScopedEventService = Depends(get_event_scope)):
    return _svc(scope).get_stage_definition(stage_id)


@router.patch("/{stage_id}", response_model=StageDefinitionResponse)
def update_stage(
    stage_id: uuid.UUID,
    data: StageDefinitionUpdate,
    scope: ScopedEventService = Depends(get_event_scope),
    actor: User = Depends(get_current_user),
):
    return _svc(scope).update_stage_definition(
        stage_id, data.model_dump(exclude_unset=True), actor_user_id=actor.id,
    )


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(
    stage_id: uuid.UUID,
    scope: ScopedEventService = Depends(get_event_scope),
    actor: User = Depends(get_current_user),
):
    _svc(scope).delete_stage_definition(stage_id, actor_user_id=actor.id)
    return None


@router.post("/{stage_id}/advance", response_model=StageRunResponse)
def advance_stage(
    stage_id: uuid.UUID,
    force: bool = False,
    scope: ScopedEventService = Depends(get_event_scope),
    actor: User = Depends(get_current_user),
):
    return _svc(scope).advance_stage(stage_id, actor_user_id=actor.id, force=force)


@router.post("/{stage_id}/approve", response_model=StageRunResponse)
def approve_stage(
    stage_id: uuid.UUID,
    scope: ScopedEventService = Depends(get_event_scope),
    actor: User = Depends(get_current_user),
):
    """Phase 6 approval gate: release a stage that is awaiting_approval (a manual
    transition that reached its start time) so it becomes active."""
    return _svc(scope).approve_stage(stage_id, actor_user_id=actor.id)