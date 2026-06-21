from datetime import date, datetime, timedelta, timezone

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


def _participant_name(db: Session, update: DailyUpdate) -> str:
    participant_id = getattr(update, "participant_id", None)
    if not participant_id:
        return "Participant"

    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        return "Participant"

    full_name = f"{getattr(participant, 'first_name', '')} {getattr(participant, 'last_name', '')}".strip()
    return full_name or getattr(participant, "email", None) or "Participant"


def _team_name(team: Team | None) -> str:
    if not team:
        return "Team"
    return getattr(team, "team_name", None) or getattr(team, "name", None) or "Team"


def _update_details(update: DailyUpdate) -> dict:
    possible_fields = [
        "summary",
        "progress_summary",
        "progress",
        "work_done",
        "today_work",
        "completed_work",
        "blockers",
        "blocker",
        "next_steps",
        "tomorrow_plan",
        "notes",
        "risk_flags",
        "status",
        "mood",
    ]

    details = {}
    for field in possible_fields:
        if hasattr(update, field):
            value = getattr(update, field)
            if value not in (None, "", [], {}):
                details[field] = value

    return details


def _update_payload(db: Session, update: DailyUpdate, team: Team | None) -> dict:
    created_at = getattr(update, "created_at", None)
    updated_at = getattr(update, "updated_at", None)
    update_date = getattr(update, "update_date", None)

    return {
        "id": str(update.id),
        "team_id": str(getattr(update, "team_id", "")),
        "team_name": _team_name(team),
        "participant_name": _participant_name(db, update),
        "update_date": update_date.isoformat() if update_date else None,
        "created_at": created_at.isoformat() if created_at else None,
        "updated_at": updated_at.isoformat() if updated_at else None,
        "progress_percentage": getattr(update, "progress_percentage", None),
        "details": _update_details(update),
    }


def _assigned_team_ids(db: Session, event_id, mentor_id):
    rows = db.query(MentorAssignment).filter(
        MentorAssignment.event_id == event_id,
        MentorAssignment.mentor_id == mentor_id,
        MentorAssignment.is_active == True,
    ).all()
    return [row.team_id for row in rows]


def notify_mentors_about_daily_update(db: Session, event_id, update: DailyUpdate, participant: Participant, team: Team):
    assignments = db.query(MentorAssignment).filter(
        MentorAssignment.event_id == event_id,
        MentorAssignment.team_id == team.id,
        MentorAssignment.is_active == True,
    ).all()

    participant_name = f"{getattr(participant, 'first_name', '')} {getattr(participant, 'last_name', '')}".strip()
    participant_name = participant_name or getattr(participant, "email", None) or "Participant"
    team_name = _team_name(team)

    for assignment in assignments:
        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=assignment.mentor_id,
            notification_type="mentor_daily_update_submitted",
            title=f"{team_name} submitted an update",
            message=f"{participant_name} submitted a progress update for {team_name}.",
            dedupe_key=f"mentor-update-submitted:{event_id}:{assignment.mentor_id}:{update.id}",
        )


def materialize_update_notifications_for_mentor(db: Session, event_id, mentor_id) -> int:
    created = 0
    team_ids = _assigned_team_ids(db, event_id, mentor_id)
    if not team_ids:
        return 0

    today = date.today()

    query = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.team_id.in_(team_ids),
    )

    if hasattr(DailyUpdate, "update_date"):
        query = query.filter(DailyUpdate.update_date == today)

    if hasattr(DailyUpdate, "created_at"):
        query = query.order_by(DailyUpdate.created_at.desc())

    updates = query.limit(100).all()

    for update in updates:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == update.team_id,
        ).first()

        before = db.query(InAppNotification).filter(
            InAppNotification.event_id == event_id,
            InAppNotification.role == mentor_role_key(mentor_id),
            InAppNotification.dedupe_key == f"mentor-update-submitted:{event_id}:{mentor_id}:{update.id}",
        ).first()

        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=mentor_id,
            notification_type="mentor_daily_update_submitted",
            title=f"{_team_name(team)} submitted an update",
            message=f"{_participant_name(db, update)} submitted a progress update for {_team_name(team)}.",
            dedupe_key=f"mentor-update-submitted:{event_id}:{mentor_id}:{update.id}",
        )

        if not before:
            created += 1

    return created


