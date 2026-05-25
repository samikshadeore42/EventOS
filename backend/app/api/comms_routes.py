# File: backend/app/api/comms_routes.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.communication_log import CommunicationLog

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
