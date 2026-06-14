"""merge_phase1_and_phase2

Revision ID: b862f881f870
Revises: 0221008faee3, 3208a71e5a34
Create Date: 2026-06-14 11:14:21.920096

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b862f881f870'
down_revision: Union[str, None] = ('0221008faee3', '3208a71e5a34')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
