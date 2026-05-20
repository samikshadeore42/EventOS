# File: backend/app/schemas/approval_schemas.py

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from enum import Enum


class ApprovalDecision(str, Enum):
    """
    Using an Enum means FastAPI validates the value automatically.
    Sending "maybe" as a decision returns a 422 Unprocessable Entity.
    """
    APPROVE = "approve"
    REJECT  = "reject"


class ApprovalRequest(BaseModel):
    """
    Request body for POST /approvals/{team_id}/decision
    Admin sends this when clicking Approve or Reject on the dashboard.
    """
    decision:  ApprovalDecision
    notes:     Optional[str] = Field(
        default=None,
        description="Optional admin notes — required when rejecting"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"decision": "approve", "notes": "Looks good"},
                {"decision": "reject",  "notes": "Two members from same institution"}
            ]
        }
    }


class TeamApprovalStatus(BaseModel):
    """Status of a single team's approval state."""
    team_id:      UUID
    team_name:    str
    is_approved:  bool
    member_count: int
    rationale:    Optional[str] = None


class ApprovalResponse(BaseModel):
    """Returned after processing an approval decision."""
    team_id:     UUID
    team_name:   str
    decision:    ApprovalDecision
    is_approved: bool
    message:     str
    emails_queued: bool = False   # True if team assignment emails were enqueued


class BulkApprovalRequest(BaseModel):
    """Approve or reject all draft teams in one call."""
    decision: ApprovalDecision
    notes:    Optional[str] = None


class BulkApprovalResponse(BaseModel):
    """Summary after bulk approval/rejection."""
    total_teams:   int
    approved:      int
    rejected:      int
    emails_queued: bool
    message:       str


class PendingApprovalsResponse(BaseModel):
    """List of teams waiting for admin decision."""
    total_pending: int
    teams:         List[TeamApprovalStatus]
