"""add_phase9_risk_intelligence

Revision ID: ae02a165cb83
Revises: a7c9d2e4f6b8
Create Date: 2026-06-16 08:50:14.332669
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "ae02a165cb83"
down_revision: Union[str, None] = "a7c9d2e4f6b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "team_risk_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=False),
        sa.Column("risk_level", sa.String(length=30), nullable=False),
        sa.Column("signals", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("reasons", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("recommended_actions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("source", sa.String(length=80), nullable=False, server_default="phase9_risk_engine"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_team_risk_snapshots_event_id", "team_risk_snapshots", ["event_id"])
    op.create_index("ix_team_risk_snapshots_event_level", "team_risk_snapshots", ["event_id", "risk_level"])
    op.create_index("ix_team_risk_snapshots_event_team_created", "team_risk_snapshots", ["event_id", "team_id", "created_at"])
    op.create_index("ix_team_risk_snapshots_created", "team_risk_snapshots", ["created_at"])

    op.create_table(
        "risk_signals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("signal_type", sa.String(length=80), nullable=False),
        sa.Column("severity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("source", sa.String(length=80), nullable=False, server_default="phase9_risk_engine"),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_risk_signals_event_id", "risk_signals", ["event_id"])
    op.create_index("ix_risk_signals_event_signal", "risk_signals", ["event_id", "signal_type"])
    op.create_index("ix_risk_signals_event_team", "risk_signals", ["event_id", "team_id"])
    op.create_index("ix_risk_signals_observed_at", "risk_signals", ["observed_at"])


def downgrade() -> None:
    op.drop_index("ix_risk_signals_observed_at", table_name="risk_signals")
    op.drop_index("ix_risk_signals_event_team", table_name="risk_signals")
    op.drop_index("ix_risk_signals_event_signal", table_name="risk_signals")
    op.drop_index("ix_risk_signals_event_id", table_name="risk_signals")
    op.drop_table("risk_signals")

    op.drop_index("ix_team_risk_snapshots_created", table_name="team_risk_snapshots")
    op.drop_index("ix_team_risk_snapshots_event_team_created", table_name="team_risk_snapshots")
    op.drop_index("ix_team_risk_snapshots_event_level", table_name="team_risk_snapshots")
    op.drop_index("ix_team_risk_snapshots_event_id", table_name="team_risk_snapshots")
    op.drop_table("team_risk_snapshots")