import json
import logging
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

class NotificationService:
    @staticmethod
    def create_notification(db: Session, notification_in: NotificationCreate) -> Notification:
        # 1. Save to DB
        db_notification = Notification(
            user_id=notification_in.user_id,
            message=notification_in.message,
            type=notification_in.type
        )
        db.add(db_notification)
        db.commit()
        db.refresh(db_notification)
        
        # 2. Publish to Redis Pub/Sub
        try:
            redis_client = get_redis()
            payload = {
                "id": str(db_notification.id),
                "user_id": db_notification.user_id,
                "message": db_notification.message,
                "type": db_notification.type,
                "is_read": db_notification.is_read,
                "created_at": db_notification.created_at.isoformat()
            }
            # Publish to a general notifications channel
            redis_client.publish("notifications_channel", json.dumps(payload))
            logger.info(f"Published notification for {db_notification.user_id} to Redis")
        except Exception as e:
            logger.error(f"Failed to publish notification to Redis: {str(e)}")
            
        return db_notification

    @staticmethod
    def get_user_notifications(db: Session, user_id: str, limit: int = 50):
        return db.query(Notification).filter(
            Notification.user_id.in_([user_id, "all"])
        ).order_by(Notification.created_at.desc()).limit(limit).all()

    @staticmethod
    def mark_as_read(db: Session, notification_id: str):
        notification = db.query(Notification).filter(Notification.id == notification_id).first()
        if notification:
            notification.is_read = True
            db.commit()
            db.refresh(notification)
        return notification

    @staticmethod
    def mark_all_as_read(db: Session, user_id: str):
        notifications = db.query(Notification).filter(
            Notification.user_id.in_([user_id, "all"]),
            Notification.is_read == False
        ).all()
        for n in notifications:
            n.is_read = True
        db.commit()
        return len(notifications)
