from sqlalchemy.orm import Session
from app.models.event_state import EventState
from app.models.event_config import EventConfig
from app.services.notification_service import NotificationService
from app.schemas.notification import NotificationCreate
import logging

STAGES = ["registration", "team_formation", "evaluation", "results"]

def get_event_state(db: Session):
    state = db.query(EventState).first()
    if not state:
        state = EventState(current_stage="registration")
        db.add(state)
        db.commit()
        db.refresh(state)
    return state

def _sync_event_config(db: Session, stage: str):
    config = db.query(EventConfig).first()
    if config:
        config.current_stage = stage

def set_stage(db: Session, stage: str):
    if stage not in STAGES:
        raise ValueError(f"Invalid stage. Allowed stages: {STAGES}")
    state = get_event_state(db)
    state.current_stage = stage
    _sync_event_config(db, stage)
    db.commit()
    db.refresh(state)
    
    try:
        NotificationService.create_notification(
            db, 
            NotificationCreate(
                user_id="all",
                message=f"Event advanced to {stage.replace('_', ' ').title()} stage.",
                type="stage_update"
            )
        )
    except Exception as e:
        logging.error(f"Failed to send global stage notification: {e}")

    return state

def next_stage(db: Session):
    state = get_event_state(db)
    idx = STAGES.index(state.current_stage)
    if idx < len(STAGES) - 1:
        return set_stage(db, STAGES[idx + 1])
    raise ValueError("Already at final stage.")

def previous_stage(db: Session):
    state = get_event_state(db)
    idx = STAGES.index(state.current_stage)
    if idx > 0:
        return set_stage(db, STAGES[idx - 1])
    raise ValueError("Already at first stage.")

def reset_stage(db: Session):
    return set_stage(db, "registration")
