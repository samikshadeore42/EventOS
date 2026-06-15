import uuid
from typing import List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope
from app.services.stage_service import StageService

router = APIRouter(prefix="/events/{event_id}/stages", tags=["Stages"])

class StageDefinitionCreate(BaseModel):
    key: str
    name: str
    description: str | None = None
    position: int
    start_at: datetime
    end_at: datetime
    timezone: str = "Asia/Kolkata"
    transition_policy: str = "manual"
    reminder_policy: dict = Field(default_factory=dict)
    required_capabilities: list = Field(default_factory=list)
    is_active: bool = True

class StageDefinitionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    is_active: bool | None = None

@router.get("")
def list_stages(scope: ScopedEventService = Depends(get_event_scope)):
    svc = StageService(db=scope.db, event_id=scope.event_id)
    return svc.list_stage_definitions()

@router.post("", status_code=status.HTTP_201_CREATED)
def create_stage(
    data: StageDefinitionCreate,
    scope: ScopedEventService = Depends(get_event_scope)
):
    # TODO: Add role checking for admin/owner
    svc = StageService(db=scope.db, event_id=scope.event_id)
    return svc.create_stage_definition(data.model_dump(exclude_unset=True))

@router.patch("/{stage_id}")
def update_stage(
    stage_id: uuid.UUID,
    data: StageDefinitionUpdate,
    scope: ScopedEventService = Depends(get_event_scope)
):
    svc = StageService(db=scope.db, event_id=scope.event_id)
    return svc.update_stage_definition(stage_id, data.model_dump(exclude_unset=True))

@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(
    stage_id: uuid.UUID,
    scope: ScopedEventService = Depends(get_event_scope)
):
    svc = StageService(db=scope.db, event_id=scope.event_id)
    svc.delete_stage_definition(stage_id)
    return None

@router.get("/runs")
def list_stage_runs(scope: ScopedEventService = Depends(get_event_scope)):
    svc = StageService(db=scope.db, event_id=scope.event_id)
    return svc.list_stage_runs()

@router.post("/runs/generate")
def generate_stage_runs(scope: ScopedEventService = Depends(get_event_scope)):
    svc = StageService(db=scope.db, event_id=scope.event_id)
    svc.generate_stage_runs()
    return {"message": "Stage runs generated"}

@router.post("/{stage_id}/advance")
def advance_stage(
    stage_id: uuid.UUID,
    scope: ScopedEventService = Depends(get_event_scope)
):
    svc = StageService(db=scope.db, event_id=scope.event_id)
    return svc.advance_stage(stage_id)
