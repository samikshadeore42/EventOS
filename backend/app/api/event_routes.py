# File: backend/app/api/event_routes.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.models.event_config import EventConfig, PIPELINE_STAGES

router = APIRouter(prefix="/event", tags=["Event Configuration"])


def _get_or_create_config(db: Session) -> EventConfig:
    """Returns the single event config row, creating it if it doesn't exist."""
    config = db.query(EventConfig).first()
    if not config:
        config = EventConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("/config", summary="Get current event configuration and stage")
def get_event_config(db: Session = Depends(get_db)):
    config = _get_or_create_config(db)
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


@router.patch("/config/stage", summary="Advance to the next stage (or set explicitly)")
def update_stage(
    stage: Optional[str] = None,
    db: Session = Depends(get_db)
):
    config = _get_or_create_config(db)

    if stage:
        if stage not in PIPELINE_STAGES:
            raise HTTPException(status_code=422,
                detail=f"Invalid stage '{stage}'. Valid: {PIPELINE_STAGES}")
        config.current_stage = stage
    else:
        # Advance to next
        current_idx = PIPELINE_STAGES.index(config.current_stage) \
            if config.current_stage in PIPELINE_STAGES else 0
        if current_idx >= len(PIPELINE_STAGES) - 1:
            raise HTTPException(status_code=400, detail="Already at final stage.")
        config.current_stage = PIPELINE_STAGES[current_idx + 1]

    db.commit()
    db.refresh(config)
    return {"message": f"Stage updated to '{config.current_stage}'.",
            "current_stage": config.current_stage}


@router.patch("/config/rules", summary="Update distribution rules")
def update_rules(body: dict, db: Session = Depends(get_db)):
    config = _get_or_create_config(db)
    updated = dict(config.distribution_rules)
    updated.update(body)
    config.distribution_rules = updated
    db.commit()
    return {"message": "Rules updated.", "distribution_rules": config.distribution_rules}

# ── POST /events/create-from-config ──────────────────────────────────
# Called by the frontend after the LangGraph agent returns is_complete=True.
# Takes the structured config JSON and saves it to the event_config table.

from app.schemas.langgraph_schemas import EventConfig as LangGraphEventConfig

@router.post(
    "/create-from-config",
    summary="Save LangGraph-generated event config to the database",
)
def create_event_from_config(
    body: LangGraphEventConfig,
    db: Session = Depends(get_db),
):
    config = db.query(EventConfig).first()
    if not config:
        config = EventConfig()
        db.add(config)

    # Write all 7 fields from the agent's output
    config.event_name     = body.event_name
    config.current_stage  = "registration"   # always start at registration

    # Store the agent fields that don't have dedicated columns in JSONB
    config.distribution_rules = {
        # Keep existing solver fields with defaults
        "team_size":           body.team_size,
        "k_min":               body.team_size - 1,
        "k_max":               body.team_size + 1,
        "max_per_institution": 1,
        "skill_balance":       True,
        # Store the extra agent fields here
        "rounds":              body.rounds,
        "stages":              body.stages,
        "scoring_weights":     body.scoring_weights,
        "elimination":         body.elimination,
        "approval_gates":      body.approval_gates,
    }

    db.commit()
    db.refresh(config)

    return {
        "event_id":    str(config.id),
        "event_name":  config.event_name,
        "status":      "created",
        "message":     f"Event '{config.event_name}' saved successfully.",
    }