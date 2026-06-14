from sqlalchemy.orm import Session
from app.models.audit import AuditLog
import uuid
from typing import Optional, Dict, Any

class AuditService:
    @staticmethod
    def log_action(
        db: Session,
        action: str,
        actor_user_id: Optional[uuid.UUID] = None,
        organization_id: Optional[uuid.UUID] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AuditLog:
        """
        Record an immutable audit log entry.
        Never store raw tokens or passwords in metadata.
        """
        # Ensure sensitive keys are stripped just in case
        if metadata:
            safe_metadata = {}
            for k, v in metadata.items():
                if "password" not in k.lower() and "token" not in k.lower():
                    safe_metadata[k] = v
            metadata = safe_metadata

        audit_entry = AuditLog(
            action=action,
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata_=metadata
        )
        db.add(audit_entry)
        # Flush to DB immediately without committing the whole transaction yet
        db.flush()
        return audit_entry
