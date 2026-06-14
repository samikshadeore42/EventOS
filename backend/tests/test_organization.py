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
    assert data[0]["organization"]["slug"] == "listorgs-org"

def test_cross_organization_access_denied(db_session: Session):
    token1 = create_auth_user(client, "cross1")
    token2 = create_auth_user(client, "cross2")
    
    resp1 = client.get("/organizations", headers={"Authorization": f"Bearer {token1}"})
    org1_id = resp1.json()[0]["organization"]["id"]
    
    resp_cross = client.get(f"/organizations/{org1_id}", headers={"Authorization": f"Bearer {token2}"})
    assert resp_cross.status_code == 403

def test_invite_admin(db_session: Session):
    token1 = create_auth_user(client, "inviter")
    resp1 = client.get("/organizations", headers={"Authorization": f"Bearer {token1}"})
    org1_id = resp1.json()[0]["organization"]["id"]
    
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
    org1_id = resp1.json()[0]["organization"]["id"]

    client.post(
        f"/organizations/{org1_id}/invitations",
        json={
            "email": "orginvited@test.com",
            "role": "admin",
        },
        headers={"Authorization": f"Bearer {token1}"},
    )

    # Create User 3 and get their token
    token3 = create_auth_user(client, "inv_target")

    # Use InvitationService to create an invitation with a raw token we can use
    from app.services.invitation_service import InvitationService

    inv_user = db_session.query(User).filter(User.email == "inv_target@test.com").first()
    orgowner_user = db_session.query(User).filter(User.email == "orgowner@test.com").first()

    inv, raw_token = InvitationService.create_invitation(
        db_session,
        uuid.UUID(org1_id),
        inv_user.email,
        "admin",
        orgowner_user.id,
    )
    db_session.commit()

    # Old route should now be removed/dead
    old_accept_resp = client.post(
        f"/organizations/auth/invitations/{raw_token}/accept",
        headers={"Authorization": f"Bearer {token3}"},
    )
    assert old_accept_resp.status_code == 404

    # New correct route should work
    accept_resp = client.post(
        f"/auth/invitations/{raw_token}/accept",
        headers={"Authorization": f"Bearer {token3}"},
    )
    if accept_resp.status_code != 200:
        print(accept_resp.json())
    assert accept_resp.status_code == 200

    # Verify User 3 has access to Org 1
    orgs_resp = client.get("/organizations", headers={"Authorization": f"Bearer {token3}"})
    orgs = orgs_resp.json()
    assert len(orgs) == 2  # their own org + org1

def test_update_organization(db_session: Session):
    token = create_auth_user(client, "updater")
    resp = client.get("/organizations", headers={"Authorization": f"Bearer {token}"})
    org_id = resp.json()[0]["organization"]["id"]
    
    update_resp = client.patch(f"/organizations/{org_id}", json={
        "name": "Updated Org Name",
        "description": "New description"
    }, headers={"Authorization": f"Bearer {token}"})
    
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["name"] == "Updated Org Name"
    assert data["description"] == "New description"

def test_update_organization_non_member_denied(db_session: Session):
    token1 = create_auth_user(client, "updowner")
    token2 = create_auth_user(client, "updother")
    
    resp1 = client.get("/organizations", headers={"Authorization": f"Bearer {token1}"})
    org1_id = resp1.json()[0]["organization"]["id"]
    
    update_resp = client.patch(f"/organizations/{org1_id}", json={"name": "Hacked"}, headers={"Authorization": f"Bearer {token2}"})
    assert update_resp.status_code == 403

@pytest.mark.parametrize("role", ["owner", "admin"])
def test_invitation_dispatches_email(role, db_session: Session):
    from unittest.mock import patch
    
    token = create_auth_user(client, f"emailinv{role}")
    resp = client.get("/organizations", headers={"Authorization": f"Bearer {token}"})
    org_id = resp.json()[0]["organization"]["id"]
    
    with patch("app.tasks.communications.send_invitation_email.delay") as mock_delay:
        invite_resp = client.post(f"/organizations/{org_id}/invitations", json={
            "email": f"newinvitee_{role}@test.com",
            "role": "admin"
        }, headers={"Authorization": f"Bearer {token}"})
        
        assert invite_resp.status_code == 200
        assert mock_delay.called
        args = mock_delay.call_args[0]
        assert args[0] == f"newinvitee_{role}@test.com"

