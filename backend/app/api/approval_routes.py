# File: backend/app/api/approval_routes.py

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- 1. Import the Bouncer
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

# 2. Update Prefix to enforce event_id in the URL
router = APIRouter(prefix="/events/{event_id}/approvals", tags=["Approvals"])


# ── GET /approvals/pending ────────────────────────────────────────────

@router.get(
    "/pending",
    response_model=PendingApprovalsResponse,
    summary="List all teams pending admin approval",
)
def get_pending_approvals(scope: ScopedEventService = Depends(get_event_scope)):
    # 3. Inject event_id into the service layer
    pending = ApprovalService.get_pending_teams(scope.event_id, scope.db)
    
    team_ids = [t.id for t in pending]
    counts = ApprovalService.get_member_counts_batch(scope.event_id, team_ids, scope.db)
    
    teams_out = [
        TeamApprovalStatus(
            team_id=t.id,
            team_name=t.team_name,
            is_approved=t.is_approved,
            approval_status=t.approval_status,
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
def get_all_teams(scope: ScopedEventService = Depends(get_event_scope)):
    teams = ApprovalService.get_all_teams(scope.event_id, scope.db)

    return {
        "total":  len(teams),
        "teams": [
            {
                "team_id":     str(t.id),
                "team_name":   t.team_name,
                "is_approved": t.is_approved,
                "approval_status": t.approval_status,
                "rationale":   t.rationale,
                "created_at":  t.created_at.isoformat() if t.created_at else None,
                "member_count": len(ApprovalService.get_team_members(scope.event_id, t.id, scope.db))
            }
            for t in teams
        ]
    }


# ── GET /approvals/teams/{team_id} ────────────────────────────────────

@router.get(
    "/teams/{team_id}",
    summary="Get full detail of a single team including all members",
)
def get_team_detail(team_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    team    = ApprovalService.get_team_by_id(scope.event_id, team_id, scope.db)
    members = ApprovalService.get_team_members(scope.event_id, team_id, scope.db)

    return {
        "team_id":     str(team.id),
        "team_name":   team.team_name,
        "is_approved": team.is_approved,
        "approval_status": team.approval_status,
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
)
def process_approval(
    team_id: UUID,
    body:    ApprovalRequest,
    scope:   ScopedEventService = Depends(get_event_scope)
):
    if body.decision.value == "reject" and not body.notes:
        body.notes = "No reason provided"

    result = ApprovalService.process_decision(
        event_id=scope.event_id,
        team_id=team_id,
        decision=body.decision,
        notes=body.notes,
        db=scope.db
    )

    team = result["team"]
    return ApprovalResponse(
        team_id=team.id,
        team_name=team.team_name,
        decision=result["decision"],
        is_approved=team.is_approved,
        approval_status=team.approval_status,
        message=result["message"],
        emails_queued=result["emails_queued"]
    )


# ── POST /approvals/bulk-decision ────────────────────────────────────

@router.post(
    "/bulk-decision",
    response_model=BulkApprovalResponse,
    summary="Approve or reject all pending teams in one action",
)
def bulk_approval(
    body:  BulkApprovalRequest,
    scope: ScopedEventService = Depends(get_event_scope)
):
    result = ApprovalService.process_bulk_decision(
        event_id=scope.event_id,
        decision=body.decision,
        notes=body.notes,
        db=scope.db
    )

    return BulkApprovalResponse(**result)


# ── POST /approvals/publish ──────────────────────────────────────────

@router.post(
    "/publish",
    summary="Publish the fully approved team formation",
)
def publish_formation(scope: ScopedEventService = Depends(get_event_scope)):
    result = ApprovalService.publish_formation(scope.event_id, scope.db)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result