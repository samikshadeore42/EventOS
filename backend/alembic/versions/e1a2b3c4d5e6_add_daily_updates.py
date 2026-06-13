"""add daily_updates table

Revision ID: e1a2b3c4d5e6
Revises: 3d068948f220
Create Date: 2026-06-13 10:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e1a2b3c4d5e6'
down_revision: Union[str, None] = '3d068948f220'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'daily_updates',
        sa.Column('id',             sa.UUID(),    nullable=False),
        sa.Column('participant_id', sa.UUID(),    nullable=False),
        sa.Column('team_id',        sa.UUID(),    nullable=False),
        sa.Column('what_i_built',   sa.Text(),    nullable=False),
        sa.Column('blockers',       sa.Text(),    nullable=True),
        sa.Column('hours_worked',   sa.Integer(), nullable=True),
        sa.Column('update_date',    sa.Date(),    nullable=False),
        sa.Column('submitted_at',   sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['participant_id'], ['participants.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_daily_update_participant_date',
                    'daily_updates', ['participant_id', 'update_date'],
                    unique=True)
    op.create_index('ix_daily_update_team_date',
                    'daily_updates', ['team_id', 'update_date'])


def downgrade() -> None:
    op.drop_index('ix_daily_update_team_date',    table_name='daily_updates')
    op.drop_index('ix_daily_update_participant_date', table_name='daily_updates')
    op.drop_table('daily_updates')