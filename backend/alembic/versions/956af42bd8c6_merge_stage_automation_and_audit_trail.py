"""merge stage automation and audit trail

Revision ID: 956af42bd8c6
Revises: 5431dee444c4, 673328d2ec17
Create Date: 2026-06-15 10:41:36.388751

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '956af42bd8c6'
down_revision: Union[str, None] = ('5431dee444c4', '673328d2ec17')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
