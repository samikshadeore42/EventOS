from sqlalchemy.orm import Session
from app.models.auth_tokens import AdminInvitation
from app.services.token_service import TokenService
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

class InvitationService:
    @staticmethod
    def create_invitation(
        db: Session,
        organization_id: uuid.UUID,
        email: str,
        role: str,
        invited_by_user_id: uuid.UUID,
        expires_in_hours: int = 48
    ) -> tuple[AdminInvitation, str]:
        raw_token = TokenService.generate_random_token()
        token_hash = TokenService.hash_token(raw_token)
        
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=expires_in_hours)

        # Check for existing pending invitation for same email/org
        existing = db.query(AdminInvitation).filter(
            AdminInvitation.organization_id == organization_id,
            AdminInvitation.email == email,
            AdminInvitation.status == 'pending'
        ).first()

        if existing:
            # We can just revoke the old one or renew it. Let's revoke the old one.
            existing.status = 'revoked'
            existing.revoked_at = now
            db.flush()

        invitation = AdminInvitation(
            organization_id=organization_id,
            email=email,
            role=role,
            token_hash=token_hash,
            expires_at=expires_at,
            invited_by_user_id=invited_by_user_id,
            status='pending'
        )
        db.add(invitation)
        db.flush()

        return invitation, raw_token

    @staticmethod
    def get_invitation_by_token(db: Session, raw_token: str) -> Optional[AdminInvitation]:
        token_hash = TokenService.hash_token(raw_token)
        return db.query(AdminInvitation).filter(AdminInvitation.token_hash == token_hash).first()

    @staticmethod
    def revoke_invitation(db: Session, invitation: AdminInvitation):
        invitation.status = 'revoked'
        invitation.revoked_at = datetime.now(timezone.utc)
        db.flush()

    @staticmethod
    def accept_invitation(db: Session, invitation: AdminInvitation):
        invitation.status = 'accepted'
        invitation.accepted_at = datetime.now(timezone.utc)
        db.flush()
