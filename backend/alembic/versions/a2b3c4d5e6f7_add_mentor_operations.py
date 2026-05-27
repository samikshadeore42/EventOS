"""add mentor operations tables

Revision ID: a2b3c4d5e6f7
Revises: 11b1408b448d
Create Date: 2026-05-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a2b3c4d5e6f7'
down_revision = '11b1408b448d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- Mentors table --
    op.create_table(
        'mentors',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('first_name', sa.String(50), nullable=False),
        sa.Column('last_name', sa.String(50), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('organization', sa.String(100), nullable=True),
        sa.Column('expertise_areas', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('access_link_sent', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_mentors_email', 'mentors', ['email'], unique=True)
    op.create_index('ix_mentors_is_active', 'mentors', ['is_active'])

    # -- Mentor assignments table --
    op.create_table(
        'mentor_assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('mentor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('mentors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
        sa.Column('stage', sa.String(50), server_default='mentoring'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_mentor_assignments_team_id', 'mentor_assignments', ['team_id'])
    op.create_index('ix_mentor_assignments_mentor_id', 'mentor_assignments', ['mentor_id'])
    op.create_index('ix_mentor_assignments_active', 'mentor_assignments', ['team_id', 'is_active'])

    # -- Mentor sessions table --
    op.create_table(
        'mentor_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('mentor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('mentors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('meeting_url', sa.String(500), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), server_default='30'),
        sa.Column('agenda', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), server_default='scheduled'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_mentor_sessions_team_id', 'mentor_sessions', ['team_id'])
    op.create_index('ix_mentor_sessions_scheduled_at', 'mentor_sessions', ['scheduled_at'])
    op.create_index('ix_mentor_sessions_mentor_id', 'mentor_sessions', ['mentor_id'])

    # -- Mentor feedback table --
    op.create_table(
        'mentor_feedback',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('mentor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('mentors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
        sa.Column('participant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('participants.id', ondelete='SET NULL'), nullable=True),
        sa.Column('feedback_type', sa.String(30), nullable=False, server_default='daily_update'),
        sa.Column('progress_score', sa.Float(), nullable=True),
        sa.Column('collaboration_score', sa.Float(), nullable=True),
        sa.Column('execution_score', sa.Float(), nullable=True),
        sa.Column('clarity_score', sa.Float(), nullable=True),
        sa.Column('blockers', sa.Text(), nullable=True),
        sa.Column('feedback_text', sa.Text(), nullable=False),
        sa.Column('action_items', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('visible_to_participant', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_mentor_feedback_team_id', 'mentor_feedback', ['team_id'])
    op.create_index('ix_mentor_feedback_participant_id', 'mentor_feedback', ['participant_id'])
    op.create_index('ix_mentor_feedback_created_at', 'mentor_feedback', ['created_at'])
    op.create_index('ix_mentor_feedback_visible', 'mentor_feedback', ['team_id', 'visible_to_participant'])


def downgrade() -> None:
    op.drop_table('mentor_feedback')
    op.drop_table('mentor_sessions')
    op.drop_table('mentor_assignments')
    op.drop_table('mentors')
