"""restore approval status

Revision ID: 413caf585032
Revises: a2b3c4d5e6f7
Create Date: 2026-05-27 15:41:14.692030

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '413caf585032'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add column with default 'pending'
    op.add_column('teams', sa.Column('approval_status', sa.String(length=20), server_default='pending', nullable=False))
    op.create_index(op.f('ix_teams_approval_status'), 'teams', ['approval_status'], unique=False)
    
    # Data migration: approved teams -> approved, others remain pending
    op.execute("UPDATE teams SET approval_status = 'approved' WHERE is_approved = true")
    op.execute("UPDATE teams SET approval_status = 'pending' WHERE is_approved = false")


def downgrade() -> None:
    op.drop_index(op.f('ix_teams_approval_status'), table_name='teams')
    op.drop_column('teams', 'approval_status')
