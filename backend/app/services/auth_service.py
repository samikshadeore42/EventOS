from sqlalchemy.orm import Session
from app.models.user import User
from app.models.auth_tokens import EmailVerificationToken, PasswordResetToken
from app.core.security import get_password_hash, verify_password
from app.services.token_service import TokenService
from app.services.session_service import SessionService
import uuid
from datetime import datetime, timedelta, timezone

class AuthService:
    LOGIN_MAX_ATTEMPTS = 5
    LOGIN_LOCK_MINUTES = 15

    @staticmethod
    def normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def get_user_by_email(db: Session, email: str) -> User | None:
        return db.query(User).filter(User.email == AuthService.normalize_email(email)).first()

    @staticmethod
    def verify_login(db: Session, user: User, plain_password: str) -> bool:
        now = datetime.now(timezone.utc)
        
        if not user.is_active:
            return False

        if user.locked_until and user.locked_until > now:
            return False # Still locked

        # Check password
        if not verify_password(plain_password, user.password_hash):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= AuthService.LOGIN_MAX_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=AuthService.LOGIN_LOCK_MINUTES)
            db.flush()
            return False

        # Success
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = now
        db.flush()
        return True

    @staticmethod
    def lock_account(db: Session, user: User):
        now = datetime.now(timezone.utc)
        user.locked_until = now + timedelta(minutes=AuthService.LOGIN_LOCK_MINUTES)
        db.flush()

    @staticmethod
    def generate_email_verification(db: Session, user_id: uuid.UUID) -> str:
        raw_token = TokenService.generate_random_token()
        token_hash = TokenService.hash_token(raw_token)
        now = datetime.now(timezone.utc)
        
        verification = EmailVerificationToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=now + timedelta(hours=24)
        )
        db.add(verification)
        db.flush()
        return raw_token

    @staticmethod
    def generate_password_reset(db: Session, user_id: uuid.UUID) -> str:
        raw_token = TokenService.generate_random_token()
        token_hash = TokenService.hash_token(raw_token)
        now = datetime.now(timezone.utc)
        
        reset = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=now + timedelta(minutes=30)
        )
        db.add(reset)
        db.flush()
        return raw_token
    
    @staticmethod
    def change_password(db: Session, user: User, new_password: str):
        user.password_hash = get_password_hash(new_password)
        user.token_version += 1
        user.password_changed_at = datetime.now(timezone.utc)
        # Revoke sessions
        SessionService.revoke_all_user_sessions(db, user.id)
        db.flush()
