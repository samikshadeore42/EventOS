import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.auth_tokens import UserSession, AdminInvitation
from app.services.auth_service import AuthService
import uuid
from datetime import datetime, timezone

client = TestClient(app)

def _verify_user(db_session: Session, email: str):
    """Helper: marks a user as email-verified in the test DB."""
    user = db_session.query(User).filter(User.email == email).first()
    if user and not user.email_verified:
        user.email_verified = True
        user.email_verified_at = datetime.now(timezone.utc)
        db_session.commit()

def test_organization_registration(db_session: Session):
    response = client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Owner",
        "email": "owner@test.com",
        "password": "password123",
        "organization_name": "Test Org Reg",
        "organization_slug": "test-org-reg"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "owner@test.com"
    assert data["first_name"] == "Test"
    
    # Check DB
    user = db_session.query(User).filter(User.email == "owner@test.com").first()
    assert user is not None
    assert user.email_verified == False  # Not verified immediately
    
    org = db_session.query(Organization).filter(Organization.slug == "test-org-reg").first()
    assert org is not None
    
    membership = db_session.query(OrganizationMembership).filter(
        OrganizationMembership.user_id == user.id,
        OrganizationMembership.organization_id == org.id
    ).first()
    
    assert membership is not None
    assert membership.role == "owner"

def test_unverified_login_blocked(db_session: Session):
    """Login must fail for unverified users with EMAIL_VERIFICATION_REQUIRED."""
    client.post("/auth/register-organization", json={
        "first_name": "Unverified", "last_name": "User", "email": "unverified@test.com",
        "password": "password123", "organization_name": "Unverified Org", "organization_slug": "unverified-org"
    })
    response = client.post("/auth/login", json={"email": "unverified@test.com", "password": "password123"})
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "EMAIL_VERIFICATION_REQUIRED"

def test_registration_duplicate_email(db_session: Session):
    client.post("/auth/register-organization", json={
        "first_name": "Test", "last_name": "Owner", "email": "dup@test.com",
        "password": "password123", "organization_name": "Test Org 1", "organization_slug": "test-org-1"
    })
    
    response = client.post("/auth/register-organization", json={
        "first_name": "Test2", "last_name": "Owner2", "email": "dup@test.com",
        "password": "password123", "organization_name": "Test Org 2", "organization_slug": "test-org-2"
    })
    
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]

def test_login_success(db_session: Session):
    client.post("/auth/register-organization", json={
        "first_name": "Login", "last_name": "User", "email": "login@test.com",
        "password": "password123", "organization_name": "Login Org", "organization_slug": "login-org"
    })
    _verify_user(db_session, "login@test.com")
    
    response = client.post("/auth/login", json={
        "email": "login@test.com",
        "password": "password123"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"

def test_login_failure(db_session: Session):
    response = client.post("/auth/login", json={
        "email": "wrong@test.com",
        "password": "wrong"
    })
    assert response.status_code == 401
    
def test_login_lockout(db_session: Session):
    client.post("/auth/register-organization", json={
        "first_name": "Lock", "last_name": "User", "email": "lock@test.com",
        "password": "password123", "organization_name": "Lock Org", "organization_slug": "lock-org"
    })
    _verify_user(db_session, "lock@test.com")
    
    for _ in range(5):
        response = client.post("/auth/login", json={"email": "lock@test.com", "password": "wrong"})
        assert response.status_code == 401
        
    response = client.post("/auth/login", json={"email": "lock@test.com", "password": "password123"})
    assert response.status_code == 401

def test_refresh_token(db_session: Session):
    client.post("/auth/register-organization", json={
        "first_name": "Ref", "last_name": "User", "email": "ref@test.com",
        "password": "password123", "organization_name": "Ref Org", "organization_slug": "ref-org"
    })
    _verify_user(db_session, "ref@test.com")
    login_resp = client.post("/auth/login", json={"email": "ref@test.com", "password": "password123"})
    refresh_token = login_resp.json()["refresh_token"]
    
    refresh_resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200
    new_refresh = refresh_resp.json()["refresh_token"]
    assert new_refresh != refresh_token
    
    reuse_resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert reuse_resp.status_code == 401
    assert "revoked" in reuse_resp.json()["detail"].lower()

def test_logout(db_session: Session):
    client.post("/auth/register-organization", json={
        "first_name": "Out", "last_name": "User", "email": "out@test.com",
        "password": "password123", "organization_name": "Out Org", "organization_slug": "out-org"
    })
    _verify_user(db_session, "out@test.com")
    login_resp = client.post("/auth/login", json={"email": "out@test.com", "password": "password123"})
    token = login_resp.json()["access_token"]
    
    logout_resp = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_resp.status_code == 200
    
    refresh_token = login_resp.json()["refresh_token"]
    refresh_resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 401
