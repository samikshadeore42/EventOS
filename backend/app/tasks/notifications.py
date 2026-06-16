# backend/app/tasks/notifications.py
"""
Phase-7 notification outbox processor.

Runs on Celery beat. Claims due outbox rows with row-level locking (Postgres),
fans each out to per-user in-app notifications (idempotent via dedupe_key) and
emails (idempotent via the email layer's CommunicationLog), then records delivery
status. In-app creation is committed BEFORE email is attempted, so a failed email
never loses the in-app notification and is simply retried with backoff.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.notification_outbox import NotificationOutbox
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

BATCH_SIZE = 100


def _backoff(attempts: int) -> timedelta:
    # 1m, 2m, 4m, 8m, ... capped at 30m
    return timedelta(minutes=min(2 ** (attempts - 1), 30))


@celery_app.task(name="app.tasks.notifications.process_notification_outbox")
def process_notification_outbox():
    db = SessionLocal()
    delivered = 0
    try:
        now = datetime.now(timezone.utc)
        query = (
            db.query(NotificationOutbox)
            .filter(
                NotificationOutbox.status == "pending",
                NotificationOutbox.available_at <= now,
            )
            .order_by(NotificationOutbox.available_at)
            .limit(BATCH_SIZE)
        )
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        rows = query.all()
        for row in rows:
            row.status = "processing"
        db.commit()

        for row in rows:
            delivered += _deliver(db, row)
        return {"claimed": len(rows), "delivered": delivered}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.error("process_notification_outbox crashed: %s", exc)
        raise
    finally:
        db.close()


def _deliver(db, row: NotificationOutbox) -> int:
    svc = NotificationService(db, row.event_id)

    # Phase 1 — durable in-app fan-out (committed before email is attempted).
    try:
        recipients = svc.resolve_recipients(row)
        for r in recipients:
            svc.create_inapp_idempotent(row, r, commit=True)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        _mark_retry(db, row, f"in-app fan-out failed: {exc}")
        return 0

    # Phase 2 — best-effort email (idempotent at the email layer).
    email_error = None
    try:
        from app.services.email_service import EmailService
        for r in recipients:
            if not r.get("email"):
                continue
            EmailService.send_email(
                event_id=row.event_id,
                to_email=r["email"],
                subject=row.title,
                html_content=f"<p>{row.message}</p>",
                template="notification",
                stage=row.notification_type,
                idempotency_key=f"outbox-{row.id}-{r['user_id']}",
            )
    except Exception as exc:  # noqa: BLE001
        email_error = str(exc)

    if email_error:
        _mark_retry(db, row, f"email failed: {email_error}")
        return 0

    row.status = "delivered"
    row.processed_at = datetime.now(timezone.utc)
    row.last_error = None
    db.commit()
    return 1


def _mark_retry(db, row: NotificationOutbox, error: str) -> None:
    row.attempts += 1
    row.last_error = error[:1000]
    if row.attempts >= row.max_attempts:
        row.status = "dead"
    else:
        row.status = "pending"
        row.available_at = datetime.now(timezone.utc) + _backoff(row.attempts)
    db.commit()
