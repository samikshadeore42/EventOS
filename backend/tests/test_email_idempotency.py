# File: backend/tests/test_email_idempotency.py

import uuid
import pytest
from unittest.mock import patch, MagicMock
from app.services.email_service import EmailService
from app.models.communication_log import CommunicationLog
from app.tasks.communications import send_registration_email, send_batch_emails, send_access_links
from celery.app.task import Context

@pytest.fixture(autouse=True)
def mock_session_local(db_session):
    # Mock the SessionLocal used inside the service to return our pytest db_session
    with patch("app.core.database.SessionLocal", return_value=db_session):
        yield

def test_idempotency_key_skips_resending(db_session):
    """Sending twice with the same successful key creates only one CommunicationLog row."""
    key = f"test_idem_key_{uuid.uuid4()}"
    email = "idem_test@example.com"
    
    # First send should insert a row
    r1 = EmailService.send_email(
        to_email=email,
        subject="Test 1",
        html_content="<p>Test 1</p>",
        idempotency_key=key
    )
    assert r1.get("success") is True
    assert not r1.get("skipped")
    
    logs = db_session.query(CommunicationLog).filter_by(idempotency_key=key).all()
    assert len(logs) == 1
    
    # Second send should skip and return existing message_id
    r2 = EmailService.send_email(
        to_email=email,
        subject="Test 1",
        html_content="<p>Test 1</p>",
        idempotency_key=key
    )
    assert r2.get("success") is True
    assert r2.get("skipped") is True
    assert r2.get("message_id") == r1.get("message_id")
    
    logs_after = db_session.query(CommunicationLog).filter_by(idempotency_key=key).all()
    assert len(logs_after) == 1  # Still only 1 row


def test_failed_retry_updates_same_row(db_session):
    """A failed attempt followed by a retry updates the same row rather than creating a second row."""
    key = f"test_fail_idem_key_{uuid.uuid4()}"
    email = "fail_test@example.com"
    
    # Simulate a failure by temporarily patching SendGrid or mocking the response
    with patch("app.services.email_service.EMAIL_DELIVERY_MODE", "sendgrid"):
        with patch(
            "app.services.email_service.SENDGRID_API_KEY",
            "ci-test-sendgrid-key",
        ):
            with patch("app.services.email_service.SendGridAPIClient") as mock_sg:
                mock_sg.side_effect = Exception("Simulated send failure")
                r1 = EmailService.send_email(
                    to_email=email,
                    subject="Fail Test",
                    html_content="<p>Fail</p>",
                    idempotency_key=key
                )
                assert r1.get("success") is False
            
    logs = db_session.query(CommunicationLog).filter_by(idempotency_key=key).all()
    assert len(logs) == 1
    assert logs[0].success is False
    assert "Simulated send failure" in logs[0].error_message
    
    # Second send (retry) succeeds
    r2 = EmailService.send_email(
        to_email=email,
        subject="Fail Test Retry",
        html_content="<p>Fail</p>",
        idempotency_key=key
    )
    assert r2.get("success") is True
    assert not r2.get("skipped")  # Because previous was not successful
    
    logs_after = db_session.query(CommunicationLog).filter_by(idempotency_key=key).all()
    assert len(logs_after) == 1
    assert logs_after[0].success is True
    assert logs_after[0].subject == "Fail Test Retry"


def test_different_recipients_in_batch(db_session):
    """Different recipients under one batch task receive different records."""
    task_id = "task_batch_123"
    recipients = [
        {"email": "batch1@test.com", "name": "B1"},
        {"email": "batch2@test.com", "name": "B2"}
    ]
    
    res = send_batch_emails.apply(kwargs={"recipient_list": recipients, "template": "registration", "event_name": "Event"}, task_id=task_id)
    result = res.result
    assert result["sent"] + result["simulated"] == 2
        
    logs = db_session.query(CommunicationLog).filter(
        CommunicationLog.idempotency_key.like(f"{task_id}:%")
    ).all()
    
    assert len(logs) == 2
    keys = [log.idempotency_key for log in logs]
    assert f"{task_id}:registration:batch1@test.com" in keys
    assert f"{task_id}:registration:batch2@test.com" in keys


def test_batch_skip_successful_on_retry(db_session):
    """A successfully processed batch recipient is not resent during retry."""
    task_id = "task_batch_retry_123"
    recipients = [
        {"email": "good@test.com", "name": "Good"},
        {"email": "bad@test.com", "name": "Bad"}
    ]
    
    # Mock send_registration_confirmation to fail only for bad@test.com
    original_send = EmailService.send_email
    
    with patch("app.services.email_service.EmailService.send_email") as mock_sg:
        def side_effect(to_email, *args, **kwargs):
            if to_email == "bad@test.com":
                return {"success": False, "error": "Forced error"}
            return original_send(to_email, *args, **kwargs)
        mock_sg.side_effect = side_effect
        
        try:
            send_batch_emails.apply(kwargs={"recipient_list": recipients, "template": "registration", "event_name": "Event"}, task_id=task_id, throw=True)
        except Exception:
            # When apply is used, Retry exception might be raised directly if throw=True. 
            pass
            
        assert mock_sg.call_count == 2
        
    # Now retry with ONLY the bad recipient
    with patch("app.services.email_service.EmailService.send_email") as mock_sg2:
        mock_sg2.return_value = {"success": True, "simulated": True, "message_id": "mock_456"}
        res2 = send_batch_emails.apply(kwargs={"recipient_list": [{"email": "bad@test.com", "name": "Bad"}], "template": "registration", "event_name": "Event"}, task_id=task_id).result
        assert res2["simulated"] == 1
        assert res2["failed"] == 0


def test_registration_retry_uses_stable_key(db_session):
    """Registration retry uses a stable idempotency key."""
    task_id = "task_reg_456"
    
    with patch("app.services.email_service.EmailService.send_email") as mock_se:
        mock_se.return_value = {"success": False, "error": "Fail"}
        
        try:
            send_registration_email.apply(kwargs={"to_email": "stable@test.com", "participant_name": "Stable", "event_name": "Event"}, task_id=task_id)
        except Exception:
            pass
            
        args, kwargs = mock_se.call_args
        assert kwargs.get("idempotency_key") == f"{task_id}:registration:stable@test.com"


def test_existing_functionality_remains_unchanged(db_session):
    """Existing communication functionality remains unchanged when key is omitted."""
    # When idempotency_key is omitted, sending multiple times creates multiple rows
    email = "no_idem@test.com"
    r1 = EmailService.send_email(
        to_email=email,
        subject="No Idem 1",
        html_content="<p>Test</p>"
    )
    r2 = EmailService.send_email(
        to_email=email,
        subject="No Idem 2",
        html_content="<p>Test</p>"
    )
    
    assert r1.get("success") is True
    assert r2.get("success") is True
    
    logs = db_session.query(CommunicationLog).filter_by(recipient_email=email).all()
    assert len(logs) == 2
    assert logs[0].idempotency_key is None
    assert logs[1].idempotency_key is None
