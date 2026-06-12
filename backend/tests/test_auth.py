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

client = TestClient(app)

def test_organization_registration(db_session: Session):
    response = client.post("/auth/register-organization", json={
        "first_name": "Test",
        "last_name": "Owner",
        "email": "owner@test.com",
        "password": "password123",
        "organization_name": "Test Org",
        "organization_slug": "test-org"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "owner@test.com"
    assert data["first_name"] == "Test"
    
    # Check DB
    user = db_session.query(User).filter(User.email == "owner@test.com").first()
    assert user is not None
    assert user.email_verified == False # Mock email isn't verified immediately
    
    org = db_session.query(Organization).filter(Organization.slug == "test-org").first()
    assert org is not None
    
    membership = db_session.query(OrganizationMembership).filter(
        OrganizationMembership.user_id == user.id,
        OrganizationMembership.organization_id == org.id
    ).first()
    
    assert membership is not None
    assert membership.role == "owner"

def test_registration_duplicate_email(db_session: Session):
    # Register once
    client.post("/auth/register-organization", json={
        "first_name": "Test", "last_name": "Owner", "email": "dup@test.com",
        "password": "password123", "organization_name": "Test Org 1", "organization_slug": "test-org-1"
    })
    
    # Register again with same email
    response = client.post("/auth/register-organization", json={
        "first_name": "Test2", "last_name": "Owner2", "email": "dup@test.com",
        "password": "password123", "organization_name": "Test Org 2", "organization_slug": "test-org-2"
    })
    
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]

def test_login_success(db_session: Session):
    # Register
    client.post("/auth/register-organization", json={
        "first_name": "Login", "last_name": "User", "email": "login@test.com",
        "password": "password123", "organization_name": "Login Org", "organization_slug": "login-org"
    })
    
    # Login
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
    # Register
    client.post("/auth/register-organization", json={
        "first_name": "Lock", "last_name": "User", "email": "lock@test.com",
        "password": "password123", "organization_name": "Lock Org", "organization_slug": "lock-org"
    })
    
    for _ in range(5):
        response = client.post("/auth/login", json={"email": "lock@test.com", "password": "wrong"})
        assert response.status_code == 401
        
    # 6th attempt even with correct password should fail
    response = client.post("/auth/login", json={"email": "lock@test.com", "password": "password123"})
    assert response.status_code == 401

def test_refresh_token(db_session: Session):
    # Register & Login
    client.post("/auth/register-organization", json={
        "first_name": "Ref", "last_name": "User", "email": "ref@test.com",
        "password": "password123", "organization_name": "Ref Org", "organization_slug": "ref-org"
    })
    login_resp = client.post("/auth/login", json={"email": "ref@test.com", "password": "password123"})
    refresh_token = login_resp.json()["refresh_token"]
    
    # Refresh
    refresh_resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200
    new_refresh = refresh_resp.json()["refresh_token"]
    assert new_refresh != refresh_token
    
    # Reuse old refresh token -> Should revoke family
    reuse_resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert reuse_resp.status_code == 401
    assert "invalid" in reuse_resp.json()["detail"].lower()

def test_logout(db_session: Session):
    # Register & Login
    client.post("/auth/register-organization", json={
        "first_name": "Out", "last_name": "User", "email": "out@test.com",
        "password": "password123", "organization_name": "Out Org", "organization_slug": "out-org"
    })
    login_resp = client.post("/auth/login", json={"email": "out@test.com", "password": "password123"})
    token = login_resp.json()["access_token"]
    
    # Logout
    logout_resp = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_resp.status_code == 200
    
    # Refresh should now fail because session is revoked
    refresh_token = login_resp.json()["refresh_token"]
    refresh_resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 401
