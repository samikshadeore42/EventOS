"""add_notification_outbox

Revision ID: 2034bccac3df
Revises: 312223164968
Create Date: 2026-06-15 23:07:23.707435
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "2034bccac3df"
down_revision: Union[str, None] = "312223164968"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def _has_unique_constraint(table_name: str, constraint_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(
        constraint["name"] == constraint_name
        for constraint in inspector.get_unique_constraints(table_name)
    )


def _has_foreign_key(table_name: str, fk_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(
        constraint["name"] == fk_name
        for constraint in inspector.get_foreign_keys(table_name)
    )


def upgrade() -> None:
    if not _has_table("notification_outbox"):
        op.create_table(
            "notification_outbox",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("notification_type", sa.String(length=100), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("recipient_user_id", sa.UUID(), nullable=True),
            sa.Column("recipient_role", sa.String(length=50), nullable=True),
            sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("available_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("idempotency_key", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("event_id", sa.UUID(), nullable=False),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("event_id", "idempotency_key", name="uq_outbox_event_idempotency"),
            sa.CheckConstraint(
                "status IN ('pending', 'processing', 'delivered', 'dead')",
                name="ck_outbox_status",
            ),
        )

    if not _has_index("notification_outbox", "ix_notification_outbox_event_id"):
        op.create_index(
            op.f("ix_notification_outbox_event_id"),
            "notification_outbox",
            ["event_id"],
        )

    if not _has_index("notification_outbox", "ix_outbox_pending_due"):
        op.create_index(
            "ix_outbox_pending_due",
            "notification_outbox",
            ["available_at"],
            postgresql_where=sa.text("status = 'pending'"),
        )

    if not _has_column("in_app_notifications", "dedupe_key"):
        op.add_column(
            "in_app_notifications",
            sa.Column("dedupe_key", sa.String(length=255), nullable=True),
        )

    if not _has_unique_constraint("in_app_notifications", "uq_inapp_event_dedupe"):
        op.create_unique_constraint(
            "uq_inapp_event_dedupe",
            "in_app_notifications",
            ["event_id", "dedupe_key"],
        )

    if not _has_column("event_state", "event_id"):
        op.add_column("event_state", sa.Column("event_id", sa.UUID(), nullable=True))

    if not _has_index("event_state", "ix_event_state_event_id"):
        op.create_index(op.f("ix_event_state_event_id"), "event_state", ["event_id"])

    if not _has_foreign_key("event_state", "fk_event_state_event_id"):
        op.create_foreign_key(
            "fk_event_state_event_id",
            "event_state",
            "events",
            ["event_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    if _has_foreign_key("event_state", "fk_event_state_event_id"):
        op.drop_constraint("fk_event_state_event_id", "event_state", type_="foreignkey")

    if _has_index("event_state", "ix_event_state_event_id"):
        op.drop_index(op.f("ix_event_state_event_id"), table_name="event_state")

    if _has_column("event_state", "event_id"):
        op.drop_column("event_state", "event_id")

    if _has_unique_constraint("in_app_notifications", "uq_inapp_event_dedupe"):
        op.drop_constraint("uq_inapp_event_dedupe", "in_app_notifications", type_="unique")

    if _has_column("in_app_notifications", "dedupe_key"):
        op.drop_column("in_app_notifications", "dedupe_key")

    if _has_index("notification_outbox", "ix_outbox_pending_due"):
        op.drop_index("ix_outbox_pending_due", table_name="notification_outbox")

    if _has_index("notification_outbox", "ix_notification_outbox_event_id"):
        op.drop_index(op.f("ix_notification_outbox_event_id"), table_name="notification_outbox")

    if _has_table("notification_outbox"):
        op.drop_table("notification_outbox")