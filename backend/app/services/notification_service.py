import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import or_

# Models
from app.models.notification import InAppNotification
from app.models.notification_outbox import NotificationOutbox
from app.models.user import User
from app.models.event import Event
from app.models.organization_membership import OrganizationMembership

_ORG_STAFF_ROLES = {"owner", "admin"}

class NotificationService:
    def __init__(self, db: Session, event_id: uuid.UUID):
        self.db = db
        self.event_id = event_id

    # ── Transactional Outbox Entry ──────────────────────────────────────────

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

    # ── Delivery & Helper Logic ─────────────────────────────────────────────

    def resolve_recipients(self, outbox: NotificationOutbox) -> List[Dict]:
        if outbox.recipient_user_id:
            user = self.db.query(User).filter(User.id == outbox.recipient_user_id).first()
            email = getattr(user, "email", None) if user else None
            return [{"user_id": outbox.recipient_user_id, "role": None, "email": email}]

        role = outbox.recipient_role
        if role in _ORG_STAFF_ROLES:
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

        return [{"user_id": None, "role": role, "email": None}]

    def create_inapp_idempotent(self, outbox: NotificationOutbox, recipient: dict, commit: bool = True) -> InAppNotification:
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

    # ── User API Methods ────────────────────────────────────────────────────

    def list_for_user(self, user_id: uuid.UUID, roles: Optional[list[str]] = None, unread_only: bool = False, limit: int = 50):
        q = self.db.query(InAppNotification).filter(InAppNotification.event_id == self.event_id)
        targets = [InAppNotification.user_id == user_id]
        if roles:
            targets.append(InAppNotification.role.in_(roles))
        q = q.filter(or_(*targets))
        if unread_only:
            q = q.filter(InAppNotification.read_at.is_(None))
        return q.order_by(InAppNotification.created_at.desc()).limit(limit).all()

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