def list_updates_for_mentor(db: Session, event_id, mentor_id, team_id=None, limit: int = 50):
    team_ids = _assigned_team_ids(db, event_id, mentor_id)

    if team_id:
        if team_id not in team_ids:
            return []
        team_ids = [team_id]

    if not team_ids:
        return []

    query = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.team_id.in_(team_ids),
    )

    if hasattr(DailyUpdate, "created_at"):
        query = query.order_by(DailyUpdate.created_at.desc())
    elif hasattr(DailyUpdate, "update_date"):
        query = query.order_by(DailyUpdate.update_date.desc())

    updates = query.limit(limit).all()

    payload = []
    for update in updates:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == update.team_id,
        ).first()
        payload.append(_update_payload(db, update, team))

    return payload


def materialize_due_mentor_notifications(db: Session, event_id, mentor_id) -> int:
    created_before = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
    ).count()

    materialize_update_notifications_for_mentor(db, event_id, mentor_id)

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
                title=f"No update from {_team_name(team)}",
                message=f"{_team_name(team)} has not submitted any progress update today. This is a daily risk signal.",
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
        scheduled_at = _aware(getattr(session, "scheduled_at", None))
        if not scheduled_at:
            continue

        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == session.team_id,
        ).first()
        team_name = _team_name(team)

        for minutes, label in thresholds:
            due_at = scheduled_at - timedelta(minutes=minutes)

            if minutes == 0:
                duration = getattr(session, "duration_minutes", None) or 30
                is_due = scheduled_at <= now <= scheduled_at + timedelta(minutes=max(duration, 5))
                title = f"Meeting starting now: {team_name}"
                key_label = "now"
            else:
                is_due = due_at <= now <= scheduled_at
                title = f"Meeting in {label}: {team_name}"
                key_label = str(minutes)

            if not is_due:
                continue

            meeting_url = getattr(session, "meeting_url", None) or "meeting link not added"
            session_title = getattr(session, "title", None) or "Mentor meeting"

            _safe_insert(
                db,
                event_id=event_id,
                mentor_id=mentor_id,
                notification_type="mentor_meeting_reminder",
                title=title,
                message=f"{session_title} is scheduled {label}. Join link: {meeting_url}",
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

# MENTOR_UPDATE_FEED_FIX_START
# These definitions intentionally override earlier helpers in this module.
# They make mentor notifications + update feed work from the actual DailyUpdate fields.

def _mentor_assigned_team_ids(db: Session, event_id, mentor_id):
    rows = db.query(MentorAssignment).filter(
        MentorAssignment.event_id == event_id,
        MentorAssignment.mentor_id == mentor_id,
        MentorAssignment.is_active == True,
    ).all()
    return [row.team_id for row in rows]


def _mentor_team_name(team: Team | None) -> str:
    if not team:
        return "Team"
    return getattr(team, "team_name", None) or getattr(team, "name", None) or "Team"


def _mentor_participant_name(db: Session, update: DailyUpdate) -> str:
    participant = db.query(Participant).filter(
        Participant.id == update.participant_id,
        Participant.event_id == update.event_id,
    ).first()

    if not participant:
        return "Participant"

    name = f"{getattr(participant, 'first_name', '')} {getattr(participant, 'last_name', '')}".strip()
    return name or getattr(participant, "email", None) or "Participant"


def _mentor_update_payload(db: Session, update: DailyUpdate, team: Team | None) -> dict:
    details = {
        "what_i_built": update.what_i_built,
    }

    if update.blockers:
        details["blockers"] = update.blockers

    if update.hours_worked is not None:
        details["hours_worked"] = update.hours_worked

    return {
        "id": str(update.id),
        "team_id": str(update.team_id),
        "team_name": _mentor_team_name(team),
        "participant_id": str(update.participant_id),
        "participant_name": _mentor_participant_name(db, update),
        "update_date": update.update_date.isoformat() if update.update_date else None,
        "submitted_at": update.submitted_at.isoformat() if update.submitted_at else None,
        "details": details,
    }


def notify_mentors_about_daily_update(db: Session, event_id, update: DailyUpdate, participant: Participant, team: Team):
    assignments = db.query(MentorAssignment).filter(
        MentorAssignment.event_id == event_id,
        MentorAssignment.team_id == team.id,
        MentorAssignment.is_active == True,
    ).all()

    participant_name = f"{getattr(participant, 'first_name', '')} {getattr(participant, 'last_name', '')}".strip()
    participant_name = participant_name or getattr(participant, "email", None) or "Participant"
    team_name = _mentor_team_name(team)

    for assignment in assignments:
        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=assignment.mentor_id,
            notification_type="mentor_daily_update_submitted",
            title=f"{team_name} submitted an update",
            message=f"{participant_name} submitted a daily progress update for {team_name}.",
            dedupe_key=f"mentor-update-submitted:{event_id}:{assignment.mentor_id}:{update.id}",
        )


