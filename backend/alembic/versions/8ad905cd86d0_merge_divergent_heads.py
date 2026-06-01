"""merge divergent heads

Revision ID: 8ad905cd86d0
Revises: a2c8fe16364f, bec64d926a87
Create Date: 2026-06-01 10:07:48.075721

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ad905cd86d0'
down_revision: Union[str, None] = ('a2c8fe16364f', 'bec64d926a87')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
