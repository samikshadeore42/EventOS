import os
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.services.auth_service import AuthService
from app.core.security import get_password_hash, verify_password

def bootstrap():
    email = os.environ.get("ADMIN_EMAIL", "admin@eventos.local")
    password = os.environ.get("ADMIN_PASSWORD")
    
    if not password:
        raise RuntimeError("ADMIN_PASSWORD environment variable is required for admin bootstrap.")
        
    first_name = os.environ.get("ADMIN_FIRST_NAME", "System")
    last_name = os.environ.get("ADMIN_LAST_NAME", "Admin")
    org_name = os.environ.get("ADMIN_ORG_NAME", "Default Organization")
    org_slug = os.environ.get("ADMIN_ORG_SLUG", "default-org")
    reset_pass = os.environ.get("RESET_ADMIN_PASSWORD", "false").lower() == "true"
    
    db: Session = SessionLocal()
    try:
        # 1. Check or Create User
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                first_name=first_name,
                last_name=last_name,
                email=email,
                password_hash=get_password_hash(password),
                email_verified=True,
                email_verified_at=datetime.now(timezone.utc),
                is_active=True
            )
            db.add(user)
            db.flush()
            print(f"Created admin user '{email}'")
        else:
            is_valid = verify_password(password, user.password_hash)
            if not is_valid or reset_pass:
                user.password_hash = get_password_hash(password)
                print(f"Updated password hash for admin user '{email}'")
            else:
                print(f"Admin user '{email}' already exists with a valid password.")
            
            if not user.email_verified:
                user.email_verified = True
                user.email_verified_at = datetime.now(timezone.utc)
                print(f"Forced email verification for '{email}'")

        # 2. Check or Create Organization
        org = db.query(Organization).filter(Organization.slug == org_slug).first()
        if not org:
            org = Organization(
                name=org_name,
                slug=org_slug,
                is_active=True
            )
            db.add(org)
            db.flush()
            print(f"Created organization '{org_name}' ({org_slug})")
        else:
            print(f"Organization '{org_name}' already exists.")

        # 3. Check or Create Membership (Owner)
        membership = db.query(OrganizationMembership).filter(
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.organization_id == org.id
        ).first()
        
        if not membership:
            membership = OrganizationMembership(
                organization_id=org.id,
                user_id=user.id,
                role='owner',
                status='active',
                joined_at=datetime.now(timezone.utc)
            )
            db.add(membership)
            print(f"Assigned '{email}' as owner of '{org_name}'")
        else:
            if membership.role != 'owner' or membership.status != 'active':
                membership.role = 'owner'
                membership.status = 'active'
                print(f"Updated membership for '{email}' to active owner")
            else:
                print(f"User '{email}' is already active owner of '{org_name}'")
                
        db.commit()
        print("Bootstrap complete.")
    except Exception as e:
        print(f"Error bootstrapping admin: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    bootstrap()
