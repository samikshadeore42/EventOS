"""add stage_transitions audit trail

Revision ID: 5431dee444c4
Revises: 673328d2ec17
Create Date: 2026-06-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "5431dee444c4"
down_revision: Union[str, None] = "673328d2ec17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    stage_def_uniques = inspector.get_unique_constraints("stage_definitions")
    has_event_id_unique = any(
        constraint.get("column_names") == ["event_id", "id"]
        for constraint in stage_def_uniques
    )

    if not has_event_id_unique:
        op.create_unique_constraint(
            "uq_stage_def_event_id",
            "stage_definitions",
            ["event_id", "id"],
        )

    op.create_table(
        "stage_transitions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("stage_definition_id", sa.UUID(), nullable=True),
        sa.Column("stage_run_id", sa.UUID(), nullable=True),
        sa.Column("transition_type", sa.String(length=50), nullable=False),
        sa.Column("from_status", sa.String(length=50), nullable=True),
        sa.Column("to_status", sa.String(length=50), nullable=True),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["event_id", "stage_definition_id"],
            ["stage_definitions.event_id", "stage_definitions.id"],
            name="fk_stage_transition_event_stage_definition",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "transition_type IN ('publish', 'advance', 'schedule_change', 'reorder', 'manual_override')",
            name="ck_stage_transition_type",
        ),
    )
    op.create_index(
        op.f("ix_stage_transitions_event_id"),
        "stage_transitions",
        ["event_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_stage_transitions_event_id"), table_name="stage_transitions")
    op.drop_table("stage_transitions")