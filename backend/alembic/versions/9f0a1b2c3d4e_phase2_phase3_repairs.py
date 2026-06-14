"""phase2_phase3_repairs

Revision ID: 9f0a1b2c3d4e
Revises: 6e03e770d50e
Create Date: 2026-06-15
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "9f0a1b2c3d4e"
down_revision: Union[str, None] = "6e03e770d50e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    org_id = bind.execute(sa.text("SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1")).scalar()
    if org_id is None:
        org_id = str(uuid.uuid4())
        bind.execute(sa.text("""
            INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at)
            VALUES (:id, 'EventOS Legacy Organization', 'eventos-legacy', true, now(), now())
        """), {"id": org_id})

    bind.execute(sa.text("UPDATE events SET organization_id = :org_id WHERE organization_id IS NULL"), {"org_id": org_id})
    op.alter_column("events", "organization_id", nullable=False)

    op.create_foreign_key(
        "fk_events_organization_id",
        "events",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("uq_participant_email_event", "participants", type_="unique")
    op.create_unique_constraint("uq_participant_email_event", "participants", ["email", "event_id"])

    op.add_column("event_config", sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True))
    legacy_event_id = bind.execute(sa.text("SELECT id FROM events ORDER BY created_at ASC LIMIT 1")).scalar()
    if legacy_event_id is not None:
        bind.execute(sa.text("UPDATE event_config SET event_id = :event_id WHERE event_id IS NULL"), {"event_id": legacy_event_id})
    op.alter_column("event_config", "event_id", nullable=False)
    op.create_foreign_key("fk_event_config_event_id", "event_config", "events", ["event_id"], ["id"], ondelete="CASCADE")
    op.create_unique_constraint("uq_event_config_event_id", "event_config", ["event_id"])
    op.create_index("ix_event_config_event_id", "event_config", ["event_id"])

    op.add_column("templates", sa.Column("key", sa.String(length=100), nullable=True))
    op.add_column("templates", sa.Column("event_type_label", sa.String(length=120), nullable=True))
    bind.execute(sa.text("""
        UPDATE templates
        SET key = lower(replace(name, ' ', '_')),
            event_type_label = lower(replace(name, ' ', '_'))
        WHERE key IS NULL
    """))
    op.alter_column("templates", "key", nullable=False)
    op.alter_column("templates", "event_type_label", nullable=False)
    op.create_unique_constraint("uq_templates_key_version", "templates", ["key", "version"])


def downgrade() -> None:
    op.drop_constraint("uq_templates_key_version", "templates", type_="unique")
    op.drop_column("templates", "event_type_label")
    op.drop_column("templates", "key")

    op.drop_index("ix_event_config_event_id", table_name="event_config")
    op.drop_constraint("uq_event_config_event_id", "event_config", type_="unique")
    op.drop_constraint("fk_event_config_event_id", "event_config", type_="foreignkey")
    op.drop_column("event_config", "event_id")

    op.drop_constraint("uq_participant_email_event", "participants", type_="unique")
    op.create_unique_constraint("uq_participant_email_event", "participants", ["email"])

    op.drop_constraint("fk_events_organization_id", "events", type_="foreignkey")
    op.alter_column("events", "organization_id", nullable=True)