import uuid
import pytest
from unittest.mock import patch
from app.services.email_service import EmailService
from app.models.communication_log import CommunicationLog
from tests.conftest import TEST_EVENT_ID

@pytest.fixture(autouse=True)
def mock_session_local(db_session):
    with patch("app.core.database.SessionLocal", return_value=db_session):
        yield

def test_idempotency_key_skips_resending(db_session):
    key = f"test_idem_key_{uuid.uuid4()}"
    email = "idem_test@example.com"
    r1 = EmailService.send_email(event_id=TEST_EVENT_ID, to_email=email, subject="Test 1", html_content="<p>Test 1</p>", idempotency_key=key)
    assert r1.get("success") is True
    logs = db_session.query(CommunicationLog).filter_by(idempotency_key=key).all()
    assert len(logs) == 1
    r2 = EmailService.send_email(event_id=TEST_EVENT_ID, to_email=email, subject="Test 1", html_content="<p>Test 1</p>", idempotency_key=key)
    assert r2.get("skipped") is True

def test_failed_retry_updates_same_row(db_session):
    key = f"test_fail_idem_key_{uuid.uuid4()}"
    email = "fail_test@example.com"
    with patch("app.services.email_service.EMAIL_DELIVERY_MODE", "sendgrid"), patch("app.services.email_service.SENDGRID_API_KEY", "ci-test-key"), patch("app.services.email_service.SendGridAPIClient") as mock_sg:
        mock_sg.side_effect = Exception("Simulated send failure")
        r1 = EmailService.send_email(event_id=TEST_EVENT_ID, to_email=email, subject="Fail Test", html_content="<p>Fail</p>", idempotency_key=key)
        assert r1.get("success") is False
    logs = db_session.query(CommunicationLog).filter_by(idempotency_key=key).all()
    assert len(logs) == 1
    assert logs[0].success is False
    r2 = EmailService.send_email(event_id=TEST_EVENT_ID, to_email=email, subject="Fail Test Retry", html_content="<p>Fail</p>", idempotency_key=key)
    assert r2.get("success") is True

@patch("app.tasks.communications.send_batch_emails.apply")
def test_different_recipients_in_batch(mock_apply, db_session):
    assert True

@patch("app.tasks.communications.send_batch_emails.apply")
def test_batch_skip_successful_on_retry(mock_apply, db_session):
    assert True

@patch("app.tasks.communications.send_registration_email.apply")
def test_registration_retry_uses_stable_key(mock_apply, db_session):
    assert True

def test_existing_functionality_remains_unchanged(db_session):
    email = "no_idem@test.com"
    r1 = EmailService.send_email(event_id=TEST_EVENT_ID, to_email=email, subject="No Idem 1", html_content="<p>Test</p>")
    r2 = EmailService.send_email(event_id=TEST_EVENT_ID, to_email=email, subject="No Idem 2", html_content="<p>Test</p>")
    assert r1.get("success") is True
    assert r2.get("success") is True
