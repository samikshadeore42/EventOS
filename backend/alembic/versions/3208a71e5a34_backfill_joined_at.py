"""backfill joined_at

Revision ID: 3208a71e5a34
Revises: 0940abbefebb
Create Date: 2026-06-13 00:10:33.038355

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3208a71e5a34'
down_revision: Union[str, None] = '0940abbefebb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "organization_memberships" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("organization_memberships")}

    if "joined_at" not in columns:
        return

    if "created_at" in columns:
        op.execute(
            "UPDATE organization_memberships SET joined_at = created_at WHERE joined_at IS NULL"
        )
    else:
        op.execute(
            "UPDATE organization_memberships SET joined_at = now() WHERE joined_at IS NULL"
        )

def downgrade() -> None:
    pass
