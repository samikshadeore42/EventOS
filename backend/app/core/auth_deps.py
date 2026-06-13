from fastapi import Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.token_service import TokenService
from app.services.organization_service import OrganizationService
from app.models.user import User
from app.models.organization_membership import OrganizationMembership
import uuid

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

def get_current_user_token_payload(token: str = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = TokenService.decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload

def get_current_user(
    payload: dict = Depends(get_current_user_token_payload),
    db: Session = Depends(get_db)
) -> User:
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user ID format")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    sid = payload.get("sid")
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session ID in token")
    try:
        session_id = uuid.UUID(sid)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session ID format")

    from app.models.auth_tokens import UserSession
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session or session.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked or invalid")

    # Validate session ownership — prevent cross-user session attacks
    if str(session.user_id) != str(user.id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session does not belong to authenticated user")

    # Validate session expiry
    from datetime import datetime, timezone
    session_expires = session.expires_at.replace(tzinfo=timezone.utc) if session.expires_at.tzinfo is None else session.expires_at
    if session_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    # Validate token version
    if payload.get("ver") != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalidated by security event")
    
    return user

def get_current_session_id(payload: dict = Depends(get_current_user_token_payload)) -> str:
    sid = payload.get("sid")
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session ID in token")
    return sid

class RequireOrganizationRole:
    """
    Dependency to require specific organization roles.
    Takes roles as *args, e.g. RequireOrganizationRole('owner', 'admin')
    """
    def __init__(self, *allowed_roles: str):
        self.allowed_roles = allowed_roles

    def __call__(
        self,
        organization_id: uuid.UUID | None = None,
        x_organization_id: uuid.UUID | None = Header(None, alias="X-Organization-Id"),
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> OrganizationMembership:
        target_org_id = organization_id or x_organization_id
        if not target_org_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization ID is required")

        # Verify organization exists and is active
        from app.models.organization import Organization
        org = db.query(Organization).filter(Organization.id == target_org_id).first()
        if not org:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization not found.")
        if not org.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization is inactive.")
            
        membership = OrganizationService.get_membership(db, target_org_id, user.id)
        
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Not a member of this organization.")
        
        if membership.status != 'active':
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Membership is not active.")
            
        if self.allowed_roles and membership.role not in self.allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access denied. Required role: {self.allowed_roles}")
            
        return membership
