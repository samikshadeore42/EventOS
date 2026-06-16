import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
# Import these to handle dialect differences
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy import JSON

from app.core.database import Base
from app.models.mixins import EventScopedMixin

# Helper to handle cross-dialect JSON support (JSONB on Postgres, JSON on SQLite
# for tests). NOTE: UUID columns deliberately do NOT get a similar SQLite variant
# — plain postgresql.UUID(as_uuid=True) round-trips correctly on SQLite in this
# SQLAlchemy version and matches Event.id / EventScopedMixin.event_id. A
# with_variant(String(36), "sqlite") shim was tried here previously and broke:
# SQLAlchemy binds uuid.UUID values through the LEFT-hand column's type, and
# plain String has no bind processor for UUID objects, so any comparison whose
# other side is a real uuid.UUID (e.g. from a freshly-created/refreshed row)
# fails with "sqlite3.ProgrammingError: type 'UUID' is not supported".
def get_json_type():
    return JSONB().with_variant(JSON(), "sqlite")

class NotificationOutbox(EventScopedMixin, Base):
    __tablename__ = "notification_outbox"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    notification_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
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