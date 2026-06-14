# File: backend/app/api/comms_routes.py
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- Import Bouncer
from app.models.communication_log import CommunicationLog
from pydantic import BaseModel
import os
from app.services.email_service import EmailService

# Update Prefix
router = APIRouter(prefix="/events/{event_id}/communications", tags=["Communication Log"])


@router.get("", summary="Get all communication log entries")
def get_communication_log(
    template: str | None = Query(default=None),
    success:  bool | None = Query(default=None),
    page:     int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    scope: ScopedEventService = Depends(get_event_scope),
):
    # Securely scope logs to this specific event
    query = scope.db.query(CommunicationLog).filter(CommunicationLog.event_id == scope.event_id).order_by(CommunicationLog.sent_at.desc())
    
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

@router.get("/diagnostics", summary="Get email delivery diagnostics")
def get_email_diagnostics(scope: ScopedEventService = Depends(get_event_scope)):
    mode = os.getenv("EMAIL_DELIVERY_MODE", "mock").lower()
    api_key = os.getenv("SENDGRID_API_KEY") or ""
    from_email = os.getenv("SENDGRID_FROM_EMAIL")
    frontend_base = os.getenv("FRONTEND_BASE_URL")
    frontend_url = os.getenv("FRONTEND_URL")
    
    key_present = bool(api_key)
    looks_real = key_present and not api_key.startswith("SG.your_")
    key_prefix = api_key[:7] + "..." if key_present else None
    
    redis_url = os.getenv("REDIS_URL")
    
    notes = []
    
    if mode == "sendgrid" and not key_present:
        notes.append("Warning: EMAIL_DELIVERY_MODE is 'sendgrid' but SENDGRID_API_KEY is missing.")
    elif mode == "sendgrid" and not looks_real:
        notes.append("Warning: EMAIL_DELIVERY_MODE is 'sendgrid' but SENDGRID_API_KEY looks like a placeholder.")
    
    if mode == "sendgrid" and not from_email:
        notes.append("Warning: SENDGRID_FROM_EMAIL is missing.")
        
    if mode == "mock":
        notes.append("Note: Running in 'mock' mode. Emails are simulated and will only appear in the Communication Log, not sent externally.")
        
    if frontend_base and frontend_url and frontend_base != frontend_url:
        notes.append(f"Warning: FRONTEND_BASE_URL ({frontend_base}) and FRONTEND_URL ({frontend_url}) mismatch. FRONTEND_BASE_URL will be preferred.")
    elif not frontend_base and not frontend_url:
        notes.append("Warning: Neither FRONTEND_BASE_URL nor FRONTEND_URL is set. Magic links will default to http://localhost:5173.")
        
    if not redis_url:
        notes.append("Warning: REDIS_URL is not set. Background tasks (like bulk dispatch) may fail.")
        
    notes.append("If SendGrid returns 403, verify API key has Mail Send permission and SENDGRID_FROM_EMAIL is a verified sender identity.")
        
    return {
        "email_delivery_mode": mode,
        "sendgrid_api_key_present": key_present,
        "sendgrid_api_key_looks_real": looks_real,
        "sendgrid_key_prefix": key_prefix,
        "from_email": from_email,
        "from_name": os.getenv("SENDGRID_FROM_NAME"),
        "frontend_base_url": frontend_base or frontend_url or "http://localhost:5173",
        "redis_url_present": bool(redis_url),
        "backend_env_loaded": True,
        "notes": notes
    }

class TestEmailRequest(BaseModel):
    to_email: str
    recipient_name: str = "Test User"

@router.post("/test-email", summary="Send a test email to verify delivery")
def test_email(req: TestEmailRequest, scope: ScopedEventService = Depends(get_event_scope)):
    html_content = f"""
    <h2>Hello {req.recipient_name},</h2>
    <p>This is a test email from {scope.event.name}.</p>
    <p>If you are seeing this, your email delivery pipeline is configured correctly.</p>
    """
    
    # Pass event_id and event_name down to EmailService to ensure logs are tied to this event
    result = EmailService.send_email(
        event_id=scope.event_id,
        to_email=req.to_email,
        subject=f"{scope.event.name} Test Email",
        html_content=html_content,
        recipient_name=req.recipient_name,
        template="test_email",
        stage="system",
        event_name=scope.event.name
    )
    
    return result

class PreflightRequest(BaseModel):
    to_email: str | None = None
    recipient_name: str | None = None

@router.post("/preflight-sendgrid", summary="Preflight check for SendGrid configuration")
def preflight_sendgrid(req: PreflightRequest, scope: ScopedEventService = Depends(get_event_scope)):
    mode = os.getenv("EMAIL_DELIVERY_MODE", "mock").lower()
    from_email = os.getenv("SENDGRID_FROM_EMAIL")
    
    if not req.to_email:
        return {
            "success": True,
            "provider": mode,
            "message_id": "preflight_only",
            "from_email": from_email,
            "mode": mode
        }
        
    html_content = "<p>Preflight test email</p>"
    result = EmailService.send_email(
        event_id=scope.event_id,
        to_email=req.to_email,
        subject=f"{scope.event.name} Preflight Test",
        html_content=html_content,
        recipient_name=req.recipient_name or "Test",
        template="test_email",
        stage="system",
        event_name=scope.event.name
    )
    
    if result.get("success"):
        return {
            "success": True,
            "provider": result.get("provider", mode),
            "message_id": result.get("message_id"),
            "from_email": from_email,
            "mode": mode
        }
    else:
        return {
            "success": False,
            "provider": result.get("provider", mode),
            "error": result.get("error", result.get("provider_error", "Unknown error")),
            "hint": "Check API key Mail Send permission and verified sender identity."
        }