import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
# Import these to handle dialect differences
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy import JSON, String as SA_String

from app.core.database import Base
from app.models.mixins import EventScopedMixin

# Helper to handle cross-dialect type support
from sqlalchemy import Dialect

def get_json_type():
    return JSONB().with_variant(JSON(), "sqlite")

def get_uuid_type():
    return PG_UUID(as_uuid=True).with_variant(SA_String(36), "sqlite")

class NotificationOutbox(EventScopedMixin, Base):
    __tablename__ = "notification_outbox"

    id: Mapped[uuid.UUID] = mapped_column(get_uuid_type(), primary_key=True, default=uuid.uuid4)
    
    notification_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(get_uuid_type(), nullable=True)
    recipient_role: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Use the helper for the JSON column
    payload: Mapped[dict] = mapped_column(get_json_type(), default=dict, nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("event_id", "idempotency_key", name="uq_outbox_event_idempotency"),
        CheckConstraint(
            "status IN ('pending', 'processing', 'delivered', 'dead')",
            name="ck_outbox_status",
        ),
    )
    