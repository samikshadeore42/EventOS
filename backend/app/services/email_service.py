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

EMAIL_DELIVERY_MODE = os.getenv("EMAIL_DELIVERY_MODE", "mock").lower()

# Initialize Jinja2 environment to load templates from our directory
env = Environment(loader=FileSystemLoader("app/templates/emails"))

class EmailService:
    @staticmethod
    def send_email(
        to_email: str,
        subject: str,
        html_content: str,
        recipient_name: str = None,
        template: str = "email",
        stage: str = "system"
    ) -> dict:
        """Core method to dispatch via SendGrid or Mock, and log to DB."""
        import time
        result = {}

        is_mock = (EMAIL_DELIVERY_MODE == "mock")
        if not is_mock and (not SENDGRID_API_KEY or SENDGRID_API_KEY.startswith("SG.your_")):
            # Fallback to mock if sendgrid is requested but key is missing/invalid
            is_mock = True
            print("[EmailService] Warning: SENDGRID_API_KEY missing or invalid. Falling back to MOCK mode.")

        # 1. Dispatch Email
        if is_mock:
            print(f"[MOCK EMAIL] To: {to_email} | Subject: {subject}")
            result = {
                "success": True, 
                "dev": True, 
                "simulated": True, 
                "message_id": f"mock_{int(time.time())}",
                "provider": "mock",
                "error": None
            }
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
                    result = {
                        "success": False, 
                        "dev": False,
                        "simulated": False,
                        "message_id": None,
                        "provider": "sendgrid",
                        "error": f"Status: {response.status_code}"
                    }
            except Exception as e:
                result = {
                    "success": False, 
                    "dev": False,
                    "simulated": False,
                    "message_id": None,
                    "provider": "sendgrid",
                    "error": str(e)
                }
    
        # 2. Log to Database
        try:
            from app.core.database import SessionLocal
            from app.models.communication_log import CommunicationLog
            db = SessionLocal()
            log = CommunicationLog(
                recipient_email=to_email,
                recipient_name=recipient_name or to_email,
                template=template,
                subject=subject,
                stage=stage,
                success=result.get("success", False),
                error_message=result.get("error"),
                message_id=result.get("message_id"),
            )
            db.add(log)
            db.commit()
            db.close()
        except Exception as e:
            print(f"Failed to log email communication: {str(e)}")
            pass
            
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
        return EmailService.send_email(
            to_email, subject, html_content, 
            recipient_name=participant_name, template="registration", stage="registration"
        )

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
        return EmailService.send_email(
            to_email, subject, html_content,
            recipient_name=participant_name, template="team_assignment", stage="team_formation"
        )

   @staticmethod
    def send_access_link(to_email: str, recipient_name: str, role: str, stage: str, portal_url: str, expires_in: str) -> dict:
        """Sends a magic access link using the custom SendGrid Dynamic Template."""
        import os
        from sendgrid import SendGridAPIClient
        
        # 1. Preserve Teammate's Simulation Feature
        api_key = os.environ.get('SENDGRID_API_KEY')
        if not api_key or api_key == "SIMULATE":
            print(f"🛑 SIMULATED EMAIL to {to_email}: {portal_url}")
            return {"success": True, "simulated": True}

        # 2. Fire the actual SendGrid Dynamic Template!
        try:
            sg = SendGridAPIClient(api_key)
            sender_email = os.environ.get('SENDGRID_FROM_EMAIL', 'eventos862404@gmail.com')
            
            message = {
                "personalizations": [
                    {
                        "to": [{"email": to_email, "name": recipient_name}],
                        "dynamic_template_data": {
                            "first_name": recipient_name.split(" ")[0],
                            "team_name": "Your Assigned Team", 
                            "magic_link": portal_url
                        }
                    }
                ],
                "from": {"email": sender_email, "name": "EventOS@TI"},
                # Your exact Template ID
                "template_id": "d-c486747eb35f4ed0acb2e1fb8dbc09f8" 
            }
            
            response = sg.client.mail.send.post(request_body=message)
            
            if response.status_code in [200, 201, 202]:
                return {"success": True, "simulated": False}
            else:
                return {"success": False, "error": str(response.body)}
                
        except Exception as e:
            return {"success": False, "error": str(e)}
