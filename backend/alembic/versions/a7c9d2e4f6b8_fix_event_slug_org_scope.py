"""fix event slug organization scope

Revision ID: a7c9d2e4f6b8
Revises: 2034bccac3df
Create Date: 2026-06-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c9d2e4f6b8"
down_revision: Union[str, None] = "2034bccac3df"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for constraint in inspector.get_unique_constraints("events"):
        if constraint.get("column_names") == ["slug"]:
            op.drop_constraint(constraint["name"], "events", type_="unique")

    op.create_unique_constraint(
        "uq_events_org_slug",
        "events",
        ["organization_id", "slug"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_events_org_slug", "events", type_="unique")
    op.create_unique_constraint("events_slug_key", "events", ["slug"])