def materialize_update_notifications_for_mentor(db: Session, event_id, mentor_id) -> int:
    team_ids = _mentor_assigned_team_ids(db, event_id, mentor_id)
    if not team_ids:
        return 0

    today = date.today()

    updates = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.team_id.in_(team_ids),
        DailyUpdate.update_date == today,
    ).order_by(
        DailyUpdate.submitted_at.desc(),
    ).limit(100).all()

    created = 0

    for update in updates:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == update.team_id,
        ).first()

        dedupe_key = f"mentor-update-submitted:{event_id}:{mentor_id}:{update.id}"

        before = db.query(InAppNotification).filter(
            InAppNotification.event_id == event_id,
            InAppNotification.role == mentor_role_key(mentor_id),
            InAppNotification.dedupe_key == dedupe_key,
        ).first()

        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=mentor_id,
            notification_type="mentor_daily_update_submitted",
            title=f"{_mentor_team_name(team)} submitted an update",
            message=f"{_mentor_participant_name(db, update)} submitted a daily progress update for {_mentor_team_name(team)}.",
            dedupe_key=dedupe_key,
        )

        if not before:
            created += 1

    return created


def list_updates_for_mentor(db: Session, event_id, mentor_id, team_id=None, limit: int = 100):
    team_ids = _mentor_assigned_team_ids(db, event_id, mentor_id)
    if not team_ids:
        return []

    if team_id is not None:
        allowed = {str(tid) for tid in team_ids}
        if str(team_id) not in allowed:
            return []
        team_ids = [team_id]

    updates = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.team_id.in_(team_ids),
    ).order_by(
        DailyUpdate.update_date.desc(),
        DailyUpdate.submitted_at.desc(),
    ).limit(limit).all()

    result = []
    for update in updates:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == update.team_id,
        ).first()
        result.append(_mentor_update_payload(db, update, team))

    return result


def materialize_due_mentor_notifications(db: Session, event_id, mentor_id) -> int:
    created_before = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
    ).count()

    materialize_update_notifications_for_mentor(db, event_id, mentor_id)

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
                title=f"No update from {_mentor_team_name(team)}",
                message=f"{_mentor_team_name(team)} has not submitted any progress update today. This is a daily risk signal.",
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

        team_name = _mentor_team_name(team)

        for minutes, label in thresholds:
            due_at = scheduled_at - timedelta(minutes=minutes)

            if minutes == 0:
                duration = session.duration_minutes or 30
                is_due = scheduled_at <= now <= scheduled_at + timedelta(minutes=max(duration, 5))
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
# MENTOR_UPDATE_FEED_FIX_END



# FINAL_MENTOR_NOTIFICATION_FIX_START
# Final override layer for mentor magic-link notifications.
# This intentionally overrides earlier helpers in this module.

def _mn_assigned_team_ids(db: Session, event_id, mentor_id):
    rows = db.query(MentorAssignment).filter(
        MentorAssignment.event_id == event_id,
        MentorAssignment.mentor_id == mentor_id,
        MentorAssignment.is_active == True,
    ).all()
    return [row.team_id for row in rows]


def _mn_team_name(team: Team | None) -> str:
    if not team:
        return "Team"
    return getattr(team, "team_name", None) or getattr(team, "name", None) or "Team"


def _mn_participant_name(db: Session, update: DailyUpdate) -> str:
    participant = db.query(Participant).filter(
        Participant.id == update.participant_id,
        Participant.event_id == update.event_id,
    ).first()

    if not participant:
        return "Participant"

    name = f"{getattr(participant, 'first_name', '')} {getattr(participant, 'last_name', '')}".strip()
    return name or getattr(participant, "email", None) or "Participant"


def _mn_create_update_notifications(db: Session, event_id, mentor_id) -> int:
    team_ids = _mn_assigned_team_ids(db, event_id, mentor_id)
    if not team_ids:
        return 0

    today = date.today()
    created = 0

    updates = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.team_id.in_(team_ids),
        DailyUpdate.update_date == today,
    ).order_by(DailyUpdate.submitted_at.desc()).limit(100).all()

    for update in updates:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == update.team_id,
        ).first()

        key = f"mentor-update-submitted:{event_id}:{mentor_id}:{update.id}"

        before = db.query(InAppNotification).filter(
            InAppNotification.event_id == event_id,
            InAppNotification.role == mentor_role_key(mentor_id),
            InAppNotification.dedupe_key == key,
        ).first()

        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=mentor_id,
            notification_type="mentor_daily_update_submitted",
            title=f"{_mn_team_name(team)} submitted an update",
            message=f"{_mn_participant_name(db, update)} submitted a daily update: {update.what_i_built}",
            dedupe_key=key,
        )

        if not before:
            created += 1

    return created


