import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import Base, engine, SessionLocal
from app.models.auth_tokens import UserSession
from app.models.user import User
import uuid
from unittest.mock import patch

@pytest.fixture(autouse=True)
def clean_users(db_session):
    db_session.query(User).delete()
    db_session.commit()

def test_login_creates_session_and_tokens(client, db_session):
    # 1. Setup user
    email = f"session_{uuid.uuid4()}@example.com"
    client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Session",
        "email": email,
        "password": "Password123!",
        "organization_name": "Session Org",
        "organization_slug": f"org_{uuid.uuid4()}"
    })
    
    # 2. Login
    login_res = client.post("/auth/login", json={"email": email, "password": "Password123!"})
    assert login_res.status_code == 200
    data = login_res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()
    
    session = db_session.query(UserSession).filter(UserSession.user_id == user.id).first()
    assert session is not None
    assert session.revoked_at is None

def test_refresh_token_rotates_and_revokes_old(client, db_session):
    email = f"rotate_{uuid.uuid4()}@example.com"
    client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Rotate",
        "email": email,
        "password": "Password123!",
        "organization_name": "Rotate Org",
        "organization_slug": f"org_{uuid.uuid4()}"
    })
    
    login_res = client.post("/auth/login", json={"email": email, "password": "Password123!"})
    refresh_token = login_res.json()["refresh_token"]
    
    # Refresh
    refresh_res = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 200
    new_refresh_token = refresh_res.json()["refresh_token"]
    assert new_refresh_token != refresh_token
    
    db_session.commit()
    user = db_session.query(User).filter(User.email == email).first()
    
    sessions = db_session.query(UserSession).filter(UserSession.user_id == user.id).order_by(UserSession.created_at).all()
    assert len(sessions) == 2
    assert sessions[0].revoked_at is not None # old one revoked
    assert sessions[1].revoked_at is None # new one active
    assert sessions[0].token_family_id == sessions[1].token_family_id

def test_refresh_token_reuse_triggers_family_revocation(client, db_session):
    email = f"reuse_{uuid.uuid4()}@example.com"
    client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Reuse",
        "email": email,
        "password": "Password123!",
        "organization_name": "Reuse Org",
        "organization_slug": f"org_{uuid.uuid4()}"
    })
    
    login_res = client.post("/auth/login", json={"email": email, "password": "Password123!"})
    old_refresh_token = login_res.json()["refresh_token"]
    
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
        assert session.revoked_at is not None # ALL revoked
