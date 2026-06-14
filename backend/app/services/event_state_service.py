# File: backend/app/services/event_state_service.py
import uuid
from sqlalchemy.orm import Session
from app.models.event_state import EventState
from app.models.event_config import EventConfig

STAGES = ["registration", "team_formation", "evaluation", "results"]

def get_event_state(event_id: uuid.UUID, db: Session):
    # Scope to specific event
    state = db.query(EventState).filter(EventState.event_id == event_id).first()
    if not state:
        # Bind new state to the event
        state = EventState(event_id=event_id, current_stage="registration")
        db.add(state)
        db.commit()
        db.refresh(state)
    return state

def _sync_event_config(event_id: uuid.UUID, db: Session, stage: str):
    # Scope to specific event
    config = db.query(EventConfig).filter(EventConfig.event_id == event_id).first()
    if config:
        config.current_stage = stage

def set_stage(event_id: uuid.UUID, db: Session, stage: str):
    if stage not in STAGES:
        raise ValueError(f"Invalid stage. Allowed stages: {STAGES}")
    state = get_event_state(event_id, db)
    state.current_stage = stage
    _sync_event_config(event_id, db, stage)
    db.commit()
    db.refresh(state)
    return state

def next_stage(event_id: uuid.UUID, db: Session):
    state = get_event_state(event_id, db)
    idx = STAGES.index(state.current_stage)
    if idx < len(STAGES) - 1:
        state.current_stage = STAGES[idx + 1]
        _sync_event_config(event_id, db, state.current_stage)
        db.commit()
        db.refresh(state)
        return state
    raise ValueError("Already at final stage.")

def previous_stage(event_id: uuid.UUID, db: Session):
    state = get_event_state(event_id, db)
    idx = STAGES.index(state.current_stage)
    if idx > 0:
        state.current_stage = STAGES[idx - 1]
        _sync_event_config(event_id, db, state.current_stage)
        db.commit()
        db.refresh(state)
        return state
    raise ValueError("Already at first stage.")

def reset_stage(event_id: uuid.UUID, db: Session):
    return set_stage(event_id, db, "registration")