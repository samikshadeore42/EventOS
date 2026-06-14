from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.database import get_db
from app.core.auth_deps import get_current_user, get_current_session_id
from app.schemas.auth import (
    OwnerRegistrationRequest, LoginRequest, TokenPairResponse, 
    RefreshRequest, ForgotPasswordRequest, ResetPasswordRequest, UserResponse
)
from app.services.auth_service import AuthService
from app.services.organization_service import OrganizationService
from app.services.session_service import SessionService
from app.services.audit_service import AuditService
from app.services.token_service import TokenService
from app.models.auth_tokens import UserSession, EmailVerificationToken, PasswordResetToken
from app.models.organization import Organization
from app.models.auth_tokens import AdminInvitation
from app.services.invitation_service import InvitationService
from app.schemas.organization import InvitationPreview
from app.core.security import get_password_hash
import uuid
import os
from datetime import datetime, timezone
from app.core.rate_limit import limiter
from app.schemas.auth import (
    OwnerRegistrationRequest, LoginRequest, TokenPairResponse,
    RefreshRequest, ForgotPasswordRequest, ResetPasswordRequest, UserResponse,
    InvitationRegistrationRequest
)


router = APIRouter(prefix="/auth", tags=["Authentication"])
REFRESH_COOKIE_SECURE = os.getenv("REFRESH_COOKIE_SECURE", "true").lower() == "true"

@router.post("/register-organization", response_model=UserResponse)
def register_organization(data: OwnerRegistrationRequest, request: Request, db: Session = Depends(get_db)):
    try:
        # Check email
        if AuthService.get_user_by_email(db, data.email):
            raise HTTPException(status_code=400, detail="Email is already registered.")

        # Check slug
        if OrganizationService.get_organization_by_slug(db, data.organization_slug):
            raise HTTPException(status_code=400, detail="Organization slug is already taken.")

        # 1. Create User
        new_user = app.models.user.User(
            first_name=data.first_name,
            last_name=data.last_name,
            email=AuthService.normalize_email(data.email),
            password_hash=get_password_hash(data.password)
        )
        db.add(new_user)
        db.flush()

        # 2. Create Organization
        org = OrganizationService.create_organization(db, data.organization_name, data.organization_slug)

        # 3. Create Membership (Owner)
        OrganizationService.create_membership(db, org.id, new_user.id, "owner")

        # 4. Create Email Verification
        raw_token = AuthService.generate_email_verification(db, new_user.id)

        # 5. Audit Log
        AuditService.log_action(
            db, action="organization.created", actor_user_id=new_user.id, organization_id=org.id,
            ip_address=request.client.host if request.client else None
        )
        AuditService.log_action(
            db, action="user.registered", actor_user_id=new_user.id,
            ip_address=request.client.host if request.client else None
        )

        db.commit()
        db.refresh(new_user)
        
        # Queue email in mock mode during tests (Step 16)
        from app.tasks.communications import send_email_verification_email
        import os
        frontend_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
        verification_link = f"{frontend_url}/auth/verify-email?token={raw_token}"
        send_email_verification_email.delay(new_user.email, new_user.first_name, verification_link)
        
        return new_user

    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Registration failed due to a conflict.")
    except Exception as e:
        db.rollback()
        raise e

import app.models.user

@router.post("/login", response_model=TokenPairResponse)
@limiter.limit("10/minute")
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    user = AuthService.get_user_by_email(db, data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not AuthService.verify_login(db, user, data.password):
        AuditService.log_action(db, "user.login_failed", target_type="user", target_id=str(user.id), ip_address=request.client.host if request.client else None)
        if user.locked_until:
            locked_until = user.locked_until.replace(tzinfo=timezone.utc) if user.locked_until.tzinfo is None else user.locked_until
            if locked_until > datetime.now(timezone.utc):
                AuditService.log_action(db, "user.locked", actor_user_id=user.id, ip_address=request.client.host if request.client else None)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Block unverified users
    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail={"code": "EMAIL_VERIFICATION_REQUIRED", "message": "Please verify your email address before logging in."}
        )

    # Success
    session, refresh_token = SessionService.create_session(db, user.id, ip_address=request.client.host if request.client else None)
    access_token = TokenService.create_access_token(user.id, session.id, user.token_version)
    
    AuditService.log_action(db, "user.login_succeeded", actor_user_id=user.id, ip_address=request.client.host if request.client else None)
    db.commit()
    
    response.set_cookie(
        key="eventos_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=REFRESH_COOKIE_SECURE,
        samesite="lax",
        path="/auth",
        max_age=60 * 60 * 24 * 30,
    )

    return {"access_token": access_token, "refresh_token": None, "token_type": "bearer"}