def _mn_create_no_update_notifications(db: Session, event_id, mentor_id) -> int:
    team_ids = _mn_assigned_team_ids(db, event_id, mentor_id)
    if not team_ids:
        return 0

    today = date.today()
    created = 0
    now = datetime.now(timezone.utc)
    if now.hour < 17:
        return 0

    for team_id in team_ids:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == team_id,
        ).first()

        count = db.query(DailyUpdate).filter(
            DailyUpdate.event_id == event_id,
            DailyUpdate.team_id == team_id,
            DailyUpdate.update_date == today,
        ).count()

        if count > 0:
            continue

        key = f"mentor-no-update:{event_id}:{mentor_id}:{team_id}:{today.isoformat()}"

        before = db.query(InAppNotification).filter(
            InAppNotification.event_id == event_id,
            InAppNotification.role == mentor_role_key(mentor_id),
            InAppNotification.dedupe_key == key,
        ).first()

        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=mentor_id,
            notification_type="mentor_no_update_today",
            title=f"No update from {_mn_team_name(team)}",
            message=f"{_mn_team_name(team)} has not submitted a daily update today.",
            dedupe_key=key,
        )

        if not before:
            created += 1

    return created


def _mn_create_meeting_notifications(db: Session, event_id, mentor_id) -> int:
    now = datetime.now(timezone.utc)
    created = 0

    sessions = db.query(MentorSession).filter(
        MentorSession.event_id == event_id,
        MentorSession.mentor_id == mentor_id,
        MentorSession.status == "scheduled",
    ).all()

    thresholds = [
        (60, "1 hour"),
        (10, "10 minutes"),
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

        team_name = _mn_team_name(team)

        for minutes, label in thresholds:
            if minutes == 0:
                window_start = scheduled_at
                window_end = scheduled_at + timedelta(minutes=5)
                title = f"Meeting starting now: {team_name}"
                message = f"{session.title} is scheduled now. Please join: {session.meeting_url or 'meeting link not added'}"
                key_label = "now"
            else:
                due_at = scheduled_at - timedelta(minutes=minutes)
                window_start = due_at
                window_end = due_at + timedelta(minutes=2)
                title = f"Meeting in {label}: {team_name}"
                message = f"{session.title} is scheduled in {label}. Join link: {session.meeting_url or 'meeting link not added'}"
                key_label = str(minutes)

            if not (window_start <= now <= window_end):
                continue

            key = f"mentor-meeting-reminder:{event_id}:{mentor_id}:{session.id}:{key_label}"

            before = db.query(InAppNotification).filter(
                InAppNotification.event_id == event_id,
                InAppNotification.role == mentor_role_key(mentor_id),
                InAppNotification.dedupe_key == key,
            ).first()

            _safe_insert(
                db,
                event_id=event_id,
                mentor_id=mentor_id,
                notification_type="mentor_meeting_reminder",
                title=title,
                message=message,
                dedupe_key=key,
            )

            if not before:
                created += 1

    return created


def _mn_create_chat_notifications(db: Session, event_id, mentor_id) -> int:
    created = 0
    team_ids = _mn_assigned_team_ids(db, event_id, mentor_id)
    if not team_ids:
        return 0

    try:
        from app.models.chat import ChatConversation, ChatMessage
    except Exception:
        return 0

    conversations = db.query(ChatConversation).filter(
        ChatConversation.event_id == event_id,
        ChatConversation.team_id.in_(team_ids),
        ChatConversation.kind == "team_mentor",
    ).all()

    for conversation in conversations:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == conversation.team_id,
        ).first()

        messages = db.query(ChatMessage).filter(
            ChatMessage.event_id == event_id,
            ChatMessage.conversation_id == conversation.id,
            ChatMessage.sender_role == "participant",
        ).order_by(ChatMessage.created_at.desc()).limit(25).all()

        for message in messages:
            key = f"mentor-chat-message:{event_id}:{mentor_id}:{message.id}"

            before = db.query(InAppNotification).filter(
                InAppNotification.event_id == event_id,
                InAppNotification.role == mentor_role_key(mentor_id),
                InAppNotification.dedupe_key == key,
            ).first()

            body = message.body or ""
            if len(body) > 120:
                body = body[:117] + "..."

            _safe_insert(
                db,
                event_id=event_id,
                mentor_id=mentor_id,
                notification_type="mentor_unread_chat",
                title=f"New team chat from {_mn_team_name(team)}",
                message=f"{message.sender_name}: {body}",
                dedupe_key=key,
            )

            if not before:
                created += 1

    return created


