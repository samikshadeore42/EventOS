# File: backend/app/models/__init__.py

# Existing imports
from app.models import participant, evaluation, event_config, communication_log, mentor, admin, event_state
from app.models.participant import Participant, Team
from app.models.mentor import Mentor, MentorAssignment, MentorSession, MentorFeedback
from app.models.admin import Employee, Admin
from app.models.event_state import EventState
from app.models.assignment import EvaluatorTeamAssignment
from app.models.project_submission import ProjectSubmission
from app.models.event import Event

# Phase 1 Models
from app.models.organization import Organization
from app.models.user import User
from app.models.organization_membership import OrganizationMembership
from app.models.auth_tokens import AdminInvitation, UserSession, EmailVerificationToken, PasswordResetToken
from app.models.audit import AuditLog
from app.models.template import Template

# Combined __all__ list (Includes everything from both phases)
from app.models.stage_definition import StageDefinition
from app.models.stage_run import StageRun
from app.models.scheduled_action import ScheduledAction
from app.models.stage_transition import StageTransition
from app.models.notification import InAppNotification
from app.models.notification_outbox import NotificationOutbox
from app.models.risk import RiskSignal, TeamRiskSnapshot

__all__ = [
    # Phase 2 Models
    "Participant", "Team", "Mentor", "MentorAssignment", "MentorSession",
    "MentorFeedback", "EventState", "ProjectSubmission", "Event",

    # Phase 1 Models
    "Employee", "Admin", "Organization", "User", "OrganizationMembership",
    "AdminInvitation", "UserSession", "EmailVerificationToken",
    "PasswordResetToken", "AuditLog",
    "Template",
    "StageDefinition", "StageRun", "ScheduledAction", "StageTransition", "InAppNotification",
    "NotificationOutbox", "RiskSignal", "TeamRiskSnapshot"
]
