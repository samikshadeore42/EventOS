# File: backend/app/api/event_routes.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- Import Bouncer
from app.models.event_config import EventConfig, PIPELINE_STAGES

# Update Prefix
router = APIRouter(prefix="/events/{event_id}/config", tags=["Event Configuration"])


def _get_or_create_config(event_id: uuid.UUID, db: Session) -> EventConfig:
    """Returns the single event config row, creating it securely if it doesn't exist."""
    # Scope query to event_id
    config = db.query(EventConfig).filter(EventConfig.event_id == event_id).first()
    if not config:
        config = EventConfig(event_id=event_id) # Bind to event
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("", summary="Get current event configuration and stage")
def get_event_config(scope: ScopedEventService = Depends(get_event_scope)):
    config = _get_or_create_config(scope.event_id, scope.db)
    current_idx = PIPELINE_STAGES.index(config.current_stage) \
        if config.current_stage in PIPELINE_STAGES else 0
    return {
        "event_name":         config.event_name,
        "current_stage":      config.current_stage,
        "current_stage_index": current_idx,
        "total_stages":       len(PIPELINE_STAGES),
        "pipeline":           [
            {
                "stage":      s,
                "index":      i,
                "status": (
                    "completed" if i < current_idx else
                    "active"    if i == current_idx else
                    "pending"
                )
            }
            for i, s in enumerate(PIPELINE_STAGES)
        ],
        "distribution_rules": config.distribution_rules,
        "updated_at":         config.updated_at.isoformat(),
    }


@router.patch("/stage", summary="Advance to the next stage (or set explicitly)")
def update_stage(
    stage: Optional[str] = None,
    scope: ScopedEventService = Depends(get_event_scope)
):
    config = _get_or_create_config(scope.event_id, scope.db)

    if stage:
        if stage not in PIPELINE_STAGES:
            raise HTTPException(status_code=422,
                detail=f"Invalid stage '{stage}'. Valid: {PIPELINE_STAGES}")
        config.current_stage = stage
    else:
        current_idx = PIPELINE_STAGES.index(config.current_stage) \
            if config.current_stage in PIPELINE_STAGES else 0
        if current_idx >= len(PIPELINE_STAGES) - 1:
            raise HTTPException(status_code=400, detail="Already at final stage.")
        config.current_stage = PIPELINE_STAGES[current_idx + 1]

    scope.db.commit()
    scope.db.refresh(config)
    return {"message": f"Stage updated to '{config.current_stage}'.",
            "current_stage": config.current_stage}


@router.patch("/rules", summary="Update distribution rules")
def update_rules(
    body: dict, 
    scope: ScopedEventService = Depends(get_event_scope)
):
    config = _get_or_create_config(scope.event_id, scope.db)
    updated = dict(config.distribution_rules)
    updated.update(body)
    config.distribution_rules = updated
    scope.db.commit()
    return {"message": "Rules updated.", "distribution_rules": config.distribution_rules}