import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.notification import InAppNotification
from app.models.notification_outbox import NotificationOutbox

# Roles we can fan out to concrete users via organization membership. Other roles
# (participant/mentor/evaluator) are delivered as a single role-broadcast row in
# v1 — per-user fan-out for them depends on the participant↔user linkage added in
# the imports phase.
_ORG_STAFF_ROLES = {"owner", "admin"}


class NotificationService:
    def __init__(self, db: Session, event_id: uuid.UUID):
        self.db = db
        self.event_id = event_id

    # ── enqueue (transactional outbox — the entry point for business code) ────

    def enqueue(
        self,
        notification_type: str,
        title: str,
        message: str,
        *,
        user_id: Optional[uuid.UUID] = None,
        role: Optional[str] = None,
        payload: Optional[dict] = None,
        idempotency_key: Optional[str] = None,
        commit: bool = True,
    ) -> Optional[NotificationOutbox]:
        """Write an outbox row. Call this inside the same transaction as the
        business action. Delivery happens asynchronously via the Celery task.
        Idempotent on (event_id, idempotency_key)."""
        if idempotency_key:
            existing = self.db.query(NotificationOutbox).filter(
                NotificationOutbox.event_id == self.event_id,
                NotificationOutbox.idempotency_key == idempotency_key,
            ).first()
            if existing:
                return existing

        row = NotificationOutbox(
            event_id=self.event_id,
            notification_type=notification_type,
            title=title,
            message=message,
            recipient_user_id=user_id,
            recipient_role=role,
            payload=payload or {},
            idempotency_key=idempotency_key,
            status="pending",
        )
        self.db.add(row)
        if commit:
            try:
                self.db.commit()
                self.db.refresh(row)
            except IntegrityError:
                self.db.rollback()
                return self.db.query(NotificationOutbox).filter(
                    NotificationOutbox.event_id == self.event_id,
                    NotificationOutbox.idempotency_key == idempotency_key,
                ).first()
        return row

    # ── delivery helpers (used by the Celery outbox processor) ────────────────

    def resolve_recipients(self, outbox: NotificationOutbox) -> List[Dict]:
        """Return a list of {user_id, role, email} recipients for an outbox row."""
        from app.models.user import User

        if outbox.recipient_user_id:
            user = self.db.query(User).filter(User.id == outbox.recipient_user_id).first()
            email = getattr(user, "email", None) if user else None
            return [{"user_id": outbox.recipient_user_id, "role": None, "email": email}]

        role = outbox.recipient_role
        if role in _ORG_STAFF_ROLES:
            from app.models.event import Event
            from app.models.organization_membership import OrganizationMembership
            event = self.db.query(Event).filter(Event.id == self.event_id).first()
            if not event:
                return []
            members = self.db.query(OrganizationMembership, User).join(
                User, User.id == OrganizationMembership.user_id
            ).filter(
                OrganizationMembership.organization_id == event.organization_id,
                OrganizationMembership.role == role,
                OrganizationMembership.status == "active",
            ).all()
            return [{"user_id": u.id, "role": role, "email": u.email} for _, u in members]

        # Fallback: role broadcast (no per-user fan-out, no email).
        return [{"user_id": None, "role": role, "email": None}]

    def create_inapp_idempotent(
        self, outbox: NotificationOutbox, recipient: dict, commit: bool = True
    ) -> InAppNotification:
        """Create one in-app notification, guarded by a dedupe_key so an outbox
        retry can't duplicate it."""
        target = recipient.get("user_id") or f"role:{recipient.get('role')}"
        dedupe = f"{outbox.id}:{target}"

        existing = self.db.query(InAppNotification).filter(
            InAppNotification.event_id == self.event_id,
            InAppNotification.dedupe_key == dedupe,
        ).first()
        if existing:
            return existing

        notif = InAppNotification(
            event_id=self.event_id,
            user_id=recipient.get("user_id"),
            role=recipient.get("role"),
            title=outbox.title,
            message=outbox.message,
            notification_type=outbox.notification_type,
            dedupe_key=dedupe,
        )
        self.db.add(notif)
        if commit:
            try:
                self.db.commit()
                self.db.refresh(notif)
            except IntegrityError:
                self.db.rollback()
                return self.db.query(InAppNotification).filter(
                    InAppNotification.event_id == self.event_id,
                    InAppNotification.dedupe_key == dedupe,
                ).first()
        return notif

    # ── per-user read APIs ────────────────────────────────────────────────────

    def list_for_user(self, user_id: uuid.UUID, roles: Optional[list] = None,
                       unread_only: bool = False, limit: int = 50):
        q = self.db.query(InAppNotification).filter(
            InAppNotification.event_id == self.event_id
        )
        targets = [InAppNotification.user_id == user_id]
        if roles:
            targets.append(InAppNotification.role.in_(roles))
        q = q.filter(or_(*targets))
        if unread_only:
            q = q.filter(InAppNotification.read_at.is_(None))
        return q.order_by(InAppNotification.created_at.desc()).limit(limit).all()

    def unread_count(self, user_id: uuid.UUID, roles: Optional[list] = None) -> int:
        targets = [InAppNotification.user_id == user_id]
        if roles:
            targets.append(InAppNotification.role.in_(roles))
        return self.db.query(InAppNotification).filter(
            InAppNotification.event_id == self.event_id,
            InAppNotification.read_at.is_(None),
            or_(*targets),
        ).count()

    def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> Optional[InAppNotification]:
        notif = self.db.query(InAppNotification).filter(
            InAppNotification.event_id == self.event_id,
            InAppNotification.id == notification_id,
            or_(InAppNotification.user_id == user_id, InAppNotification.user_id.is_(None)),
        ).first()
        if notif and notif.read_at is None:
            notif.read_at = datetime.now(timezone.utc)
            self.db.commit()
        return notif

    def mark_all_read(self, user_id: uuid.UUID, roles: Optional[list] = None) -> int:
        targets = [InAppNotification.user_id == user_id]
        if roles:
            targets.append(InAppNotification.role.in_(roles))
        n = self.db.query(InAppNotification).filter(
            InAppNotification.event_id == self.event_id,
            InAppNotification.read_at.is_(None),
            or_(*targets),
        ).update({InAppNotification.read_at: datetime.now(timezone.utc)},
                 synchronize_session=False)
        self.db.commit()
        return n

    # ── direct creation (used by stage_service._safe_notify, backward compat) ──

    def notify_user(self, user_id: uuid.UUID, title: str, message: str, notification_type: str):
        notif = InAppNotification(
            event_id=self.event_id, user_id=user_id,
            title=title, message=message, notification_type=notification_type,
        )
        self.db.add(notif)
        self.db.commit()
        self.db.refresh(notif)
        return notif

    def notify_role(self, role: str, title: str, message: str, notification_type: str):
        notif = InAppNotification(
            event_id=self.event_id, role=role,
            title=title, message=message, notification_type=notification_type,
        )
        self.db.add(notif)
        self.db.commit()
        self.db.refresh(notif)
        return notif

    def list_notifications(self, user_id: uuid.UUID = None, role: str = None):
        query = self.db.query(InAppNotification).filter(InAppNotification.event_id == self.event_id)
        if user_id:
            query = query.filter(InAppNotification.user_id == user_id)
        if role:
            query = query.filter(InAppNotification.role == role)
        return query.order_by(InAppNotification.created_at.desc()).all()