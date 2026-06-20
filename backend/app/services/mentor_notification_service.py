import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.daily_update import DailyUpdate
from app.models.mentor import MentorAssignment, MentorSession
from app.models.notification import InAppNotification
from app.models.participant import Participant, Team


def mentor_role_key(mentor_id) -> str:
    return f"mentor:{mentor_id}"


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _safe_insert(
    db: Session,
    *,
    event_id,
    mentor_id,
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
        role=mentor_role_key(mentor_id),
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


def notify_mentors_about_daily_update(db: Session, event_id, update: DailyUpdate, participant: Participant, team: Team):
    assignments = db.query(MentorAssignment).filter(
        MentorAssignment.event_id == event_id,
        MentorAssignment.team_id == team.id,
        MentorAssignment.is_active == True,
    ).all()

    participant_name = f"{participant.first_name} {participant.last_name}".strip()

    for assignment in assignments:
        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=assignment.mentor_id,
            notification_type="mentor_daily_update_submitted",
            title=f"{team.team_name} submitted an update",
            message=f"{participant_name} submitted today's progress update for {team.team_name}.",
            dedupe_key=f"mentor-update-submitted:{event_id}:{assignment.mentor_id}:{update.id}",
        )


def materialize_due_mentor_notifications(db: Session, event_id, mentor_id) -> int:
    created_before = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
    ).count()

    now = datetime.now(timezone.utc)
    today = date.today()

    assignments = db.query(MentorAssignment).filter(
        MentorAssignment.event_id == event_id,
        MentorAssignment.mentor_id == mentor_id,
        MentorAssignment.is_active == True,
    ).all()

    for assignment in assignments:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == assignment.team_id,
        ).first()

        if not team:
            continue

        updates_today = db.query(DailyUpdate).filter(
            DailyUpdate.event_id == event_id,
            DailyUpdate.team_id == team.id,
            DailyUpdate.update_date == today,
        ).count()

        if updates_today == 0:
            _safe_insert(
                db,
                event_id=event_id,
                mentor_id=mentor_id,
                notification_type="mentor_no_update_today",
                title=f"No update from {team.team_name}",
                message=f"{team.team_name} has not submitted any progress update today. This is a daily risk signal.",
                dedupe_key=f"mentor-no-update:{event_id}:{mentor_id}:{team.id}:{today.isoformat()}",
            )

    sessions = db.query(MentorSession).filter(
        MentorSession.event_id == event_id,
        MentorSession.mentor_id == mentor_id,
        MentorSession.status == "scheduled",
    ).all()

    thresholds = [
        (30, "30 minutes"),
        (10, "10 minutes"),
        (5, "5 minutes"),
        (0, "now"),
    ]

    for session in sessions:
        scheduled_at = _aware(session.scheduled_at)
        if not scheduled_at:
            continue

        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == session.team_id,
        ).first()
        team_name = team.team_name if team else "your team"

        for minutes, label in thresholds:
            due_at = scheduled_at - timedelta(minutes=minutes)

            if minutes == 0:
                is_due = scheduled_at <= now <= scheduled_at + timedelta(minutes=max(session.duration_minutes or 30, 5))
                title = f"Meeting starting now: {team_name}"
                message = f"{session.title} is scheduled now. Please join: {session.meeting_url}"
                key_label = "now"
            else:
                is_due = due_at <= now <= scheduled_at
                title = f"Meeting in {label}: {team_name}"
                message = f"{session.title} is scheduled in {label}. Join link: {session.meeting_url}"
                key_label = str(minutes)

            if not is_due:
                continue

            _safe_insert(
                db,
                event_id=event_id,
                mentor_id=mentor_id,
                notification_type="mentor_meeting_reminder",
                title=title,
                message=message,
                dedupe_key=f"mentor-meeting-reminder:{event_id}:{mentor_id}:{session.id}:{key_label}",
            )

    created_after = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
    ).count()

    return max(created_after - created_before, 0)


def list_for_mentor(db: Session, event_id, mentor_id, unread_only: bool = False, limit: int = 50):
    materialize_due_mentor_notifications(db, event_id, mentor_id)

    q = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
    )

    if unread_only:
        q = q.filter(InAppNotification.read_at.is_(None))

    return q.order_by(InAppNotification.created_at.desc()).limit(limit).all()


def unread_count_for_mentor(db: Session, event_id, mentor_id) -> int:
    materialize_due_mentor_notifications(db, event_id, mentor_id)

    return db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
        InAppNotification.read_at.is_(None),
    ).count()


def mark_read_for_mentor(db: Session, event_id, mentor_id, notification_id):
    row = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
        InAppNotification.id == notification_id,
    ).first()

    if row and row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)

    return row


def mark_all_read_for_mentor(db: Session, event_id, mentor_id) -> int:
    count = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
        InAppNotification.read_at.is_(None),
    ).update(
        {InAppNotification.read_at: datetime.now(timezone.utc)},
        synchronize_session=False,
    )
    db.commit()
    return count
