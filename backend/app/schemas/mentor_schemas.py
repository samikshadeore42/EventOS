# File: backend/app/schemas/mentor_schemas.py
# Pydantic v2 schemas for the mentor operations layer.

from __future__ import annotations
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime


# ── Mentor ─────────────────────────────────────────────────────────────────

class MentorCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    email: str = Field(..., min_length=3, max_length=255)
    organization: Optional[str] = None
    expertise_areas: List[str] = Field(default_factory=list)


class MentorUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    organization: Optional[str] = None
    expertise_areas: Optional[List[str]] = None
    is_active: Optional[bool] = None


class MentorOut(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: str
    organization: Optional[str] = None
    expertise_areas: List[str] = []
    is_active: bool = True
    access_link_sent: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    assigned_team_count: int = 0

    model_config = {"from_attributes": True}


# ── Assignment ─────────────────────────────────────────────────────────────

class MentorAssignmentCreate(BaseModel):
    mentor_id: UUID
    team_id: UUID
    stage: str = "mentoring"


class MentorAssignmentOut(BaseModel):
    id: UUID
    mentor_id: UUID
    team_id: UUID
    stage: str
    is_active: bool
    assigned_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    mentor_name: Optional[str] = None
    team_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Session ────────────────────────────────────────────────────────────────

class MentorSessionCreate(BaseModel):
    team_id: UUID
    title: str = Field(..., min_length=1, max_length=200)
    meeting_url: str = Field(..., min_length=1, max_length=500)
    scheduled_at: datetime
    duration_minutes: int = Field(default=30, ge=5, le=480)
    agenda: Optional[str] = None


class MentorSessionUpdate(BaseModel):
    title: Optional[str] = None
    meeting_url: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=480)
    agenda: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in ("scheduled", "completed", "cancelled", "missed"):
            raise ValueError("status must be scheduled, completed, cancelled, or missed")
        return v


class MentorSessionOut(BaseModel):
    id: UUID
    mentor_id: UUID
    team_id: UUID
    title: str
    meeting_url: str
    scheduled_at: datetime
    duration_minutes: int = 30
    agenda: Optional[str] = None
    status: str = "scheduled"
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    team_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Feedback ───────────────────────────────────────────────────────────────

class MentorFeedbackCreate(BaseModel):
    team_id: UUID
    participant_id: Optional[UUID] = None
    feedback_type: str = "daily_update"
    progress_score: Optional[float] = Field(default=None, ge=0, le=10)
    collaboration_score: Optional[float] = Field(default=None, ge=0, le=10)
    execution_score: Optional[float] = Field(default=None, ge=0, le=10)
    clarity_score: Optional[float] = Field(default=None, ge=0, le=10)
    blockers: Optional[str] = None
    feedback_text: str = Field(..., min_length=1)
    action_items: List[str] = Field(default_factory=list)
    visible_to_participant: bool = False


class MentorFeedbackOut(BaseModel):
    id: UUID
    mentor_id: UUID
    team_id: UUID
    participant_id: Optional[UUID] = None
    feedback_type: str
    progress_score: Optional[float] = None
    collaboration_score: Optional[float] = None
    execution_score: Optional[float] = None
    clarity_score: Optional[float] = None
    blockers: Optional[str] = None
    feedback_text: str
    action_items: List[str] = []
    visible_to_participant: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    mentor_name: Optional[str] = None
    team_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Portal schemas ─────────────────────────────────────────────────────────

class MentorTeamMemberOut(BaseModel):
    id: UUID
    name: str
    institution: str
    skills: dict = {}


class MentorTeamOut(BaseModel):
    team_id: UUID
    team_name: str
    member_count: int = 0
    members: List[MentorTeamMemberOut] = []
    next_meeting: Optional[MentorSessionOut] = None
    latest_progress_score: Optional[float] = None
    risk_level: Optional[str] = None
    feedback_count: int = 0


class MentorPortalMe(BaseModel):
    mentor_id: str
    name: str
    email: str
    organization: Optional[str] = None
    expertise_areas: List[str] = []
    stage: str = "mentoring"
    assigned_teams_count: int = 0
    pending_updates_count: int = 0
    meetings_scheduled: int = 0
    updates_today: int = 0


# ── Participant-safe mentor info ───────────────────────────────────────────

class ParticipantMentorInfo(BaseModel):
    mentor_name: Optional[str] = None
    organization: Optional[str] = None
    expertise_areas: List[str] = []
    email: Optional[str] = None
    next_meeting: Optional[MentorSessionOut] = None
    visible_feedback: List[MentorFeedbackOut] = []
    action_items: List[str] = []


# ── Admin ops schemas ──────────────────────────────────────────────────────

class MentorOpsSummary(BaseModel):
    total_mentors: int = 0
    active_mentors: int = 0
    total_assignments: int = 0
    teams_without_mentor: int = 0
    teams_without_meeting: int = 0
    teams_missing_daily_update: int = 0
    low_progress_teams: int = 0


class TeamRiskOut(BaseModel):
    team_id: UUID
    team_name: str
    mentor_name: Optional[str] = None
    risk_score: int = 0
    risk_level: str = "low"
    reasons: List[str] = []
    latest_progress_score: Optional[float] = None
    latest_feedback_at: Optional[datetime] = None


class MentorSuggestionCandidate(BaseModel):
    mentor_id: UUID
    mentor_name: str
    expertise: List[str] = []
    current_load: int = 0
    match_score: float = 0.0


class MentorSuggestionOut(BaseModel):
    team_id: UUID
    team_name: str
    weak_skills: List[str] = []
    suggested_mentors: List[MentorSuggestionCandidate] = []
    reason: str = ""


class AISummaryRequest(BaseModel):
    team_id: UUID


class AISummaryResult(BaseModel):
    team_id: UUID
    team_name: str
    summary: str
    recommended_focus: str = ""
    committee_note: str = ""
    tone: str = "stable"


class DailyReminderResult(BaseModel):
    queued: int = 0
    sent: int = 0
    simulated: int = 0
    failed: int = 0
    affected_teams: List[str] = []
    message: str = ""
