from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth_deps import get_current_user, RequireOrganizationRole
from app.schemas.organization import (
    OrganizationResponse, MembershipResponse, MemberDetailResponse,
    InvitationCreate, InvitationResponse, InvitationPreview
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.auth_tokens import AdminInvitation
from app.services.organization_service import OrganizationService
from app.services.invitation_service import InvitationService
from app.services.auth_service import AuthService
from app.services.audit_service import AuditService
from app.models.user import User
from datetime import datetime, timezone
import uuid
import os

router = APIRouter(prefix="/organizations", tags=["Organizations"])

@router.get("", response_model=list[OrganizationResponse])
def list_my_organizations(db: Session = Depends(get_db), user = Depends(get_current_user)):
    orgs = db.query(Organization).join(OrganizationMembership).filter(
        OrganizationMembership.user_id == user.id,
        OrganizationMembership.status == 'active'
    ).all()
    return orgs

@router.get("/{organization_id}", response_model=OrganizationResponse)
def get_organization(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    membership = Depends(RequireOrganizationRole()) # any role
):
    return membership.organization

@router.get("/{organization_id}/members", response_model=list[MemberDetailResponse])
def list_members(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    membership = Depends(RequireOrganizationRole('owner', 'admin'))
):
    memberships = db.query(OrganizationMembership).filter(
        OrganizationMembership.organization_id == organization_id
    ).all()
    
    results = []
    for m in memberships:
        results.append({
            "membership_id": m.id,
            "user_id": m.user.id,
            "first_name": m.user.first_name,
            "last_name": m.user.last_name,
            "email": m.user.email,
            "role": m.role,
            "status": m.status,
            "joined_at": m.joined_at
        })
    return results

@router.patch("/{organization_id}/members/{membership_id}/role")
def change_member_role(
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
    role: str,
    db: Session = Depends(get_db),
    current_membership = Depends(RequireOrganizationRole('owner', 'admin'))
):
    if role not in ['owner', 'admin', 'member']:
        raise HTTPException(400, "Invalid role")

    target = db.query(OrganizationMembership).filter(
        OrganizationMembership.id == membership_id,
        OrganizationMembership.organization_id == organization_id
    ).first()
    
    if not target:
        raise HTTPException(404, "Membership not found")

    # Policy checks
    if current_membership.role == 'admin':
        if target.role == 'owner' or role == 'owner':
            raise HTTPException(403, "Admins cannot manage owners")
            
    if OrganizationService.is_last_active_owner(db, organization_id, target.user_id):
        if role != 'owner':
            raise HTTPException(400, "Cannot demote the last owner")

    old_role = target.role
    target.role = role
    AuditService.log_action(db, "membership.role_changed", actor_user_id=current_membership.user_id, organization_id=organization_id, target_id=str(membership_id), metadata={"old": old_role, "new": role})
    db.commit()
    return {"status": "success"}

@router.patch("/{organization_id}/members/{membership_id}/status")
def change_member_status(
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
    status: str,
    db: Session = Depends(get_db),
    current_membership = Depends(RequireOrganizationRole('owner', 'admin'))
):
    if status not in ['active', 'suspended']:
        raise HTTPException(400, "Invalid status")

    target = db.query(OrganizationMembership).filter(
        OrganizationMembership.id == membership_id,
        OrganizationMembership.organization_id == organization_id
    ).first()
    
    if not target:
        raise HTTPException(404, "Membership not found")

    # Policy checks
    if current_membership.role == 'admin' and target.role == 'owner':
        raise HTTPException(403, "Admins cannot manage owners")
            
    if OrganizationService.is_last_active_owner(db, organization_id, target.user_id):
        if status != 'active':
            raise HTTPException(400, "Cannot suspend the last owner")

    target.status = status
    AuditService.log_action(db, f"membership.{status}", actor_user_id=current_membership.user_id, organization_id=organization_id, target_id=str(membership_id))
    db.commit()
    return {"status": "success"}

@router.post("/{organization_id}/invitations", response_model=InvitationResponse)
def invite_admin(
    organization_id: uuid.UUID,
    data: InvitationCreate,
    db: Session = Depends(get_db),
    current_membership = Depends(RequireOrganizationRole('owner', 'admin'))
):
    if current_membership.role == 'admin' and data.role == 'owner':
        raise HTTPException(403, "Admins cannot invite owners")
        
    invitation, raw_token = InvitationService.create_invitation(
        db, organization_id, data.email, data.role, current_membership.user_id
    )
    
    AuditService.log_action(db, "admin.invited", actor_user_id=current_membership.user_id, organization_id=organization_id, metadata={"role": data.role})
    db.commit()

    # Dispatch invitation email via Celery
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    inviter = db.query(User).filter(User.id == current_membership.user_id).first()
    frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
    invite_link = f"{frontend_base}/auth/accept-invitation?token={raw_token}"
    try:
        from app.tasks.communications import send_invitation_email
        send_invitation_email.delay(
            data.email,
            org.name if org else "EventOS Organization",
            f"{inviter.first_name} {inviter.last_name}" if inviter else "An admin",
            data.role,
            invite_link
        )
    except Exception:
        pass  # Email failure should not block invitation creation

    return invitation

@router.get("/{organization_id}/invitations", response_model=list[InvitationResponse])
def list_invitations(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_membership = Depends(RequireOrganizationRole('owner', 'admin'))
):
    return db.query(AdminInvitation).filter(
        AdminInvitation.organization_id == organization_id,
        AdminInvitation.status == 'pending'
    ).all()

@router.delete("/{organization_id}/invitations/{invitation_id}")
def revoke_invitation(
    organization_id: uuid.UUID,
    invitation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_membership = Depends(RequireOrganizationRole('owner', 'admin'))
):
    invitation = db.query(AdminInvitation).filter(
        AdminInvitation.id == invitation_id,
        AdminInvitation.organization_id == organization_id
    ).first()
    
    if not invitation:
        raise HTTPException(404, "Invitation not found")
        
    if current_membership.role == 'admin' and invitation.role == 'owner':
        raise HTTPException(403, "Admins cannot revoke owner invitations")

    InvitationService.revoke_invitation(db, invitation)
    AuditService.log_action(db, "invitation.revoked", actor_user_id=current_membership.user_id, organization_id=organization_id)
    db.commit()
    return {"status": "success"}

# Global auth-level routes for accepting invitations

@router.get("/auth/invitations/{token}", response_model=InvitationPreview, tags=["Authentication"])
def preview_invitation(token: str, db: Session = Depends(get_db)):
    invitation = InvitationService.get_invitation_by_token(db, token)
    if not invitation:
        raise HTTPException(400, {"code": "INVALID_TOKEN", "message": "Invalid token."})
    expires_at = invitation.expires_at.replace(tzinfo=timezone.utc) if invitation.expires_at.tzinfo is None else invitation.expires_at
    if invitation.status != 'pending' or expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, {"code": "TOKEN_EXPIRED", "message": "Invitation is expired or no longer valid."})
        
    inviter = db.query(User).filter(User.id == invitation.invited_by_user_id).first()
    
    return {
        "organization_name": invitation.organization.name,
        "inviter_name": f"{inviter.first_name} {inviter.last_name}" if inviter else None,
        "role": invitation.role,
        "email": invitation.email,
        "expires_at": invitation.expires_at
    }

