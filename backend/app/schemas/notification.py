from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

class NotificationBase(BaseModel):
    user_id: str
    message: str
    type: str

class NotificationCreate(NotificationBase):
    pass

class NotificationResponse(NotificationBase):
    id: UUID
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