def _mn_create_stage_notifications(db: Session, event_id, mentor_id) -> int:
    created = 0

    try:
        from app.models.stage_run import StageRun
        from app.models.stage_definition import StageDefinition
    except Exception:
        return 0

    rows = db.query(StageRun, StageDefinition).join(
        StageDefinition,
        (StageDefinition.event_id == StageRun.event_id) &
        (StageDefinition.id == StageRun.stage_definition_id),
    ).filter(
        StageRun.event_id == event_id,
        StageRun.status.in_(["active", "completed", "awaiting_approval"]),
    ).order_by(StageRun.created_at.desc()).limit(20).all()

    for run, definition in rows:
        key = f"mentor-stage-change:{event_id}:{mentor_id}:{run.id}:{run.status}"

        before = db.query(InAppNotification).filter(
            InAppNotification.event_id == event_id,
            InAppNotification.role == mentor_role_key(mentor_id),
            InAppNotification.dedupe_key == key,
        ).first()

        if run.status == "active":
            title = f"Stage active: {definition.name}"
            message = f"The event stage is now active: {definition.name}."
        elif run.status == "completed":
            title = f"Stage completed: {definition.name}"
            message = f"The event stage has been completed: {definition.name}."
        else:
            title = f"Stage awaiting approval: {definition.name}"
            message = f"The event stage is awaiting approval: {definition.name}."

        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=mentor_id,
            notification_type="mentor_stage_change",
            title=title,
            message=message,
            dedupe_key=key,
        )

        if not before:
            created += 1

    return created


def materialize_due_mentor_notifications(db: Session, event_id, mentor_id) -> int:
    before = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
    ).count()

    _mn_create_update_notifications(db, event_id, mentor_id)
    _mn_create_chat_notifications(db, event_id, mentor_id)
    _mn_create_stage_notifications(db, event_id, mentor_id)
    _mn_create_no_update_notifications(db, event_id, mentor_id)
    _mn_create_meeting_notifications(db, event_id, mentor_id)

    after = db.query(InAppNotification).filter(
        InAppNotification.event_id == event_id,
        InAppNotification.role == mentor_role_key(mentor_id),
    ).count()

    return max(after - before, 0)


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


def list_updates_for_mentor(db: Session, event_id, mentor_id, team_id=None, limit: int = 100):
    team_ids = _mn_assigned_team_ids(db, event_id, mentor_id)
    if not team_ids:
        return []

    if team_id is not None:
        allowed = {str(tid) for tid in team_ids}
        if str(team_id) not in allowed:
            return []
        team_ids = [team_id]

    updates = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.team_id.in_(team_ids),
    ).order_by(
        DailyUpdate.update_date.desc(),
        DailyUpdate.submitted_at.desc(),
    ).limit(limit).all()

    result = []
    for update in updates:
        team = db.query(Team).filter(
            Team.event_id == event_id,
            Team.id == update.team_id,
        ).first()

        result.append({
            "id": str(update.id),
            "team_id": str(update.team_id),
            "team_name": _mn_team_name(team),
            "participant_id": str(update.participant_id),
            "participant_name": _mn_participant_name(db, update),
            "update_date": update.update_date.isoformat() if update.update_date else None,
            "submitted_at": update.submitted_at.isoformat() if update.submitted_at else None,
            "details": {
                "what_i_built": update.what_i_built,
                "blockers": update.blockers,
                "hours_worked": update.hours_worked,
            },
        })

    return result


def notify_mentors_about_daily_update(db: Session, event_id, update: DailyUpdate, participant: Participant, team: Team):
    assignments = db.query(MentorAssignment).filter(
        MentorAssignment.event_id == event_id,
        MentorAssignment.team_id == team.id,
        MentorAssignment.is_active == True,
    ).all()

    participant_name = f"{getattr(participant, 'first_name', '')} {getattr(participant, 'last_name', '')}".strip()
    participant_name = participant_name or getattr(participant, "email", None) or "Participant"

    for assignment in assignments:
        _safe_insert(
            db,
            event_id=event_id,
            mentor_id=assignment.mentor_id,
            notification_type="mentor_daily_update_submitted",
            title=f"{_mn_team_name(team)} submitted an update",
            message=f"{participant_name} submitted a daily update: {update.what_i_built}",
            dedupe_key=f"mentor-update-submitted:{event_id}:{assignment.mentor_id}:{update.id}",
        )
# FINAL_MENTOR_NOTIFICATION_FIX_END

