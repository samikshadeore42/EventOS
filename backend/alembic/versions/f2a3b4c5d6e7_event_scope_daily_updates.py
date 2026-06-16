"""event_scope_daily_updates

Revision ID: f2a3b4c5d6e7
Revises: e1a2b3c4d5e6
Create Date: 2026-06-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "daily_updates",
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    op.execute("""
        UPDATE daily_updates du
        SET event_id = p.event_id
        FROM participants p
        WHERE du.participant_id = p.id
          AND du.event_id IS NULL
    """)

    op.alter_column("daily_updates", "event_id", nullable=False)

    op.create_foreign_key(
        "fk_daily_updates_event_id",
        "daily_updates",
        "events",
        ["event_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_index(
        "ix_daily_updates_event_id",
        "daily_updates",
        ["event_id"],
        unique=False,
    )

    op.create_index(
        "ix_daily_updates_event_date",
        "daily_updates",
        ["event_id", "update_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_daily_updates_event_date", table_name="daily_updates")
    op.drop_index("ix_daily_updates_event_id", table_name="daily_updates")
    op.drop_constraint("fk_daily_updates_event_id", "daily_updates", type_="foreignkey")
    op.drop_column("daily_updates", "event_id")