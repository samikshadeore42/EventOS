from sqlalchemy.orm import Session
from app.models.event_state import EventState

STAGES = ["registration", "team_formation", "evaluation", "results"]

def get_event_state(db: Session):
    state = db.query(EventState).first()
    if not state:
        state = EventState(current_stage="registration")
        db.add(state)
        db.commit()
        db.refresh(state)
    return state

def set_stage(db: Session, stage: str):
    if stage not in STAGES:
        raise ValueError(f"Invalid stage. Allowed stages: {STAGES}")
    state = get_event_state(db)
    state.current_stage = stage
    db.commit()
    db.refresh(state)
    return state

def next_stage(db: Session):
    state = get_event_state(db)
    idx = STAGES.index(state.current_stage)
    if idx < len(STAGES) - 1:
        state.current_stage = STAGES[idx + 1]
        db.commit()
        db.refresh(state)
    return state

def previous_stage(db: Session):
    state = get_event_state(db)
    idx = STAGES.index(state.current_stage)
    if idx > 0:
        state.current_stage = STAGES[idx - 1]
        db.commit()
        db.refresh(state)
    return state

def reset_stage(db: Session):
    return set_stage(db, "registration")
