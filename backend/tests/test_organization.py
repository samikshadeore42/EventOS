import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
import uuid
from datetime import datetime, timezone

client = TestClient(app)

def _verify_user(email: str):
    """Helper: marks a user as email-verified in the test DB."""
    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == email).first()
    if user and not user.email_verified:
        user.email_verified = True
        user.email_verified_at = datetime.now(timezone.utc)
        db.commit()
    db.close()

def create_auth_user(client: TestClient, prefix: str):
    client.post("/auth/register-organization", json={
        "first_name": f"{prefix}",
        "last_name": "User",
        "email": f"{prefix}@test.com",
        "password": "password123",
        "organization_name": f"{prefix} Org",
        "organization_slug": f"{prefix}-org"
    })
    _verify_user(f"{prefix}@test.com")
    resp = client.post("/auth/login", json={"email": f"{prefix}@test.com", "password": "password123"})
    return resp.json()["access_token"]

def test_list_my_organizations(db_session: Session):
    token = create_auth_user(client, "listorgs")
    
    resp = client.get("/organizations", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == "listorgs-org"

def test_cross_organization_access_denied(db_session: Session):
    token1 = create_auth_user(client, "cross1")
    token2 = create_auth_user(client, "cross2")
    
    resp1 = client.get("/organizations", headers={"Authorization": f"Bearer {token1}"})
    org1_id = resp1.json()[0]["id"]
    
    resp_cross = client.get(f"/organizations/{org1_id}", headers={"Authorization": f"Bearer {token2}"})
    assert resp_cross.status_code == 403

def test_invite_admin(db_session: Session):
    token1 = create_auth_user(client, "inviter")
    resp1 = client.get("/organizations", headers={"Authorization": f"Bearer {token1}"})
    org1_id = resp1.json()[0]["id"]
    
    invite_resp = client.post(f"/organizations/{org1_id}/invitations", json={
        "email": "invited@test.com",
        "role": "admin"
    }, headers={"Authorization": f"Bearer {token1}"})
    
    assert invite_resp.status_code == 200
    data = invite_resp.json()
    assert data["email"] == "invited@test.com"
    assert data["role"] == "admin"
    assert data["status"] == "pending"

def test_accept_invitation(db_session: Session):
    token1 = create_auth_user(client, "orgowner")
    resp1 = client.get("/organizations", headers={"Authorization": f"Bearer {token1}"})
    org1_id = resp1.json()[0]["id"]
    
    client.post(f"/organizations/{org1_id}/invitations", json={
        "email": "orginvited@test.com",
        "role": "admin"
    }, headers={"Authorization": f"Bearer {token1}"})
    
    from app.models.auth_tokens import AdminInvitation
    
    # Create User 3 and get their token
    token3 = create_auth_user(client, "inv_target")
    
    # Use InvitationService to create an invitation with a raw token we can use
    from app.services.invitation_service import InvitationService
    
    inv_user = db_session.query(User).filter(User.email == "inv_target@test.com").first()
    orgowner_user = db_session.query(User).filter(User.email == "orgowner@test.com").first()
    
    inv, raw_token = InvitationService.create_invitation(db_session, uuid.UUID(org1_id), inv_user.email, "admin", orgowner_user.id)
    db_session.commit()
    
    accept_resp = client.post(f"/organizations/auth/invitations/{raw_token}/accept", headers={"Authorization": f"Bearer {token3}"})
    if accept_resp.status_code != 200:
        print(accept_resp.json())
    assert accept_resp.status_code == 200
    
    # Verify User 3 has access to Org 1
    orgs_resp = client.get("/organizations", headers={"Authorization": f"Bearer {token3}"})
    orgs = orgs_resp.json()
    assert len(orgs) == 2  # their own org + org1
