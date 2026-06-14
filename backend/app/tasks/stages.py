import logging
from datetime import datetime, timezone
from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.scheduled_action import ScheduledAction
from app.services.stage_service import StageService

logger = logging.getLogger(__name__)

@celery_app.task(name="tasks.process_scheduled_actions")
def process_scheduled_actions():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        actions = db.query(ScheduledAction).filter(
            ScheduledAction.status == "pending",
            ScheduledAction.run_at <= now
        ).all()
        
        for action in actions:
            try:
                action.status = "running"
                db.commit()
                
                # Process the action based on type
                if action.action_type == "stage_start":
                    svc = StageService(db, action.event_id)
                    svc.advance_stage(action.stage_definition_id)
                elif action.action_type == "stage_warning":
                    logger.info(f"Stage warning triggered for {action.stage_definition_id}")
                    # Notify users... implementation skipped for brevity
                
                action.status = "completed"
                action.executed_at = datetime.now(timezone.utc)
                db.commit()
            except Exception as e:
                db.rollback()
                action.status = "failed"
                action.error = str(e)
                db.commit()
                logger.error(f"Action {action.id} failed: {e}")
                
    except Exception as e:
        logger.error(f"Error processing scheduled actions: {e}")
    finally:
        db.close()
