"""add approval status

Revision ID: 12b2408b448d
Revises: 11b1408b448d
Create Date: 2026-05-27 12:40:26.420330

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '12b2408b448d'
down_revision: Union[str, None] = '11b1408b448d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('teams', sa.Column('approval_status', sa.String(length=20), nullable=True))
    op.execute("UPDATE teams SET approval_status = 'pending'")
    op.alter_column('teams', 'approval_status', nullable=False)
    op.create_index(op.f('ix_teams_approval_status'), 'teams', ['approval_status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_teams_approval_status'), table_name='teams')
    op.drop_column('teams', 'approval_status')
