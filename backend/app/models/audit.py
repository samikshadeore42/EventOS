from sqlalchemy import String, DateTime, ForeignKey, Text, TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime, timezone
import uuid
import json
from app.core.database import Base

class JSONType(TypeDecorator):
    impl = Text
    def process_bind_param(self, value, dialect):
        if value is not None:
            return json.dumps(value)
        return value
    def process_result_value(self, value, dialect):
        if value is not None:
            return json.loads(value)
        return value

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Ensure JSON is compatible with SQLite and Postgres for tests
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB().with_variant(JSONType(), "sqlite"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
