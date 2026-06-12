import json
import logging
import asyncio
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict

from app.core.database import get_db
from app.schemas.notification import NotificationResponse, NotificationCreate
from app.services.notification_service import NotificationService
from app.core.redis_client import REDIS_URL

import redis.asyncio as aioredis

router = APIRouter()
logger = logging.getLogger(__name__)

# Active WebSocket connections: {user_id: [WebSocket, ...]}
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"User {user_id} connected to notifications WebSocket.")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
            logger.info(f"User {user_id} disconnected from notifications WebSocket.")

    async def send_personal_message(self, message: str, user_id: str):
        if user_id == "all":
            for connections in self.active_connections.values():
                for connection in connections:
                    try:
                        await connection.send_text(message)
                    except Exception as e:
                        logger.error(f"Error sending global message: {str(e)}")
            return

        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.error(f"Error sending message to {user_id}: {str(e)}")

manager = ConnectionManager()

# Background task to listen to Redis Pub/Sub
async def redis_listener():
    while True:
        try:
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            pubsub = redis_client.pubsub()
            await pubsub.subscribe("notifications_channel")
            logger.info("Started Redis Pub/Sub listener for notifications.")
            
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message["type"] == "message":
                    data = json.loads(message["data"])
                    user_id = data.get("user_id")
                    if user_id:
                        await manager.send_personal_message(json.dumps(data), user_id)
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            logger.info("Redis listener task cancelled.")
            break
        except Exception as e:
            logger.error(f"Redis listener error: {str(e)}. Retrying in 5 seconds...")
            await asyncio.sleep(5)

@router.on_event("startup")
async def startup_event():
    # Start the Redis listener in the background when the app starts
    asyncio.create_task(redis_listener())

@router.websocket("/ws/notifications/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            # We just keep the connection alive, maybe receive ping/pong if needed
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)

@router.get("/notifications/{user_id}", response_model=List[NotificationResponse])
def get_notifications(user_id: str, db: Session = Depends(get_db)):
    """Fetch past notifications for a user."""
    return NotificationService.get_user_notifications(db, user_id)

@router.post("/notifications/trigger", response_model=NotificationResponse)
def trigger_notification(notification: NotificationCreate, db: Session = Depends(get_db)):
    """
    Demo/Admin endpoint to manually trigger a notification.
    """
    return NotificationService.create_notification(db, notification)

@router.post("/notifications/{notification_id}/read")
def mark_notification_as_read(notification_id: str, db: Session = Depends(get_db)):
    """Mark a single notification as read."""
    NotificationService.mark_as_read(db, notification_id)
    return {"success": True}

@router.post("/notifications/user/{user_id}/read-all")
def mark_all_notifications_as_read(user_id: str, db: Session = Depends(get_db)):
    """Mark all notifications as read for a specific user."""
    count = NotificationService.mark_all_as_read(db, user_id)
    return {"success": True, "count": count}
