import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.auth_tokens import UserSession
import uuid
from datetime import datetime, timezone

def _verify_user_in_db(db_session, email: str):
    """Helper: marks a user as email-verified."""
    user = db_session.query(User).filter(User.email == email).first()
    if user and not user.email_verified:
        user.email_verified = True
        user.email_verified_at = datetime.now(timezone.utc)
        db_session.commit()

def create_user_and_token(client, db_session, email):
    slug = f"org-{uuid.uuid4().hex[:12]}"
    client.post("/auth/register-organization", json={
        "first_name": "Test", "last_name": "User",
        "email": email, "password": "Password123!",
        "organization_name": f"Org {email}", "organization_slug": slug
    })
    _verify_user_in_db(db_session, email)
    res = client.post("/auth/login", json={"email": email, "password": "Password123!"})
    assert res.status_code == 200, f"Login failed for {email}: {res.json()}"
    return res.json()["access_token"]

def test_revoked_session_blocks_access(client, db_session):
    email = f"block_{uuid.uuid4().hex[:8]}@example.com"
    token = create_user_and_token(client, db_session, email)
    
    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    
    # Revoke session
    user = db_session.query(User).filter(User.email == email).first()
    session = db_session.query(UserSession).filter(UserSession.user_id == user.id).first()
    session.revoked_at = datetime.now(timezone.utc)
    db_session.commit()
    
    me_res2 = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res2.status_code == 401

def test_require_role_enforcement(client, db_session):
    email = f"role_{uuid.uuid4().hex[:8]}@example.com"
    token = create_user_and_token(client, db_session, email)
    
    user = db_session.query(User).filter(User.email == email).first()
    membership = db_session.query(OrganizationMembership).filter(OrganizationMembership.user_id == user.id).first()
    org_id = membership.organization_id
    
    # Owner accesses organization detail
    org_res = client.get(f"/organizations/{org_id}", headers={"Authorization": f"Bearer {token}"})
    assert org_res.status_code == 200
    
    # Change role to non-admin and try accessing admin route
    membership.role = 'member'
    db_session.commit()
    
    invite_res = client.post(f"/organizations/{org_id}/invitations", json={"email": "test@test.com", "role": "admin"}, headers={"Authorization": f"Bearer {token}"})
    assert invite_res.status_code == 403

def test_inactive_user_blocks_access(client, db_session):
    email = f"inactive_{uuid.uuid4().hex[:8]}@example.com"
    token = create_user_and_token(client, db_session, email)
    
    user = db_session.query(User).filter(User.email == email).first()
    user.is_active = False
    db_session.commit()
    
    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 403
