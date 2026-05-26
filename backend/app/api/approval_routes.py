# File: backend/app/api/approval_routes.py
#
# These routes implement the human-in-the-loop approval gate.
#
# GET  /approvals/pending              → list teams waiting for review
# GET  /approvals/teams                → list all teams with status
# GET  /approvals/teams/{team_id}      → single team detail
# POST /approvals/{team_id}/decision   → approve or reject one team
# POST /approvals/bulk-decision        → approve or reject all pending teams

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.participant import Team
from app.services.approval_service import ApprovalService
from app.schemas.approval_schemas import (
    ApprovalRequest,
    ApprovalResponse,
    BulkApprovalRequest,
    BulkApprovalResponse,
    PendingApprovalsResponse,
    TeamApprovalStatus,
)

router = APIRouter(prefix="/approvals", tags=["Approvals"])


# ── GET /approvals/pending ────────────────────────────────────────────

@router.get(
    "/pending",
    response_model=PendingApprovalsResponse,
    summary="List all teams pending admin approval",
)
def get_pending_approvals(db: Session = Depends(get_db)):
    """
    Returns all teams that haven't been approved yet.
    The frontend dashboard polls this to populate the approval queue.
    """
    pending = ApprovalService.get_pending_teams(db)
    
    team_ids = [t.id for t in pending]
    
    counts = ApprovalService.get_member_counts_batch(team_ids, db)
    
    teams_out = [
        TeamApprovalStatus(
            team_id=t.id,
            team_name=t.team_name,
            is_approved=t.is_approved,
            member_count=counts.get(str(t.id), 0),
            rationale=t.rationale
        )
        for t in pending
    ]

    return PendingApprovalsResponse(
        total_pending=len(teams_out),
        teams=teams_out
    )


# ── GET /approvals/teams ──────────────────────────────────────────────

@router.get(
    "/teams",
    summary="List all teams with their approval status",
)
def get_all_teams(db: Session = Depends(get_db)):
    """
    Returns all teams — both approved and pending.
    Used by the full team management view on the dashboard.
    """
    teams = ApprovalService.get_all_teams(db)

    return {
        "total":  len(teams),
        "teams": [
            {
                "team_id":     str(t.id),
                "team_name":   t.team_name,
                "is_approved": t.is_approved,
                "rationale":   t.rationale,
                "created_at":  t.created_at.isoformat() if t.created_at else None,
                "member_count": len(ApprovalService.get_team_members(t.id, db))
            }
            for t in teams
        ]
    }


# ── GET /approvals/teams/{team_id} ────────────────────────────────────

@router.get(
    "/teams/{team_id}",
    summary="Get full detail of a single team including all members",
)
def get_team_detail(team_id: UUID, db: Session = Depends(get_db)):
    """
    Returns full team detail including all member profiles.
    Used when admin clicks into a team to review before approving.
    """
    team    = ApprovalService.get_team_by_id(team_id, db)
    members = ApprovalService.get_team_members(team_id, db)

    return {
        "team_id":     str(team.id),
        "team_name":   team.team_name,
        "is_approved": team.is_approved,
        "rationale":   team.rationale,
        "created_at":  team.created_at.isoformat() if team.created_at else None,
        "members": [
            {
                "id":           str(m.id),
                "name":         f"{m.first_name} {m.last_name}",
                "email":        m.email,
                "institution":  m.institution,
                "skill_vector": m.skill_vector,
            }
            for m in members
        ]
    }


# ── POST /approvals/{team_id}/decision ───────────────────────────────

@router.post(
    "/{team_id}/decision",
    response_model=ApprovalResponse,
    summary="Approve or reject a single draft team",
    description=(
        "Admin approves or rejects a team. "
        "On approval, team assignment emails are automatically queued via Celery. "
        "On rejection, the team is flagged for revision with optional notes."
    )
)
def process_approval(
    team_id: UUID,
    body:    ApprovalRequest,
    db:      Session = Depends(get_db)
):
    """
    The core human-in-the-loop approval endpoint.

    APPROVE → team.is_approved = True + emails enqueued
    REJECT  → team stays unapproved + rejection notes saved
    """
    # Reject without notes is allowed but warn in notes
    if body.decision.value == "reject" and not body.notes:
        body.notes = "No reason provided"

    result = ApprovalService.process_decision(
        team_id=team_id,
        decision=body.decision,
        notes=body.notes,
        db=db
    )

    team = result["team"]
    return ApprovalResponse(
        team_id=team.id,
        team_name=team.team_name,
        decision=result["decision"],
        is_approved=team.is_approved,
        message=result["message"],
        emails_queued=result["emails_queued"]
    )


# ── POST /approvals/bulk-decision ────────────────────────────────────

@router.post(
    "/bulk-decision",
    response_model=BulkApprovalResponse,
    summary="Approve or reject all pending teams in one action",
    description=(
        "Processes all pending (unapproved) teams at once. "
        "On bulk approve, a single Celery task sends all assignment emails. "
        "Useful for the 'Approve All' button on the admin dashboard."
    )
)
def bulk_approval(
    body: BulkApprovalRequest,
    db:   Session = Depends(get_db)
):
    """
    Approves or rejects all pending teams in one operation.
    Emails are batched into a single Celery task for efficiency.
    """
    result = ApprovalService.process_bulk_decision(
        decision=body.decision,
        notes=body.notes,
        db=db
    )

    return BulkApprovalResponse(**result)
