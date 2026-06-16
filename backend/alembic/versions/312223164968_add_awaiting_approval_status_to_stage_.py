"""phase6 automatic engine: add awaiting_approval stage_run status

Revision ID: 312223164968
Revises: 956af42bd8c6
Create Date: 2026-06-15 16:03:16.703088
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "312223164968"
down_revision: Union[str, None] = "956af42bd8c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD = "status IN ('pending', 'active', 'completed', 'skipped')"
_NEW = "status IN ('pending', 'awaiting_approval', 'active', 'completed', 'skipped')"


def _has_check_constraint(name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(
        constraint.get("name") == name
        for constraint in inspector.get_check_constraints("stage_runs")
    )


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        if _has_check_constraint("ck_stage_run_status"):
            op.drop_constraint("ck_stage_run_status", "stage_runs", type_="check")
        op.create_check_constraint("ck_stage_run_status", "stage_runs", _NEW)
    else:
        with op.batch_alter_table("stage_runs", schema=None) as batch:
            if _has_check_constraint("ck_stage_run_status"):
                batch.drop_constraint("ck_stage_run_status", type_="check")
            batch.create_check_constraint("ck_stage_run_status", _NEW)


def downgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        if _has_check_constraint("ck_stage_run_status"):
            op.drop_constraint("ck_stage_run_status", "stage_runs", type_="check")
        op.create_check_constraint("ck_stage_run_status", "stage_runs", _OLD)
    else:
        with op.batch_alter_table("stage_runs", schema=None) as batch:
            if _has_check_constraint("ck_stage_run_status"):
                batch.drop_constraint("ck_stage_run_status", type_="check")
            batch.create_check_constraint("ck_stage_run_status", _OLD)