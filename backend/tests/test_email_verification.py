import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import Base, engine, SessionLocal
from app.models.auth_tokens import EmailVerificationToken
from app.models.communication_log import CommunicationLog
from app.models.user import User
import uuid
from unittest.mock import patch

@pytest.fixture(autouse=True)
def clear_logs(db_session):
    db_session.query(CommunicationLog).delete()
    db_session.commit()

@patch('app.tasks.communications.send_email_verification_email.delay')
def test_registration_creates_email_job_and_verification_flow(mock_delay, client, db_session):
    # 1. Register organization
    email = f"owner_{uuid.uuid4()}@example.com"
    org_slug = f"org_{uuid.uuid4()}"
    
    response = client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Owner",
        "email": email,
        "password": "SuperSecretPassword123!",
        "organization_name": "Test Org",
        "organization_slug": org_slug
    })
    
    assert response.status_code == 200
    user_data = response.json()
    assert user_data["email"] == email
    
    # 2. Assert email job created
    assert mock_delay.called
    args, kwargs = mock_delay.call_args
    assert args[0] == email
    assert args[1] == "Test"
    assert "http://localhost:5173/auth/verify-email?token=" in args[2]
    
    raw_token = args[2].split("token=")[1]
    
    db_session.commit()
    # 3. Assert raw token is not stored (only hash)
    user = db_session.query(User).filter(User.email == email).first()
    token_record = db_session.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
    assert token_record.token_hash != raw_token
    
    # 4. Verify succeeds
    verify_response = client.post(f"/auth/verify-email?token={raw_token}")
    assert verify_response.status_code == 200
    assert verify_response.json()["status"] == "verified"
    
    # 5. Used token fails safely (or returns already_verified)
    verify_again = client.post(f"/auth/verify-email?token={raw_token}")
    assert verify_again.status_code == 200
    assert verify_again.json()["status"] == "already_verified"

@patch('app.tasks.communications.send_email_verification_email.delay')
def test_resend_verification_creates_new_token(mock_delay, client, db_session):
    email = f"resend_{uuid.uuid4()}@example.com"
    org_slug = f"org_{uuid.uuid4()}"
    
    client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Resend",
        "email": email,
        "password": "SuperSecretPassword123!",
        "organization_name": "Resend Org",
        "organization_slug": org_slug
    })
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()
    old_token_record = db_session.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
    
    # Resend
    resend_response = client.post("/auth/resend-verification", json={"email": email})
    assert resend_response.status_code == 200
    
    db_session.commit()
    db_session.refresh(old_token_record)
    assert old_token_record.used_at is not None # invalidated
    
    new_token_record = db_session.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id, EmailVerificationToken.used_at == None).first()
    assert new_token_record is not None
    assert new_token_record.id != old_token_record.id

    assert mock_delay.call_count == 2 # 1 for register, 1 for resend

def test_expired_token_fails_safely(client, db_session):
    email = f"expired_{uuid.uuid4()}@example.com"
    org_slug = f"org_{uuid.uuid4()}"
    
    client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Expired",
        "email": email,
        "password": "SuperSecretPassword123!",
        "organization_name": "Expired Org",
        "organization_slug": org_slug
    })
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()
    token_record = db_session.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
    
    # Manually expire
    from datetime import datetime, timedelta, timezone
    token_record.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.commit()
    
    # We need the raw token to test properly, but we didn't capture it without mock.
    # Let's generate a new one and mock it.
    from app.services.token_service import TokenService
    raw_token = TokenService.generate_random_token()
    token_record.token_hash = TokenService.hash_token(raw_token)
    db_session.commit()

    verify_response = client.post(f"/auth/verify-email?token={raw_token}")
    assert verify_response.status_code == 400
    assert verify_response.json()["detail"]["code"] == "TOKEN_EXPIRED"
