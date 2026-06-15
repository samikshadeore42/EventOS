# backend/app/tasks/stages.py
"""
Phase-4 scheduled-action processor.

Runs on Celery beat. Claims due actions with row-level locking so that two beat
workers can never fire the same action twice (Phase-4/6 exit condition:
"two workers cannot advance the same event twice"). On SQLite (tests) the
FOR UPDATE / SKIP LOCKED clause is silently ignored by SQLAlchemy, which is fine
because the test worker is single-threaded.
"""
import logging
from datetime import datetime, timezone

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.scheduled_action import ScheduledAction
from app.models.stage_definition import StageDefinition
from app.services.stage_service import StageService

logger = logging.getLogger(__name__)

# How many due actions to claim per beat tick.
BATCH_SIZE = 100


@celery_app.task(name="app.tasks.stages.process_scheduled_actions")
def process_scheduled_actions():
    db = SessionLocal()
    processed = 0
    try:
        now = datetime.now(timezone.utc)

        # Claim due, pending actions. On Postgres we use FOR UPDATE SKIP LOCKED
        # so a second concurrent worker grabs a *different* set of rows instead of
        # blocking or double-processing. SQLite (tests) doesn't support it, so we
        # apply the clause only on Postgres.
        query = (
            db.query(ScheduledAction)
            .filter(
                ScheduledAction.status == "pending",
                ScheduledAction.run_at <= now,
            )
            .order_by(ScheduledAction.run_at)
            .limit(BATCH_SIZE)
        )
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        actions = query.all()
        for action in actions:
            action.status = "running"
        db.commit()  # release the claim lock; rows are now ours

        for action in actions:
            try:
                _execute_action(db, action)
                action.status = "completed"
                action.executed_at = datetime.now(timezone.utc)
                action.error = None
                db.commit()
                processed += 1
            except Exception as exc:  # noqa: BLE001 — isolate one bad action
                db.rollback()
                action.status = "failed"
                action.error = str(exc)[:1000]
                db.commit()
                logger.error("ScheduledAction %s failed: %s", action.id, exc)

        return {"claimed": len(actions), "processed": processed}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.error("process_scheduled_actions crashed: %s", exc)
        raise
    finally:
        db.close()


def _execute_action(db, action: ScheduledAction) -> None:
    """Dispatch a single claimed action. Each stage method commits internally."""
    svc = StageService(db, action.event_id)

    if action.action_type == "stage_start":
        # Phase 6: respect the creator's transition_policy. 'automatic' stages
        # activate themselves; 'manual' stages park in awaiting_approval until a
        # committee member approves. The schedule itself is the ordering authority,
        # so automatic advance uses force=True.
        stage_def = (
            db.query(StageDefinition)
            .filter(
                StageDefinition.event_id == action.event_id,
                StageDefinition.id == action.stage_definition_id,
            )
            .first()
        )
        policy = getattr(stage_def, "transition_policy", "automatic")
        if policy == "manual":
            svc.hold_stage_for_approval(action.stage_definition_id)
        else:
            svc.advance_stage(action.stage_definition_id, force=True)
            svc._safe_notify(
                role="participant",
                title="Stage started",
                message=f"Stage '{getattr(stage_def, 'name', 'stage')}' is now active.",
                notification_type="stage_started",
            )

    elif action.action_type == "stage_end":
        svc.complete_stage_run(action.stage_definition_id)

    elif action.action_type == "stage_warning":
        # Notification delivery lands in Phase 7 (outbox). For now, record intent.
        logger.info(
            "Stage warning for event=%s stage=%s payload=%s",
            action.event_id, action.stage_definition_id, action.payload,
        )

    elif action.action_type == "finalization_email":
        logger.info("Finalization email trigger for event=%s", action.event_id)

    else:
        raise ValueError(f"Unknown action_type '{action.action_type}'")