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
            policy = getattr(stage_def, "reminder_policy", None) or {}
            roles = policy.get("notify_roles") or ["participants", "mentors", "judges"]

            svc._notify_roles(
                ["admins"],
                title="Stage started",
                message=f"{getattr(stage_def, 'name', 'stage')} has began.",
                notification_type="stage_started_admin",
                key_suffix=f"{stage_def.id}:automatic-started-admin",
            )

            if policy.get("notify_on_start", True):
                svc._notify_roles(
                    roles,
                    title="Stage started",
                    message=f"{getattr(stage_def, 'name', 'stage')} has began.",
                    notification_type="stage_started",
                    key_suffix=f"{stage_def.id}:automatic-started",
                )

    elif action.action_type == "stage_end":
        svc.complete_stage_run(action.stage_definition_id)

    elif action.action_type == "stage_warning":
        stage_def = (
            db.query(StageDefinition)
            .filter(
                StageDefinition.event_id == action.event_id,
                StageDefinition.id == action.stage_definition_id,
            )
            .first()
        )

        if not stage_def:
            return

        policy = stage_def.reminder_policy or {}
        roles = policy.get("notify_roles") or ["participants", "mentors", "judges"]
        minutes = int((action.payload or {}).get("warn_before_minutes", 0) or 0)

        if minutes >= 1440:
            label = f"{minutes // 1440} day"
        elif minutes >= 60:
            label = f"{minutes // 60} hour"
        else:
            label = f"{minutes} minutes"

        svc._notify_roles(
            roles,
            title=f"{stage_def.name} ending soon",
            message=f"{stage_def.name} ends in {label}.",
            notification_type="stage_reminder",
            key_suffix=f"{stage_def.id}:warning:{minutes}",
        )

    elif action.action_type == "finalization_email":
        logger.info("Finalization email trigger for event=%s", action.event_id)

    else:
        raise ValueError(f"Unknown action_type '{action.action_type}'")