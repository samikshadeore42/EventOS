from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.event_state_service import (
    get_event_state, set_stage, next_stage, previous_stage, reset_stage, STAGES
)
from pydantic import BaseModel


router = APIRouter(prefix="/event-state", tags=["Event State Controls"])

class SetStageRequest(BaseModel):
    stage: str

@router.get("")
def get_state_endpoint(db: Session = Depends(get_db)):
    state = get_event_state(db)
    return {
        "current_stage": state.current_stage, 
        "manual_override_enabled": state.manual_override_enabled,
        "event_name":getattr(state,"event_name","Demo Event")
    }

@router.post("/set", summary="Jump directly to a specific stage")
def set_stage_endpoint(req: SetStageRequest, db: Session = Depends(get_db)):
    try:
        state = set_stage(db, req.stage)
        return {"current_stage": state.current_stage,"message": f"Jumped to {state.current_stage}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/next",)
def next_stage_endpoint(db: Session = Depends(get_db)):
    try:
        state = next_stage(db)
        return {"current_stage": state.current_stage,"message": "Advanced to next stage"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/previous")
def previous_stage_endpoint(db: Session = Depends(get_db)):
    try:
        state = previous_stage(db)
        return {"current_stage": state.current_stage,"message": "Rolled back to previous stage"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/reset")
def reset_stage_endpoint(db: Session = Depends(get_db)):
    state = reset_stage(db)
    return {"current_stage": state.current_stage, "message": "Event reset to registration"}
