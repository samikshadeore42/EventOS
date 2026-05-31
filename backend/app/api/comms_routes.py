# File: backend/app/api/comms_routes.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.communication_log import CommunicationLog
from pydantic import BaseModel
from app.services.email_service import EmailService

router = APIRouter(prefix="/communications", tags=["Communication Log"])


@router.get("", summary="Get all communication log entries")
def get_communication_log(
    template: str | None = Query(default=None),
    success:  bool | None = Query(default=None),
    page:     int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(CommunicationLog).order_by(CommunicationLog.sent_at.desc())
    if template:
        query = query.filter(CommunicationLog.template == template)
    if success is not None:
        query = query.filter(CommunicationLog.success == success)

    total = query.count()
    logs  = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page":  page,
        "logs": [
            {
                "id":              str(l.id),
                "recipient_email": l.recipient_email,
                "recipient_name":  l.recipient_name,
                "template":        l.template,
                "subject":         l.subject,
                "stage":           l.stage,
                "success":         l.success,
                "error_message":   l.error_message,
                "sent_at":         l.sent_at.isoformat(),
            }
            for l in logs
        ]
    }

class TestEmailRequest(BaseModel):
    to_email: str
    recipient_name: str = "Test User"

@router.post("/test-email", summary="Send a test email to verify delivery")
def test_email(req: TestEmailRequest):
    html_content = f"""
    <h2>Hello {req.recipient_name},</h2>
    <p>This is a test email from EventOS.</p>
    <p>If you are seeing this, your email delivery pipeline is configured correctly.</p>
    """
    
    result = EmailService.send_email(
        to_email=req.to_email,
        subject="EventOS Test Email",
        html_content=html_content,
        recipient_name=req.recipient_name,
        template="test_email",
        stage="system"
    )
    
    return result
