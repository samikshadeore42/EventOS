"""phase2_multi_event_foundation

Revision ID: 0221008faee3
Revises: b8dec86e469e
Create Date: 2026-06-13 16:47:43.340222

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision: str = '0221008faee3'
down_revision: Union[str, None] = 'b8dec86e469e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # ---------------------------------------------------------
    # STEP 1: Create the new 'events' table
    # ---------------------------------------------------------
    op.create_table('events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('event_type', sa.String(length=50), server_default='hackathon', nullable=True),
        sa.Column('configuration', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('status', sa.String(length=30), server_default='draft', nullable=True),
        sa.Column('is_legacy', sa.Boolean(), server_default='false', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_events_id'), 'events', ['id'], unique=False)
    op.create_index(op.f('ix_events_organization_id'), 'events', ['organization_id'], unique=False)

    # ---------------------------------------------------------
    # STEP 2: Create a Legacy WiSE@TI Event to hold existing data
    # ---------------------------------------------------------
    legacy_event_id = str(uuid.uuid4())
    op.execute(
        f"INSERT INTO events (id, name, slug, description, is_legacy, status, configuration) "
        f"VALUES ('{legacy_event_id}', 'WiSE@TI Legacy Hackathon', 'wise-ti-legacy', 'Legacy data migrated from Phase 1', true, 'archived', '{{}}')"
    )

    # ---------------------------------------------------------
    # STEP 3 & 4: Add event_id as NULLABLE, then BACKFILL data
    # ---------------------------------------------------------
    operational_tables = [
        'participants', 'teams', 'project_submissions', 'mentors', 
        'mentor_assignments', 'mentor_sessions', 'mentor_feedback', 
        'evaluators', 'evaluations', 'evaluator_team_assignments', 'communication_logs'
    ]

    for table in operational_tables:
        # A: Add the column allowing NULLs so Postgres doesn't crash
        op.add_column(table, sa.Column('event_id', postgresql.UUID(as_uuid=True), nullable=True))
        
        # B: Connect the Foreign Key
        op.create_foreign_key(f"fk_{table}_event_id", table, 'events', ['event_id'], ['id'], ondelete="CASCADE")
        
        # C: Safely inject the Legacy ID into all existing rows!
        op.execute(f"UPDATE {table} SET event_id = '{legacy_event_id}'")
        
        # D: Lock the column down so no future rows can be NULL
        op.alter_column(table, 'event_id', nullable=False)
        
        # E: Build the index for fast API lookups
        op.create_index(op.f(f'ix_{table}_event_id'), table, ['event_id'], unique=False)

   # ---------------------------------------------------------
    # STEP 5: Fix the Email Unique Constraints (Per-Event Scoping)
    # ---------------------------------------------------------
    # Participants (This one had a named explicit constraint)
    op.drop_constraint('uq_participant_email', 'participants', type_='unique')
    op.create_unique_constraint('uq_participant_email_event', 'participants', ['email', 'event_id'])

    # Mentors (Only had a unique index)
    op.drop_index('ix_mentors_email', table_name='mentors')
    op.create_index(op.f('ix_mentors_email'), 'mentors', ['email'], unique=False)
    op.create_unique_constraint('uq_mentor_email_event', 'mentors', ['email', 'event_id'])

    # Evaluators (Only had a unique index)
    op.drop_index('ix_evaluators_email', table_name='evaluators')
    op.create_index(op.f('ix_evaluators_email'), 'evaluators', ['email'], unique=False)
    op.create_unique_constraint('uq_evaluator_email_event', 'evaluators', ['email', 'event_id'])
    

def downgrade() -> None:
    # Downgrade logic is intentionally sparse to protect data, 
    # but in an emergency, it drops the foreign keys and columns.
    operational_tables = [
        'participants', 'teams', 'project_submissions', 'mentors', 
        'mentor_assignments', 'mentor_sessions', 'mentor_feedback', 
        'evaluators', 'evaluations', 'evaluator_team_assignments', 'communication_logs'
    ]
    
    for table in operational_tables:
        op.drop_index(op.f(f'ix_{table}_event_id'), table_name=table)
        op.drop_constraint(f"fk_{table}_event_id", table, type_='foreignkey')
        op.drop_column(table, 'event_id')

    op.drop_index(op.f('ix_events_organization_id'), table_name='events')
    op.drop_index(op.f('ix_events_id'), table_name='events')
    op.drop_table('events')