from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.demo_admin_service import get_demo_status, reset_demo_data
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from pydantic import BaseModel, EmailStr

# NOTE: This is for local/demo/admin use only. Do not expose destructive reset controls publicly.
router = APIRouter(prefix="/demo-admin", tags=["Demo Admin"])

class ResetRequest(BaseModel):
    confirm: str
    preserve_admins: bool = True

class DeleteUserRequest(BaseModel):
    email: EmailStr
    confirm: str  # must be "DELETE_USER"

@router.get("/status")
def get_demo_admin_status(db: Session = Depends(get_db)):
    return get_demo_status(db)

@router.post("/reset")
def reset_endpoint(req: ResetRequest, db: Session = Depends(get_db)): #, admin=Depends(get_current_admin)):
    # Using admin check can be enforced here if available, left commented out or implementable.
    if req.confirm != "RESET_DEMO_DATA":
        raise HTTPException(
            status_code=400,
            detail="Type RESET_DEMO_DATA to confirm demo reset."
        )
    
    try:
        deleted_counts = reset_demo_data(db, preserve_admins=req.preserve_admins)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Demo reset failed: {str(e)}"
        )
    
    return {
        "success": True,
        "deleted": deleted_counts,
        "message": "Demo data reset complete. Admin accounts were preserved."
    }


@router.post("/delete-user")
def delete_user_endpoint(req: DeleteUserRequest, db: Session = Depends(get_db)):
    """
    Demo-only endpoint: permanently delete a user by email so the same
    email can be re-used for registration testing.  If the user is the
    sole member of an organization, that organization is also removed.
    """
    if req.confirm != "DELETE_USER":
        raise HTTPException(
            status_code=400,
            detail="Type DELETE_USER to confirm user deletion."
        )

    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found with email {req.email}")

    deleted_orgs = []

    # Find orgs where this user is the ONLY member — those should be cleaned up
    memberships = db.query(OrganizationMembership).filter(
        OrganizationMembership.user_id == user.id
    ).all()

    for membership in memberships:
        org_id = membership.organization_id
        member_count = db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == org_id
        ).count()

        if member_count <= 1:
            # This user is the sole member — delete the org too
            org = db.query(Organization).filter(Organization.id == org_id).first()
            if org:
                deleted_orgs.append(org.name)
                # Delete invitations associated with the org
                from app.models.auth_tokens import AdminInvitation
                db.query(AdminInvitation).filter(
                    AdminInvitation.organization_id == org_id
                ).delete(synchronize_session=False)
                db.delete(org)

    # The User model has cascade="all, delete-orphan" on memberships,
    # sessions, email_verification_tokens, and password_reset_tokens,
    # so deleting the user will clean those up automatically.
    db.delete(user)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user: {str(e)}"
        )

    return {
        "success": True,
        "email": req.email,
        "deleted_orgs": deleted_orgs,
        "message": f"User {req.email} and {len(deleted_orgs)} sole-owner org(s) deleted."
    }
