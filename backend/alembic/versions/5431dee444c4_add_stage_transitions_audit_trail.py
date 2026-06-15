"""add stage_transitions audit trail (phase 4)

Revision ID: a4f1c2e3b9d7
Revises: <YOUR_PREVIOUS_REVISION_ID>  # Replace this with the revision ID of your LAST migration
Create Date: 2026-06-15 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '5431dee444c4' # Use the ID Alembic just generated
down_revision: Union[str, None] = "9f0a1b2c3d4e" 
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        'stage_transitions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('stage_definition_id', sa.UUID(), nullable=True),
        sa.Column('stage_run_id', sa.UUID(), nullable=True),
        sa.Column('transition_type', sa.String(length=50), nullable=False),
        sa.Column('from_status', sa.String(length=50), nullable=True),
        sa.Column('to_status', sa.String(length=50), nullable=True),
        sa.Column('actor_user_id', sa.UUID(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('event_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(
            ['event_id', 'stage_definition_id'],
            ['stage_definitions.event_id', 'stage_definitions.id'],
            name='fk_stage_transition_event_stage_definition',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "transition_type IN ('publish', 'advance', 'schedule_change', 'reorder', 'manual_override')",
            name='ck_stage_transition_type',
        ),
    )
    op.create_index(op.f('ix_stage_transitions_event_id'), 'stage_transitions', ['event_id'], unique=False)

def downgrade() -> None:
    op.drop_index(op.f('ix_stage_transitions_event_id'), table_name='stage_transitions')
    op.drop_table('stage_transitions')