# File: backend/app/schemas/email_schemas.py
from pydantic import BaseModel, EmailStr
from typing import List, Optional

class EmailSendRequest(BaseModel):
    """Used when an admin manually triggers an email send."""
    to_email: EmailStr
    participant_name: str
    template: str  # "registration" | "team_assignment"

class BulkEmailRequest(BaseModel):
    """Triggers a Celery batch email task."""
    participant_ids: List[str]
    template: str
    event_name: str = "WiSE@TI Hackathon"

class EmailSendResult(BaseModel):
    success: bool
    message_id: Optional[str] = None
    error: Optional[str]      = None
    dev: bool                 = False