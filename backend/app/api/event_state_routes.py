from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.event_state_service import (
    get_event_state, set_stage, next_stage, previous_stage, reset_stage, STAGES
)
from pydantic import BaseModel

router = APIRouter(prefix="/event-state", tags=["Event State"])

class SetStageRequest(BaseModel):
    stage: str

@router.get("")
def get_state_endpoint(db: Session = Depends(get_db)):
    state = get_event_state(db)
    return {"current_stage": state.current_stage, "manual_override_enabled": state.manual_override_enabled}

@router.post("/set")
def set_stage_endpoint(req: SetStageRequest, db: Session = Depends(get_db)):
    try:
        state = set_stage(db, req.stage)
        return {"current_stage": state.current_stage}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/next")
def next_stage_endpoint(db: Session = Depends(get_db)):
    state = next_stage(db)
    return {"current_stage": state.current_stage}

@router.post("/previous")
def previous_stage_endpoint(db: Session = Depends(get_db)):
    state = previous_stage(db)
    return {"current_stage": state.current_stage}

@router.post("/reset")
def reset_stage_endpoint(db: Session = Depends(get_db)):
    state = reset_stage(db)
    return {"current_stage": state.current_stage}
