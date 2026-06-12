from fastapi import APIRouter, Depends, HTTPException, status, Request
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
from app.core.security import get_password_hash
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["Authentication"])

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
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
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

    # Success
    session, refresh_token = SessionService.create_session(db, user.id, ip_address=request.client.host if request.client else None)
    access_token = TokenService.create_access_token(user.id, session.id, user.token_version)
    
    AuditService.log_action(db, "user.login_succeeded", actor_user_id=user.id, ip_address=request.client.host if request.client else None)
    db.commit()

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

@router.post("/refresh", response_model=TokenPairResponse)
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    token_hash = TokenService.hash_token(data.refresh_token)
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
    new_refresh_token = SessionService.rotate_refresh_token(db, session)
    access_token = TokenService.create_access_token(user.id, session.id, user.token_version)
    
    db.commit()
    return {"access_token": access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}

@router.post("/logout")
def logout(db: Session = Depends(get_db), session_id: str = Depends(get_current_session_id), user: app.models.user.User = Depends(get_current_user)):
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
def resend_verification(data: ResendVerificationRequest, db: Session = Depends(get_db)):
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
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = AuthService.get_user_by_email(db, data.email)
    if user and user.is_active:
        raw_token = AuthService.generate_password_reset(db, user.id)
        AuditService.log_action(db, "user.password_reset_requested", actor_user_id=user.id)
        db.commit()
        # TODO: send email
    
    return {"message": "If an account exists for that email, a reset link has been sent."}

@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    token_hash = TokenService.hash_token(data.token)
    prt = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
    
    if not prt:
        raise HTTPException(status_code=400, detail={"code": "INVALID_TOKEN", "message": "Invalid token."})
    if prt.used_at:
        raise HTTPException(status_code=400, detail={"code": "TOKEN_USED", "message": "Token already used."})
    expires_at = prt.expires_at.replace(tzinfo=timezone.utc) if prt.expires_at.tzinfo is None else prt.expires_at
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail={"code": "TOKEN_EXPIRED", "message": "Token expired."})
        
    user = prt.user
    AuthService.change_password(db, user, data.new_password)
    prt.used_at = datetime.now(timezone.utc)
    AuditService.log_action(db, "user.password_reset_completed", actor_user_id=user.id)
    db.commit()
    return {"status": "success"}

