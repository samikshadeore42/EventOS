from sqlalchemy.orm import Session
from app.models.auth_tokens import UserSession
from app.services.token_service import TokenService
import uuid
from datetime import datetime, timedelta, timezone

class SessionService:
    @staticmethod
    def create_session(
        db: Session,
        user_id: uuid.UUID,
        refresh_token_expire_days: int = 7,
        user_agent: str = None,
        ip_address: str = None
    ) -> tuple[UserSession, str]:
        raw_refresh_token = TokenService.generate_random_token()
        refresh_token_hash = TokenService.hash_token(raw_refresh_token)
        
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=refresh_token_expire_days)

        session = UserSession(
            user_id=user_id,
            refresh_token_hash=refresh_token_hash,
            token_family_id=str(uuid.uuid4()),
            user_agent=user_agent,
            ip_address=ip_address,
            expires_at=expires_at,
            last_used_at=now
        )
        db.add(session)
        db.flush()

        return session, raw_refresh_token

    @staticmethod
    def rotate_refresh_token(
        db: Session,
        session: UserSession,
        refresh_token_expire_days: int = 7
    ) -> tuple[UserSession, str]:
        # Revoke the old session
        session.revoked_at = datetime.now(timezone.utc)
        
        # Create a new session with the same token_family_id
        new_raw_refresh_token = TokenService.generate_random_token()
        new_refresh_token_hash = TokenService.hash_token(new_raw_refresh_token)
        
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=refresh_token_expire_days)
        
        new_session = UserSession(
            user_id=session.user_id,
            refresh_token_hash=new_refresh_token_hash,
            token_family_id=session.token_family_id,
            user_agent=session.user_agent,
            ip_address=session.ip_address,
            expires_at=expires_at,
            last_used_at=now
        )
        db.add(new_session)
        db.flush()
        
        return new_session, new_raw_refresh_token

    @staticmethod
    def revoke_session(db: Session, session: UserSession):
        session.revoked_at = datetime.now(timezone.utc)
        db.flush()

    @staticmethod
    def revoke_token_family(db: Session, token_family_id: str):
        now = datetime.now(timezone.utc)
        db.query(UserSession).filter(UserSession.token_family_id == token_family_id).update({"revoked_at": now})
        db.flush()

    @staticmethod
    def revoke_all_user_sessions(db: Session, user_id: uuid.UUID):
        now = datetime.now(timezone.utc)
        db.query(UserSession).filter(
            UserSession.user_id == user_id, 
            UserSession.revoked_at.is_(None)
        ).update({"revoked_at": now})
        db.flush()
