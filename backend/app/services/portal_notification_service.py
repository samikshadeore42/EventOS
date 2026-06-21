import uuid
from datetime import datetime, timezone
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.notification import InAppNotification


def participant_role_key(participant_id) -> str:
    return f"participant:{participant_id}"


def evaluator_role_key(evaluator_id) -> str:
    return f"evaluator:{evaluator_id}"


def mentor_role_key(mentor_id) -> str:
    return f"mentor:{mentor_id}"


def _safe_insert(
    db: Session,
    *,
    event_id,
    role: str,
    notification_type: str,
    title: str,
    message: str,
    dedupe_key: str,
):
    existing = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.dedupe_key == dedupe_key,
    ).first()

    if existing:
        return existing

    row = InAppNotification(
        event_id=event_id,
        role=role,
        title=title,
        message=message,
        notification_type=notification_type,
        dedupe_key=dedupe_key,
    )
    db.add(row)

    try:
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError:
        db.rollback()
        return db.query(InAppNotification).filter(
            InAppNotification.event_id == event_id,
            InAppNotification.dedupe_key == dedupe_key,
        ).first()


def notify_participant(
    db: Session,
    *,
    event_id,
    participant_id,
    notification_type: str,
    title: str,
    message: str,
    dedupe_key: str,
):
    return _safe_insert(
        db,
        event_id=event_id,
        role=participant_role_key(participant_id),
        notification_type=notification_type,
        title=title,
        message=message,
        dedupe_key=dedupe_key,
    )


def notify_evaluator(
    db: Session,
    *,
    event_id,
    evaluator_id,
    notification_type: str,
    title: str,
    message: str,
    dedupe_key: str,
):
    return _safe_insert(
        db,
        event_id=event_id,
        role=evaluator_role_key(evaluator_id),
        notification_type=notification_type,
        title=title,
        message=message,
        dedupe_key=dedupe_key,
    )


def list_for_participant(db: Session, event_id, participant_id, unread_only: bool = False, limit: int = 50):
    q = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        or_(
            InAppNotification.role == participant_role_key(participant_id),
            InAppNotification.role == "participant",
            InAppNotification.role == "all",
        ),
    )

    if unread_only:
        q = q.filter(InAppNotification.read_at.is_(None))

    return q.order_by(InAppNotification.created_at.desc()).limit(limit).all()


def unread_count_for_participant(db: Session, event_id, participant_id) -> int:
    return db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.read_at.is_(None),
        or_(
            InAppNotification.role == participant_role_key(participant_id),
            InAppNotification.role == "participant",
            InAppNotification.role == "all",
        ),
    ).count()


def list_for_evaluator(db: Session, event_id, evaluator_id, unread_only: bool = False, limit: int = 50):
    q = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        or_(
            InAppNotification.role == evaluator_role_key(evaluator_id),
            InAppNotification.role == "evaluator",
            InAppNotification.role == "all",
        ),
    )

    if unread_only:
        q = q.filter(InAppNotification.read_at.is_(None))

    return q.order_by(InAppNotification.created_at.desc()).limit(limit).all()


def unread_count_for_evaluator(db: Session, event_id, evaluator_id) -> int:
    return db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.read_at.is_(None),
        or_(
            InAppNotification.role == evaluator_role_key(evaluator_id),
            InAppNotification.role == "evaluator",
            InAppNotification.role == "all",
        ),
    ).count()


def mark_read_by_role(db: Session, event_id, role_values: list[str], notification_id):
    row = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.id == notification_id,
        InAppNotification.role.in_(role_values),
    ).first()

    if row and row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)

    return row


def mark_all_read_by_role(db: Session, event_id, role_values: list[str]) -> int:
    count = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.read_at.is_(None),
        InAppNotification.role.in_(role_values),
    ).update(
        {InAppNotification.read_at: datetime.now(timezone.utc)},
        synchronize_session=False,
    )
    db.commit()
    return count