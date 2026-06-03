"""Merge heads

Revision ID: b9076d372707
Revises: 1f25254f2202, f7f93f6f1c30
Create Date: 2026-06-03 20:09:38.338875

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9076d372707'
down_revision: Union[str, None] = ('1f25254f2202', 'f7f93f6f1c30')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
