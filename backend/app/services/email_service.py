# File: backend/app/services/email_service.py
import os
import uuid
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader

load_dotenv()

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "noreply@eventos.com")
FROM_NAME = os.getenv("SENDGRID_FROM_NAME", "EventOS Operations")

EMAIL_DELIVERY_MODE = os.getenv("EMAIL_DELIVERY_MODE", "mock").lower()
EMAIL_SENDGRID_FALLBACK_TO_MOCK = os.getenv("EMAIL_SENDGRID_FALLBACK_TO_MOCK", "false").lower() == "true"

# Initialize Jinja2 environment to load templates from our directory
env = Environment(loader=FileSystemLoader("app/templates/emails"))

class EmailService:
    @staticmethod
    def send_email(
        event_id: uuid.UUID, # <-- 1. Require event_id
        to_email: str,
        subject: str,
        html_content: str,
        recipient_name: str = None,
        template: str = "email",
        stage: str = "system",
        idempotency_key: str = None,
        event_name: str = "EventOS Hackathon" 
    ) -> dict:
        """Core method to dispatch via SendGrid or Mock, and log securely to DB."""
        import time
        from app.core.database import SessionLocal
        from app.models.communication_log import CommunicationLog

        db = SessionLocal()
        try:
            existing_log = None
            if idempotency_key:
                # 2. Scope the idempotency check
                existing_log = db.query(CommunicationLog).filter(
                    CommunicationLog.idempotency_key == idempotency_key,
                    CommunicationLog.event_id == event_id 
                ).first()
                if existing_log and existing_log.success:
                    return {
                        "success": True,
                        "skipped": True,
                        "message_id": existing_log.message_id
                    }

            result = {}
            is_mock = (EMAIL_DELIVERY_MODE == "mock")
            if not is_mock and (not SENDGRID_API_KEY or SENDGRID_API_KEY.startswith("SG.your_")):
                is_mock = True
                print("[EmailService] Warning: SENDGRID_API_KEY missing or invalid. Falling back to MOCK mode.")

            # 1. Dispatch Email
            if is_mock:
                print(f"[MOCK EMAIL - {event_name}] To: {to_email} | Subject: {subject}")
                result = {
                    "success": True,
                    "dev": True,
                    "simulated": True,
                    "message_id": f"mock_{int(time.time())}",
                    "provider": "mock",
                    "error": None
                }
            else:
                from sendgrid.helpers.mail import Mail
                message = Mail(
                    from_email=(FROM_EMAIL, FROM_NAME),
                    to_emails=to_email,
                    subject=subject,
                    html_content=html_content
                )
                try:
                    sg = SendGridAPIClient(SENDGRID_API_KEY)
                    response = sg.send(message)
                    if response.status_code in [200, 201, 202]:
                        msg_id = 'unknown'
                        if hasattr(response, 'headers') and 'X-Message-Id' in response.headers:
                            msg_id = response.headers['X-Message-Id']
                        elif isinstance(response.headers, dict):
                            msg_id = response.headers.get('X-Message-Id', 'unknown')

                        result = {
                            "success": True,
                            "dev": False,
                            "simulated": False,
                            "message_id": msg_id,
                            "provider": "sendgrid",
                            "error": None
                        }
                    else:
                        raise Exception(f"SendGrid HTTP {response.status_code}: {getattr(response, 'body', 'No body')}")
                except Exception as e:
                    def _format_sendgrid_error(exc):
                        status = getattr(exc, "status_code", getattr(exc, "code", None))
                        body = getattr(exc, "body", getattr(exc, "read", lambda: None)())

                        if hasattr(exc, "status_code") or hasattr(exc, "body"):
                            if not body:
                                return f"SendGrid HTTP {status or 'Error'}: {str(exc)}"
                            try:
                                body_str = body.decode('utf-8') if isinstance(body, bytes) else str(body)
                                return f"SendGrid HTTP {status or 'Error'}: {body_str}"
                            except Exception:
                                return f"SendGrid HTTP {status or 'Error'}: <Unreadable Body>"
                        return str(exc)

                    error_msg = _format_sendgrid_error(e)

                    if EMAIL_SENDGRID_FALLBACK_TO_MOCK:
                        result = {
                            "success": True,
                            "dev": False,
                            "simulated": True,
                            "message_id": f"mock_fallback_{int(time.time())}",
                            "provider": "mock_fallback",
                            "error": None,
                            "provider_error": error_msg
                        }
                    else:
                        result = {
                            "success": False,
                            "dev": False,
                            "simulated": False,
                            "message_id": None,
                            "provider": "sendgrid",
                            "error": error_msg
                        }

            # 2. Log securely to Database
            if existing_log:
                existing_log.recipient_email = to_email
                existing_log.recipient_name = recipient_name or to_email
                existing_log.template = template
                existing_log.subject = subject
                existing_log.stage = stage
                existing_log.success = result.get("success", False)
                existing_log.error_message = result.get("provider_error") or result.get("error")
                existing_log.message_id = result.get("message_id")
            else:
                log = CommunicationLog(
                    event_id=event_id, # <-- 3. Bind to the event
                    recipient_email=to_email,
                    recipient_name=recipient_name or to_email,
                    template=template,
                    subject=subject,
                    stage=stage,
                    success=result.get("success", False),
                    error_message=result.get("provider_error") or result.get("error"),
                    message_id=result.get("message_id"),
                    idempotency_key=idempotency_key,
                )
                db.add(log)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Failed to log email communication: {str(e)}")
            if 'result' not in locals():
                result = {"success": False, "error": str(e)}
        finally:
            db.close()

        return result

    @staticmethod
    def send_registration_confirmation(event_id: uuid.UUID, to_email: str, participant_name: str, event_name: str, idempotency_key: str = None) -> dict:
        """Renders and sends the registration template."""
        template = env.get_template("registration.html")
        html_content = template.render(
            participant_name=participant_name,
            event_name=event_name,
            support_email="support@eventos.com"
        )
        subject = f"Welcome to {event_name}! Registration Confirmed"
        return EmailService.send_email(
            event_id, to_email, subject, html_content,
            recipient_name=participant_name, template="registration", stage="registration",
            idempotency_key=idempotency_key, event_name=event_name
        )

    @staticmethod
    def send_team_assignment(event_id: uuid.UUID, to_email: str, participant_name: str, team_name: str, team_members: list, rationale: str, event_name: str, idempotency_key: str = None) -> dict:
        """Renders and sends the team assignment template."""
        template = env.get_template("team_assignment.html")
        html_content = template.render(
            participant_name=participant_name,
            team_name=team_name,
            team_members=team_members,
            rationale=rationale,
            event_name=event_name,
            support_email="support@eventos.com"
        )
        subject = f"You have been assigned to {team_name}!"
        return EmailService.send_email(
            event_id, to_email, subject, html_content,
            recipient_name=participant_name, template="team_assignment", stage="team_formation",
            idempotency_key=idempotency_key, event_name=event_name
        )

    @staticmethod
    def send_access_link(event_id: uuid.UUID, to_email: str, recipient_name: str, role: str, stage: str, portal_url: str, expires_in: str, event_name: str = "EventOS Hackathon", idempotency_key: str = None) -> dict:
        """Sends a magic access link using dynamic event names."""
        import os
        from sendgrid import SendGridAPIClient

        role_lower = role.lower()
        first_name = recipient_name.split(" ")[0]

        if role_lower in ["judge", "evaluator"]:
            try:
                template = env.get_template("evaluator_link.html")
                html_content = template.render(
                    evaluator_name=first_name,
                    portal_url=portal_url,
                    expires_in=expires_in,
                    event_name=event_name
                )
                subject = f"Your {event_name} Judge Portal Access"

                return EmailService.send_email(
                    event_id, to_email, subject, html_content,
                    recipient_name=recipient_name, template="evaluator_link", stage=stage,
                    idempotency_key=idempotency_key, event_name=event_name
                )

            except Exception as e:
                print(f"Failed to render evaluator template: {e}")
                return {"success": False, "error": str(e)}

        elif role_lower == "mentor":
            try:
                template = env.get_template("mentor_link.html")
                html_content = template.render(
                    mentor_name=first_name,
                    portal_url=portal_url,
                    expires_in=expires_in,
                    event_name=event_name
                )
                subject = f"Your {event_name} Mentor Portal Access"

                return EmailService.send_email(
                    event_id, to_email, subject, html_content,
                    recipient_name=recipient_name, template="mentor_link", stage=stage,
                    idempotency_key=idempotency_key, event_name=event_name
                )
            except Exception as e:
                print(f"Failed to render mentor template: {e}")
                return {"success": False, "error": str(e)}

        else:
            try:
                template = env.get_template("participant_link.html")
                html_content = template.render(
                    participant_name=first_name,
                    portal_url=portal_url,
                    expires_in=expires_in,
                    event_name=event_name
                )
                subject = f"Your {event_name} Participant Portal Access"

                return EmailService.send_email(
                    event_id, to_email, subject, html_content,
                    recipient_name=recipient_name, template="participant_link", stage=stage,
                    idempotency_key=idempotency_key, event_name=event_name
                )
            except Exception as e:
                print(f"Failed to render participant template: {e}")
                return {"success": False, "error": str(e)}