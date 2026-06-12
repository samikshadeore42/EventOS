import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import Base, engine
from app.models.auth_tokens import UserSession
from app.models.user import User
import uuid
from datetime import datetime, timezone

def _verify_user_in_db(db_session, email: str):
    """Helper: marks a user as email-verified."""
    user = db_session.query(User).filter(User.email == email).first()
    if user and not user.email_verified:
        user.email_verified = True
        user.email_verified_at = datetime.now(timezone.utc)
        db_session.commit()

def _register_and_login(client, db_session, prefix):
    """Register, verify, then login — returns access+refresh tokens."""
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    slug = f"org-{uuid.uuid4().hex[:12]}"
    client.post("/auth/register-organization", json={
        "first_name": "Test", "last_name": prefix.title(),
        "email": email, "password": "Password123!",
        "organization_name": f"{prefix} Org", "organization_slug": slug
    })
    _verify_user_in_db(db_session, email)
    login_res = client.post("/auth/login", json={"email": email, "password": "Password123!"})
    assert login_res.status_code == 200, f"Login failed: {login_res.json()}"
    return email, login_res.json()

def test_login_creates_session_and_tokens(client, db_session):
    email, data = _register_and_login(client, db_session, "session")
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()
    session = db_session.query(UserSession).filter(UserSession.user_id == user.id).first()
    assert session is not None
    assert session.revoked_at is None

def test_refresh_token_rotates_and_revokes_old(client, db_session):
    email, data = _register_and_login(client, db_session, "rotate")
    refresh_token = data["refresh_token"]
    
    refresh_res = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 200
    new_refresh_token = refresh_res.json()["refresh_token"]
    assert new_refresh_token != refresh_token
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()
    sessions = db_session.query(UserSession).filter(UserSession.user_id == user.id).order_by(UserSession.created_at).all()
    assert len(sessions) == 2
    assert sessions[0].revoked_at is not None  # old one revoked
    assert sessions[1].revoked_at is None  # new one active
    assert sessions[0].token_family_id == sessions[1].token_family_id

def test_refresh_token_reuse_triggers_family_revocation(client, db_session):
    email, data = _register_and_login(client, db_session, "reuse")
    old_refresh_token = data["refresh_token"]
    
    # 1st Refresh -> success
    refresh_res = client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
    assert refresh_res.status_code == 200
    
    # 2nd Refresh with OLD token -> triggers family revocation
    reuse_res = client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
    assert reuse_res.status_code == 401
    assert reuse_res.json()["detail"] == "Session revoked"
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()
    sessions = db_session.query(UserSession).filter(UserSession.user_id == user.id).all()
    assert len(sessions) == 2
    for session in sessions:
        assert session.revoked_at is not None  # ALL revoked
