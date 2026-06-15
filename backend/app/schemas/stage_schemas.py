# backend/app/schemas/stage_schemas.py
"""
Pydantic V2 schemas for Phase-4 creator-defined stage scheduling.

Moved out of the route module to match the project convention (schemas live in
app/schemas/). Request schemas validate the cheap, per-field rules up front
(valid IANA timezone, end > start) so the API returns a clean 422 before the
service/DB layer is touched. Cross-stage rules (overlaps, ordering) cannot be
checked here — they live in StageService.validate_schedule().
"""
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ── helpers ──────────────────────────────────────────────────────────────────

def _validate_iana_tz(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise ValueError(f"'{value}' is not a valid IANA timezone (e.g. 'Asia/Kolkata').")
    return value


def _as_utc_aware(dt: datetime) -> datetime:
    """Treat naive datetimes as UTC so storage/compare is always tz-aware."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ── requests ─────────────────────────────────────────────────────────────────

class StageDefinitionCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = None
    position: int = Field(..., gt=0)
    start_at: datetime
    end_at: datetime
    timezone: str = "Asia/Kolkata"
    transition_policy: str = Field("manual", pattern="^(manual|automatic)$")
    reminder_policy: dict = Field(default_factory=dict)
    required_capabilities: list = Field(default_factory=list)
    is_active: bool = True

    _tz = field_validator("timezone")(_validate_iana_tz)

    @field_validator("start_at", "end_at")
    @classmethod
    def _coerce_aware(cls, v: datetime) -> datetime:
        return _as_utc_aware(v)

    @model_validator(mode="after")
    def _check_time_order(self) -> "StageDefinitionCreate":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be strictly after start_at.")
        return self


class StageDefinitionUpdate(BaseModel):
    """All fields optional — partial update. Widened vs. the original (which could
    only touch name/description/times/is_active) so creators can also fix
    position, key, timezone and policies after creation."""
    key: Optional[str] = Field(None, min_length=1, max_length=100)
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    description: Optional[str] = None
    position: Optional[int] = Field(None, gt=0)
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    timezone: Optional[str] = None
    transition_policy: Optional[str] = Field(None, pattern="^(manual|automatic)$")
    reminder_policy: Optional[dict] = None
    required_capabilities: Optional[list] = None
    is_active: Optional[bool] = None

    @field_validator("timezone")
    @classmethod
    def _tz_optional(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iana_tz(v) if v is not None else v

    @field_validator("start_at", "end_at")
    @classmethod
    def _coerce_aware(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _as_utc_aware(v) if v is not None else v

    @model_validator(mode="after")
    def _check_time_order(self) -> "StageDefinitionUpdate":
        # Only enforce when BOTH bounds are supplied in the same request. If only
        # one is changed, the service re-validates against the stored counterpart.
        if self.start_at is not None and self.end_at is not None:
            if self.end_at <= self.start_at:
                raise ValueError("end_at must be strictly after start_at.")
        return self


class StageReorderRequest(BaseModel):
    """A full permutation of the event's stage-definition IDs, in the new order.
    Position 1 is assigned to ordered_ids[0], and so on."""
    ordered_ids: List[uuid.UUID] = Field(..., min_length=1)


# ── responses ────────────────────────────────────────────────────────────────

class StageDefinitionResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    key: str
    name: str
    description: Optional[str]
    position: int
    start_at: datetime
    end_at: datetime
    timezone: str
    transition_policy: str
    reminder_policy: dict
    required_capabilities: list
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class StageRunResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    stage_definition_id: uuid.UUID
    status: str
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ScheduleViolation(BaseModel):
    code: str            # machine-readable, e.g. "stage_overlap", "invalid_timezone"
    message: str         # human-readable
    stage_id: Optional[uuid.UUID] = None
    field: Optional[str] = None


class ScheduleValidationReport(BaseModel):
    is_valid: bool
    stage_count: int
    violations: List[ScheduleViolation] = Field(default_factory=list)


class PublishResponse(BaseModel):
    event_id: uuid.UUID
    status: str
    runs_created: int
    actions_scheduled: int
    message: str