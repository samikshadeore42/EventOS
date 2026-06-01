# File: backend/app/schemas/participant_crud_schemas.py
#
# Separate from the Day 1 participant.py schemas because these cover
# the full CRUD surface — listing, filtering, pagination, CSV upload
# results — which are different concerns from the solver input shapes.

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Dict, Optional, List, Any
from uuid import UUID
from datetime import datetime
from enum import Enum


# ── Filtering + pagination ────────────────────────────────────────────

class ParticipantSortField(str, Enum):
    CREATED_AT   = "created_at"
    FIRST_NAME   = "first_name"
    LAST_NAME    = "last_name"
    INSTITUTION  = "institution"
    EMAIL        = "email"


class ParticipantFilter(BaseModel):
    """Query parameters for listing participants."""
    institution:   Optional[str]  = None
    team_assigned: Optional[bool] = None    # True = has team, False = unassigned
    search:        Optional[str]  = None    # searches name + email
    page:          int            = Field(default=1,   ge=1)
    page_size:     int            = Field(default=20,  ge=1, le=100)
    sort_by:       ParticipantSortField = ParticipantSortField.CREATED_AT
    sort_desc:     bool           = True


# ── Core CRUD shapes ──────────────────────────────────────────────────

class ParticipantCreateRequest(BaseModel):
    """Body for POST /participants — register a single participant."""
    first_name:   str        = Field(..., min_length=1, max_length=50)
    last_name:    str        = Field(..., min_length=1, max_length=50)
    email:        EmailStr
    institution:  str        = Field(..., min_length=2, max_length=100)
    skill_vector: Dict[str, float] = Field(
        default_factory=dict,
        description="Skill name → score 0.0–10.0"
    )

    @field_validator("skill_vector")
    @classmethod
    def validate_scores(cls, v: Dict[str, float]) -> Dict[str, float]:
        for skill, score in v.items():
            if not (0.0 <= score <= 10.0):
                raise ValueError(
                    f"Score for '{skill}' is {score}. Must be 0.0–10.0."
                )
        return v


class ParticipantUpdateRequest(BaseModel):
    """Body for PATCH /participants/{id} — partial update."""
    first_name:   Optional[str]              = None
    last_name:    Optional[str]              = None
    institution:  Optional[str]              = None
    skill_vector: Optional[Dict[str, float]] = None

    @field_validator("skill_vector")
    @classmethod
    def validate_scores(cls, v: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        if v is None:
            return v
        for skill, score in v.items():
            if not (0.0 <= score <= 10.0):
                raise ValueError(f"Score for '{skill}' must be 0.0–10.0.")
        return v


class ParticipantResponse(BaseModel):
    """Single participant returned by any read endpoint."""
    id:                  UUID
    first_name:          str
    last_name:           str
    email:               str
    institution:         str
    skill_vector:        Dict[str, float]
    team_id:             Optional[UUID]   = None
    team_name:           Optional[str]    = None
    email_verified:      bool
    welcome_email_sent:  bool
    progression_confirmed: Optional[bool] = None
    created_at:          datetime

    model_config = {"from_attributes": True}


class PaginatedParticipants(BaseModel):
    """Paginated list response."""
    total:        int
    page:         int
    page_size:    int
    total_pages:  int
    participants: List[ParticipantResponse]


# ── CSV upload shapes ─────────────────────────────────────────────────

class CSVRowResult(BaseModel):
    """Result for a single CSV row during upload."""
    row:          int               # 1-based row number in the file
    email:        str
    status:       str               # "created" | "updated" | "skipped" | "error"
    error:        Optional[str] = None


class CSVUploadResponse(BaseModel):
    """
    Full result of a CSV roster upload.
    Returns per-row results so the admin can see exactly what happened.
    """
    total_rows:    int
    created:       int
    updated:       int
    skipped:       int
    errors:        int
    rows:          List[CSVRowResult]
    message:       str
    sample_skills: List[str]    # skill columns detected in this CSV


# ── Roster summary ────────────────────────────────────────────────────

class SkillSummary(BaseModel):
    skill:   str
    average: float
    min:     float
    max:     float


class RosterSummary(BaseModel):
    """
    Aggregated stats for the admin dashboard.
    Returned by GET /participants/roster/summary.
    """
    total_participants:   int
    assigned_to_team:     int
    unassigned:           int
    institutions:         List[str]
    institution_counts:   Dict[str, int]
    skill_summary:        List[SkillSummary]
    csv_template_url:     str


class ProgressionConfirmRequest(BaseModel):
    confirmed: bool