@router.post("/auth/invitations/{token}/accept", tags=["Authentication"])
def accept_invitation(token: str, db: Session = Depends(get_db), user = Depends(get_current_user)):
    invitation = InvitationService.get_invitation_by_token(db, token)
    if not invitation:
        raise HTTPException(400, {"code": "INVALID_TOKEN", "message": "Invalid token."})
    expires_at = invitation.expires_at.replace(tzinfo=timezone.utc) if invitation.expires_at.tzinfo is None else invitation.expires_at
    if invitation.status != 'pending' or expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, {"code": "TOKEN_EXPIRED", "message": "Invitation is expired or no longer valid."})
        
    if AuthService.normalize_email(user.email) != AuthService.normalize_email(invitation.email):
        raise HTTPException(403, "Invitation email does not match logged-in user.")
        
    # Check if membership already exists
    existing = OrganizationService.get_membership(db, invitation.organization_id, user.id)
    if existing:
        if existing.status == 'active':
            # Idempotent success
            InvitationService.accept_invitation(db, invitation)
            db.commit()
            return {"status": "success"}
        else:
            raise HTTPException(400, "Membership exists but is not active.")

    OrganizationService.create_membership(db, invitation.organization_id, user.id, invitation.role)
    InvitationService.accept_invitation(db, invitation)
    AuditService.log_action(db, "invitation.accepted", actor_user_id=user.id, organization_id=invitation.organization_id)
    db.commit()
    return {"status": "success"}