@router.post("/refresh", response_model=TokenPairResponse)
def refresh(data: RefreshRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("eventos_refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    token_hash = TokenService.hash_token(refresh_token)
    session = db.query(UserSession).filter(UserSession.refresh_token_hash == token_hash).first()
    
    if not session:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    if session.revoked_at:
        # Token reuse detected! Revoke the whole family.
        SessionService.revoke_token_family(db, session.token_family_id)
        db.commit()
        raise HTTPException(status_code=401, detail="Session revoked")
        
    expires_at = session.expires_at.replace(tzinfo=timezone.utc) if session.expires_at.tzinfo is None else session.expires_at
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")

    user = session.user
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User inactive")

    # Rotate
    new_session, new_refresh_token = SessionService.rotate_refresh_token(db, session)
    access_token = TokenService.create_access_token(user.id, new_session.id, user.token_version)

    response.set_cookie(
        key="eventos_refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=REFRESH_COOKIE_SECURE,
        samesite="lax",
        path="/auth",
        max_age=60 * 60 * 24 * 30,
    )
    
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": None,
        "token_type": "bearer"
    }

@router.post("/logout")
def logout(response: Response, db: Session = Depends(get_db), session_id: str = Depends(get_current_session_id), user: app.models.user.User = Depends(get_current_user)):
    response.delete_cookie("eventos_refresh_token", path="/auth")
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session ID")
    session = db.query(UserSession).filter(UserSession.id == session_uuid).first()
    if session:
        SessionService.revoke_session(db, session)
        AuditService.log_action(db, "user.logged_out", actor_user_id=user.id)
        db.commit()
    return {"status": "ok"}

@router.post("/logout-all")
def logout_all(db: Session = Depends(get_db), user: app.models.user.User = Depends(get_current_user)):
    SessionService.revoke_all_user_sessions(db, user.id)
    AuditService.log_action(db, "user.logged_out", actor_user_id=user.id, metadata={"scope": "all_sessions"})
    db.commit()
    return {"status": "ok"}

@router.get("/me", response_model=UserResponse)
def get_me(user: app.models.user.User = Depends(get_current_user)):
    return user

@router.post("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    token_hash = TokenService.hash_token(token)
    vt = db.query(EmailVerificationToken).filter(EmailVerificationToken.token_hash == token_hash).first()
    
    if not vt:
        raise HTTPException(status_code=400, detail={"code": "INVALID_TOKEN", "message": "Invalid token."})
    if vt.used_at:
        return {"status": "already_verified"}
    expires_at = vt.expires_at.replace(tzinfo=timezone.utc) if vt.expires_at.tzinfo is None else vt.expires_at
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail={"code": "TOKEN_EXPIRED", "message": "Token expired."})
        
    user = vt.user
    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = datetime.now(timezone.utc)
        AuditService.log_action(db, "user.email_verified", actor_user_id=user.id)
        
    vt.used_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "verified"}

from pydantic import BaseModel, EmailStr

class ResendVerificationRequest(BaseModel):
    email: EmailStr

@router.post("/resend-verification")
@limiter.limit("5/minute")
def resend_verification(data: ResendVerificationRequest, request: Request, db: Session = Depends(get_db)):
    user = AuthService.get_user_by_email(db, data.email)
    if not user:
        return {"message": "If this email is registered, a new verification link has been sent."}

    if user.email_verified:
        return {"message": "If this email is registered, a new verification link has been sent."}

    # Invalidate older pending tokens safely (by marking used or expired, or let them just expire)
    for old_token in user.email_verification_tokens:
        if old_token.is_valid:
            old_token.used_at = datetime.now(timezone.utc) # Mark used to invalidate

    raw_token = AuthService.generate_email_verification(db, user.id)
    AuditService.log_action(db, "user.verification_resent", actor_user_id=user.id)
    db.commit()

    from app.tasks.communications import send_email_verification_email
    import os
    frontend_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
    verification_link = f"{frontend_url}/auth/verify-email?token={raw_token}"
    send_email_verification_email.delay(user.email, user.first_name, verification_link)

    return {"message": "If this email is registered, a new verification link has been sent."}

