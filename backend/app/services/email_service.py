# File: backend/app/services/email_service.py
import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader

load_dotenv()

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "noreply@eventos.com")
FROM_NAME = os.getenv("SENDGRID_FROM_NAME", "EventOS Operations")

# Initialize Jinja2 environment to load templates from our directory
env = Environment(loader=FileSystemLoader("app/templates/emails"))

class EmailService:
    @staticmethod
    def _send_email(to_email: str, subject: str, html_content: str) -> dict:
        """Core internal method to dispatch via SendGrid and log to DB."""
        result = {}

        # 1. Dispatch Email (or Mock it)
        if not SENDGRID_API_KEY or SENDGRID_API_KEY.startswith("SG.xxx"):
            print(f"[MOCK EMAIL] To: {to_email} | Subject: {subject}")
            result = {"success": True, "dev": True, "message_id": "mock_id"}
        else:
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
                    # Grab message ID from headers if possible
                    msg_id = response.headers.get('X-Message-Id', 'unknown')
                    result = {"success": True, "message_id": msg_id}
                else:
                    result = {"success": False, "error": f"Status: {response.status_code}"}
            except Exception as e:
                result = {"success": False, "error": str(e)}
    
        # 2. Log to Database
        try:
            from app.core.database import SessionLocal
            from app.models.communication_log import CommunicationLog
            db = SessionLocal()
            log = CommunicationLog(
                recipient_email=to_email,
                recipient_name=to_email,   # name not available here — override in callers if needed
                template="email",
                subject=subject,
                stage="system",
                success=result.get("success", False),
                error_message=result.get("error"),
                message_id=result.get("message_id"),
            )
            db.add(log)
            db.commit()
            db.close()
        except Exception as e:
            print(f"Failed to log email communication: {str(e)}")
            pass  # never let logging block the email result
            
        # 3. Finally, return the outcome
        return result

    @staticmethod
    def send_registration_confirmation(to_email: str, participant_name: str, event_name: str) -> dict:
        """Renders and sends the registration template."""
        template = env.get_template("registration.html")
        html_content = template.render(
            participant_name=participant_name,
            event_name=event_name,
            support_email="support@eventos.com"
        )
        subject = f"Welcome to {event_name}! Registration Confirmed"
        return EmailService._send_email(to_email, subject, html_content)

    @staticmethod
    def send_team_assignment(to_email: str, participant_name: str, team_name: str, team_members: list, rationale: str, event_name: str) -> dict:
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
        return EmailService._send_email(to_email, subject, html_content)