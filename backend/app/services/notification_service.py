import uuid
from sqlalchemy.orm import Session
from app.models.notification import InAppNotification

class NotificationService:
    def __init__(self, db: Session, event_id: uuid.UUID):
        self.db = db
        self.event_id = event_id

    def notify_user(self, user_id: uuid.UUID, title: str, message: str, notification_type: str):
        notif = InAppNotification(
            event_id=self.event_id,
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type
        )
        self.db.add(notif)
        self.db.commit()
        self.db.refresh(notif)
        return notif

    def notify_role(self, role: str, title: str, message: str, notification_type: str):
        notif = InAppNotification(
            event_id=self.event_id,
            role=role,
            title=title,
            message=message,
            notification_type=notification_type
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
