# File: backend/app/models/template.py
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    key: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    event_type_label: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_system_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
    )

    default_capabilities: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    suggested_stages: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    required_roles: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", backref="custom_templates")

    __table_args__ = (
        UniqueConstraint("key", "version", name="uq_templates_key_version"),
    )