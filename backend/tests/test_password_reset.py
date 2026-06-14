import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import Base, engine, SessionLocal
from app.models.auth_tokens import PasswordResetToken
from app.models.communication_log import CommunicationLog
from app.models.user import User
import uuid
from unittest.mock import patch

@pytest.fixture(autouse=True)
def clear_logs(db_session):
    db_session.query(CommunicationLog).delete()
    db_session.commit()

@patch('app.tasks.communications.send_password_reset_email.delay')
def test_forgot_password_creates_email_job_and_reset_flow(mock_delay, client, db_session):
    # 1. Register organization
    email = f"reset_{uuid.uuid4()}@example.com"
    org_slug = f"org_{uuid.uuid4()}"
    
    client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Reset",
        "email": email,
        "password": "SuperSecretPassword123!",
        "organization_name": "Reset Org",
        "organization_slug": org_slug
    })
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()

    # Forgot password
    forgot_response = client.post("/auth/forgot-password", json={"email": email})
    assert forgot_response.status_code == 200
    
    # 2. Assert email job created
    assert mock_delay.called
    args, kwargs = mock_delay.call_args
    assert args[0] == email
    assert args[1] == "Test"
    assert "http://localhost:5173/auth/reset-password?token=" in args[2]
    
    raw_token = args[2].split("token=")[1]
    
    db_session.commit()
    # 3. Assert raw token is not stored (only hash)
    token_record = db_session.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).first()
    assert token_record.token_hash != raw_token
    
    # 4. Reset succeeds
    reset_response = client.post("/auth/reset-password", json={"token": raw_token, "new_password": "NewSecretPassword123!"})
    assert reset_response.status_code == 200
    assert reset_response.json()["status"] == "success"
    
    # Verify login with new password (must verify email first)
    from datetime import datetime, timezone
    user_obj = db_session.query(User).filter(User.email == email).first()
    user_obj.email_verified = True
    user_obj.email_verified_at = datetime.now(timezone.utc)
    db_session.commit()
    
    login_response = client.post("/auth/login", json={"email": email, "password": "NewSecretPassword123!"})
    assert login_response.status_code == 200

    # 5. Used token fails safely
    reset_again = client.post("/auth/reset-password", json={"token": raw_token, "new_password": "AnotherPassword!"})
    assert reset_again.status_code == 400
    assert reset_again.json()["detail"]["code"] == "TOKEN_USED"

@patch('app.tasks.communications.send_password_reset_email.delay')
def test_forgot_password_unregistered_email_safe(mock_delay, client, db_session):
    email = f"unregistered_{uuid.uuid4()}@example.com"
    
    forgot_response = client.post("/auth/forgot-password", json={"email": email})
    assert forgot_response.status_code == 200
    assert "has been sent" in forgot_response.json()["message"]
    
    # Email should NOT be sent to unregistered emails to prevent user enumeration
    assert not mock_delay.called

def test_expired_reset_token_fails_safely(client, db_session):
    email = f"expired_reset_{uuid.uuid4()}@example.com"
    org_slug = f"org_{uuid.uuid4()}"
    
    client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "ExpiredReset",
        "email": email,
        "password": "SuperSecretPassword123!",
        "organization_name": "ExpiredReset Org",
        "organization_slug": org_slug
    })
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()
    
    client.post("/auth/forgot-password", json={"email": email})
    db_session.commit()

    token_record = db_session.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).first()
    
    # Manually expire
    from datetime import datetime, timedelta, timezone
    token_record.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.commit()
    
    from app.services.token_service import TokenService
    raw_token = TokenService.generate_random_token()
    token_record.token_hash = TokenService.hash_token(raw_token)
    db_session.commit()

    reset_response = client.post("/auth/reset-password", json={"token": raw_token, "new_password": "NewPassword!"})
    assert reset_response.status_code == 400
    assert reset_response.json()["detail"]["code"] == "TOKEN_EXPIRED"