@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(data: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    user = AuthService.get_user_by_email(db, data.email)
    if user and user.is_active:
        # Invalidate older tokens
        for old_token in user.password_reset_tokens:
            if old_token.is_valid:
                old_token.used_at = datetime.now(timezone.utc)
        
        raw_token = AuthService.generate_password_reset(db, user.id)
        AuditService.log_action(db, "user.password_reset_requested", actor_user_id=user.id)
        db.commit()

        from app.tasks.communications import send_password_reset_email
        import os
        frontend_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
        reset_link = f"{frontend_url}/auth/reset-password?token={raw_token}"
        send_password_reset_email.delay(user.email, user.first_name, reset_link)
    
    return {"message": "If an account exists for that email, a reset link has been sent."}

@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    token_hash = TokenService.hash_token(data.token)
    prt = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
    
    if not prt:
        raise HTTPException(status_code=400, detail={"code": "INVALID_TOKEN", "message": "Invalid token."})
    if prt.used_at:
        raise HTTPException(status_code=400, detail={"code": "TOKEN_USED", "message": "Token already used."})
    if not prt.is_valid:
        raise HTTPException(status_code=400, detail={"code": "TOKEN_EXPIRED", "message": "Token expired."})
        
    user = prt.user
    AuthService.change_password(db, user, data.new_password)
    prt.used_at = datetime.now(timezone.utc)
    AuditService.log_action(db, "user.password_reset_completed", actor_user_id=user.id)
    db.commit()
    return {"status": "success"}


@router.get("/invitations/{token}", response_model=InvitationPreview)
def preview_invitation(token: str, db: Session = Depends(get_db)):
    invitation = InvitationService.get_invitation_by_token(db, token)
    if not invitation:
        raise HTTPException(400, {"code": "INVALID_TOKEN", "message": "Invalid token."})
    expires_at = invitation.expires_at.replace(tzinfo=timezone.utc) if invitation.expires_at.tzinfo is None else invitation.expires_at
    if invitation.status != 'pending' or expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, {"code": "TOKEN_EXPIRED", "message": "Invitation is expired or no longer valid."})

    inviter = db.query(app.models.user.User).filter(app.models.user.User.id == invitation.invited_by_user_id).first()

    return {
        "organization_name": invitation.organization.name,
        "inviter_name": f"{inviter.first_name} {inviter.last_name}" if inviter else None,
        "role": invitation.role,
        "email": invitation.email,
        "expires_at": invitation.expires_at,
        "has_account": AuthService.get_user_by_email(db, invitation.email) is not None,
    }


@router.post("/invitations/{token}/accept")
def accept_invitation(token: str, db: Session = Depends(get_db), user: app.models.user.User = Depends(get_current_user)):
    invitation = InvitationService.get_invitation_by_token(db, token)
    if not invitation:
        raise HTTPException(400, {"code": "INVALID_TOKEN", "message": "Invalid token."})
    expires_at = invitation.expires_at.replace(tzinfo=timezone.utc) if invitation.expires_at.tzinfo is None else invitation.expires_at
    if invitation.status != 'pending' or expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, {"code": "TOKEN_EXPIRED", "message": "Invitation is expired or no longer valid."})

    if AuthService.normalize_email(user.email) != AuthService.normalize_email(invitation.email):
        raise HTTPException(403, "Invitation email does not match logged-in user.")

    existing = OrganizationService.get_membership(db, invitation.organization_id, user.id)
    if existing:
        if existing.status == 'active':
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


@router.post("/invitations/{token}/register", response_model=TokenPairResponse)
@limiter.limit("10/minute")
def register_via_invitation(
    token: str,
    data: InvitationRegistrationRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Create an account for an invited (not-yet-registered) user, join the
    invited organization directly (no new org created), and log them in."""
    invitation = InvitationService.get_invitation_by_token(db, token)
    if not invitation:
        raise HTTPException(400, {"code": "INVALID_TOKEN", "message": "Invalid token."})
    expires_at = invitation.expires_at.replace(tzinfo=timezone.utc) if invitation.expires_at.tzinfo is None else invitation.expires_at
    if invitation.status != 'pending' or expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, {"code": "TOKEN_EXPIRED", "message": "Invitation is expired or no longer valid."})

    if AuthService.get_user_by_email(db, invitation.email):
        raise HTTPException(400, "An account with this email already exists. Please sign in to accept this invitation instead.")

    new_user = app.models.user.User(
        first_name=data.first_name,
        last_name=data.last_name,
        email=AuthService.normalize_email(invitation.email),
        password_hash=get_password_hash(data.password),
        email_verified=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(new_user)
    db.flush()

    OrganizationService.create_membership(db, invitation.organization_id, new_user.id, invitation.role)
    InvitationService.accept_invitation(db, invitation)

    AuditService.log_action(
        db, action="user.registered_via_invitation", actor_user_id=new_user.id,
        organization_id=invitation.organization_id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(new_user)

    session, refresh_token = SessionService.create_session(db, new_user.id, ip_address=request.client.host if request.client else None)
    access_token = TokenService.create_access_token(new_user.id, session.id, new_user.token_version)

    AuditService.log_action(db, "user.login_succeeded", actor_user_id=new_user.id, ip_address=request.client.host if request.client else None)
    db.commit()

    response.set_cookie(
        key="eventos_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=REFRESH_COOKIE_SECURE,
        samesite="lax",
        path="/auth",
        max_age=60 * 60 * 24 * 30,
    )

    return {"access_token": access_token, "refresh_token": None, "token_type": "bearer"}