# File: backend/app/tasks/communications.py
#
# CONCEPT: This is a Celery task — a function that runs in the
# BACKGROUND, separate from your API server.
#
# Flow:
# API receives request → enqueues task to Redis → returns 202 immediately
#                    ↓
#                 Celery worker picks it up
#                    ↓
#                 Calls SendGrid → email sent
#
# The API never waits for email to send. This keeps it fast.

from email import message
import os
from celery import Task
from sendgrid import SendGridAPIClient
from app.core.celery_app import celery_app
from app.services.email_service import EmailService

class EmailTask(Task):
    """Base class for email tasks — adds error handling."""
    abstract = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        print(f"❌ Email task {task_id} failed: {exc}")

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        print(f"🔄 Email task {task_id} retrying: {exc}")

    def on_success(self, retval, task_id, args, kwargs):
        print(f"✅ Email task {task_id} succeeded")


@celery_app.task(
    bind=True,
    base=EmailTask,
    queue="notifications",
    name="app.tasks.communications.send_registration_email",
    max_retries=3,
    default_retry_delay=60,   # wait 60s before retry
)
def send_registration_email(self, to_email: str, participant_name: str, event_name: str):
    """
    Celery task: send a single registration confirmation email.
    `bind=True` gives us access to `self` for retries.
    """
    try:
        result = EmailService.send_registration_confirmation(
            to_email=to_email,
            participant_name=participant_name,
            event_name=event_name,
        )
        if not result["success"]:
            # Trigger a retry if SendGrid failed
            raise Exception(result.get("error", "Unknown SendGrid error"))
        return result

    except Exception as exc:
        # self.retry re-queues this task with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@celery_app.task(
    bind=True,
    base=EmailTask,
    queue="notifications",
    name="app.tasks.communications.send_batch_emails",
    max_retries=2,
)
def send_batch_emails(self, recipient_list: list, template: str, event_name: str):
    """
    Celery task: send emails to multiple participants at once.
    recipient_list = [{"email": "x@y.com", "name": "Priya", ...}, ...]
    """
    results = {"sent": 0, "failed": 0, "simulated": 0, "errors": []}

    for recipient in recipient_list:
        try:
            if template == "registration":
                result = EmailService.send_registration_confirmation(
                    to_email=recipient["email"],
                    participant_name=recipient["name"],
                    event_name=event_name,
                )
            elif template == "team_assignment":
                result = EmailService.send_team_assignment(
                    to_email=recipient["email"],
                    participant_name=recipient["name"],
                    team_name=recipient["team_name"],
                    team_members=recipient["team_members"],
                    rationale=recipient.get("rationale", ""),
                    event_name=event_name,
                )
            else:
                result = {"success": False, "error": f"Unknown template: {template}"}

            if result["success"]:
                if result.get("simulated"):
                    results["simulated"] += 1
                else:
                    results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append({"email": recipient["email"], "error": result.get("error")})

        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"email": recipient["email"], "error": str(e)})

    return results



@celery_app.task(
    bind=True,
    base=EmailTask,
    queue="notifications",
    name="app.tasks.communications.send_access_links",
    max_retries=2,
    default_retry_delay=120,
)
def send_access_links(self, links: list, role: str, stage: str):
    results = {"sent": 0, "failed": 0, "simulated": 0, "errors": []}

    for link in links:
        try:
            result = EmailService.send_access_link(
                to_email=link["email"],
                recipient_name=link["name"],
                role=role,
                stage=stage,
                portal_url=link["portal_url"],
                expires_in="48 hours"
            )

            if result["success"]:
                if result.get("simulated"):
                    results["simulated"] += 1
                else:
                    results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append({"email": link["email"], "error": result.get("error")})

        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"email": link["email"], "error": str(e)})

    return results
