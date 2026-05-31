"""Add admin and employee auth models

Revision ID: 6b4a1fc0ef0a
Revises: 413caf585032
Create Date: 2026-05-30 06:05:18.382371

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '6b4a1fc0ef0a'
down_revision: Union[str, None] = '413caf585032'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Safely drop old tables using raw SQL.
    # This natively prevents errors in Postgres and protects the transaction block!
    op.execute("DROP INDEX IF EXISTS ix_admin_users_username;")
    op.execute("DROP TABLE IF EXISTS admin_users CASCADE;")

    # 2. CREATE the employees table from scratch
    op.create_table('employees',
        sa.Column('employee_id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('employee_id')
    )

    # 3. CREATE the admins table
    op.create_table('admins',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('employee_id', sa.String(length=50), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.employee_id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('employee_id')
    )
    op.create_index(op.f('ix_admins_username'), 'admins', ['username'], unique=True)


def downgrade() -> None:
    # 1. Recreate old admin_users table
    op.create_table('admin_users',
        sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('username', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
        sa.Column('emp_id', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
        sa.Column('hashed_password', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
        sa.PrimaryKeyConstraint('id', name='admin_users_pkey'),
        sa.UniqueConstraint('emp_id', name='admin_users_emp_id_key')
    )
    op.create_index('ix_admin_users_username', 'admin_users', ['username'], unique=True)
    
    # 2. Drop admins table
    op.drop_index(op.f('ix_admins_username'), table_name='admins')
    op.drop_table('admins')
    
    # 3. Drop employees table entirely
    op.drop_table('employees')