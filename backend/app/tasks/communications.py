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
        norm_email = to_email.strip().lower()
        idem_key = f"{self.request.id}:registration:{norm_email}"

        result = EmailService.send_registration_confirmation(
            to_email=to_email,
            participant_name=participant_name,
            event_name=event_name,
            idempotency_key=idem_key
        )
        if not result.get("success"):
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
    results = {"sent": 0, "failed": 0, "simulated": 0, "skipped": 0, "errors": []}
    failed_recipients = []

    for recipient in recipient_list:
        try:
            norm_email = recipient["email"].strip().lower()
            idem_key = f"{self.request.id}:{template}:{norm_email}"

            if template == "registration":
                result = EmailService.send_registration_confirmation(
                    to_email=recipient["email"],
                    participant_name=recipient["name"],
                    event_name=event_name,
                    idempotency_key=idem_key
                )
            elif template == "team_assignment":
                result = EmailService.send_team_assignment(
                    to_email=recipient["email"],
                    participant_name=recipient["name"],
                    team_name=recipient["team_name"],
                    team_members=recipient["team_members"],
                    rationale=recipient.get("rationale", ""),
                    event_name=event_name,
                    idempotency_key=idem_key
                )
            else:
                result = {"success": False, "error": f"Unknown template: {template}"}

            if result.get("success"):
                if result.get("skipped"):
                    results["skipped"] += 1
                elif result.get("simulated"):
                    results["simulated"] += 1
                else:
                    results["sent"] += 1

                # Update participant DB for team links
                if template == "team_assignment":
                    from app.core.database import SessionLocal
                    from app.models.participant import Participant
                    with SessionLocal() as db:
                        participant = db.query(Participant).filter(Participant.email == recipient["email"]).first()
                        if participant:
                            participant.team_link_sent = True
                            db.commit()

            else:
                results["failed"] += 1
                results["errors"].append({"email": recipient["email"], "error": result.get("error")})
                failed_recipients.append(recipient)

        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"email": recipient["email"], "error": str(e)})
            failed_recipients.append(recipient)

    if failed_recipients:
        raise self.retry(
            kwargs={"recipient_list": failed_recipients, "template": template, "event_name": event_name},
            exc=Exception(f"Batch had {len(failed_recipients)} failures, retrying..."),
            countdown=60 * (self.request.retries + 1)
        )

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
    results = {"queued": len(links), "sent": 0, "failed": 0, "simulated": 0, "skipped": 0, "errors": []}
    failed_links = []

    for link in links:
        try:
            norm_email = link["email"].strip().lower()
            idem_key = f"{self.request.id}:access_link:{role}:{stage}:{norm_email}"

            result = EmailService.send_access_link(
                to_email=link["email"],
                recipient_name=link["name"],
                role=role,
                stage=stage,
                portal_url=link["portal_url"],
                expires_in="48 hours",
                idempotency_key=idem_key
            )

            if result.get("success"):
                if result.get("skipped"):
                    results["skipped"] += 1
                elif result.get("simulated"):
                    results["simulated"] += 1
                else:
                    results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append({"email": link["email"], "error": result.get("error")})
                failed_links.append(link)

        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"email": link["email"], "error": str(e)})
            failed_links.append(link)

    if failed_links:
        raise self.retry(
            kwargs={"links": failed_links, "role": role, "stage": stage},
            exc=Exception(f"Access links had {len(failed_links)} failures, retrying..."),
            countdown=60 * (self.request.retries + 1)
        )

    return results


@celery_app.task(
    bind=True,
    base=EmailTask,
    queue="notifications",
    name="app.tasks.communications.send_email_verification_email",
    max_retries=3,
)
def send_email_verification_email(self, to_email: str, recipient_name: str, verification_link: str):
    try:
        norm_email = to_email.strip().lower()
        idem_key = f"{self.request.id}:email_verification:{norm_email}"

        result = EmailService.send_email_verification(
            to_email=to_email,
            recipient_name=recipient_name,
            verification_link=verification_link,
            idempotency_key=idem_key
        )
        if not result.get("success"):
            raise Exception(result.get("error", "Unknown SendGrid error"))
        return result
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@celery_app.task(
    bind=True,
    base=EmailTask,
    queue="notifications",
    name="app.tasks.communications.send_password_reset_email",
    max_retries=3,
)
def send_password_reset_email(self, to_email: str, recipient_name: str, reset_link: str):
    try:
        norm_email = to_email.strip().lower()
        idem_key = f"{self.request.id}:password_reset:{norm_email}"

        result = EmailService.send_password_reset(
            to_email=to_email,
            recipient_name=recipient_name,
            reset_link=reset_link,
            idempotency_key=idem_key
        )
        if not result.get("success"):
            raise Exception(result.get("error", "Unknown SendGrid error"))
        return result
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
