# File: backend/app/api/solver_routes.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- 1. Import the Bouncer
from app.models.participant import Participant
from app.schemas.solver_schemas import (
    SolverRunRequest,
    SolverRunResponse,
    DraftLineupsResponse,
    DraftTeamOut,
    TeamMemberOut,
    SolverEvaluation,
)
from app.schemas.participant import MOCK_ROSTER
from app.services.task_tracker import TaskTracker
from app.tasks.solver import run_team_formation

import json

# 2. Update Prefix to enforce event_id in the URL
router = APIRouter(prefix="/events/{event_id}/solver", tags=["Solver"])


# ── POST /solver/run ──────────────────────────────────────────────────

@router.post(
    "/run",
    response_model=SolverRunResponse,
    status_code=202,
    summary="Trigger team formation solver",
)
def run_solver(
    body:  SolverRunRequest,
    scope: ScopedEventService = Depends(get_event_scope) # <-- 3. Inject Scope
):
    config = body.config

    # ── Load roster securely ──────────────────────────────────────────
    if config.use_mock_data:
        roster = []
        for i, p in enumerate(MOCK_ROSTER * max(1, config.num_teams)):
            entry = dict(p)
            entry["id"]    = f"mock-{i}"
            entry["email"] = f"mock{i}@test.com"
            roster.append(entry)
        max_participants = config.k_max * config.num_teams
        roster = roster[:max_participants]
    else:
        # 4. CRITICAL: Only load participants for THIS event
        participants = scope.db.query(Participant).filter(Participant.event_id == scope.event_id).all()
        
        if not participants:
            raise HTTPException(
                status_code=422,
                detail="No participants found in this event. Import a roster first, or set use_mock_data=true."
            )
        roster = [
            {
                "id":           str(p.id),
                "first_name":   p.first_name,
                "last_name":    p.last_name,
                "email":        p.email,
                "institution":  p.institution,
                "skill_vector": p.skill_vector,
            }
            for p in participants
        ]

    # ── Validate config feasibility ───────────────────────────────────
    n            = len(roster)
    min_needed   = config.k_min * config.num_teams
    max_capacity = config.k_max * config.num_teams

    if n < min_needed:
        raise HTTPException(
            status_code=422,
            detail=f"Not enough participants ({n}) for {config.num_teams} teams with minimum size {config.k_min}. Need at least {min_needed}."
        )
    if n > max_capacity:
        raise HTTPException(
            status_code=422,
            detail=f"Too many participants ({n}) for {config.num_teams} teams with maximum size {config.k_max}. Max capacity is {max_capacity}."
        )

    # ── Enqueue Celery task ───────────────────────────────────────────
    from app.models.event_state import EventState
    from app.models.participant import Team
    from app.services.approval_service import ApprovalService

    # 5. Securely scope EventState to this event
    # (Assuming event_state table has been updated to have event_id, otherwise we rely strictly on Teams)
    event_state = scope.db.query(EventState).filter(getattr(EventState, "event_id", scope.event_id) == scope.event_id).first()
    if not event_state:
        event_state = EventState()
        if hasattr(event_state, 'event_id'):
            event_state.event_id = scope.event_id
        scope.db.add(event_state)
        scope.db.commit()
        scope.db.refresh(event_state)

    excluded = list(event_state.rejected_teams) if event_state.rejected_teams else []

    # 6. Securely fetch currently rejected teams for THIS event
    currently_rejected = scope.db.query(Team).filter(
        Team.event_id == scope.event_id, 
        Team.approval_status == "rejected"
    ).all()
    
    for t in currently_rejected:
        members = ApprovalService.get_team_members(scope.event_id, t.id, scope.db)
        member_ids = sorted([str(m.id) for m in members])
        if member_ids not in excluded:
            excluded.append(member_ids)

    solver_config = {
        "num_teams":           config.num_teams,
        "target_size":         config.target_size,
        "k_min":               config.k_min,
        "k_max":               config.k_max,
        "max_per_institution": config.max_per_institution,
        "excluded_combinations": excluded
    }

    task = run_team_formation.delay(roster, solver_config)

    return SolverRunResponse(
        task_id=task.id,
        status_url=f"/events/{scope.event_id}/solver/status/{task.id}",
        message=f"Solver enqueued for {n} participants → {config.num_teams} teams. Poll status_url for live progress."
    )


# ── GET /solver/drafts/{task_id} ──────────────────────────────────────

@router.get(
    "/drafts/{task_id}",
    response_model=DraftLineupsResponse,
    summary="Fetch draft team lineups from a completed solver run",
)
def get_draft_lineups(
    task_id: str,
    scope:   ScopedEventService = Depends(get_event_scope)
):
    status = TaskTracker.get_status(task_id)

    if not status:
        raise HTTPException(status_code=404, detail=f"No task found with id '{task_id}'. It may have expired.")

    if status["status"] == "running" or status["status"] == "pending":
        raise HTTPException(
            status_code=425,
            detail=f"Solver is still running. Poll status and retry when status is 'success'."
        )

    if status["status"] == "failed":
        raise HTTPException(status_code=500, detail=f"Solver task failed: {status.get('error', 'Unknown error')}")

    result = status.get("result")
    if not result:
        raise HTTPException(status_code=500, detail="Solver completed but result data is missing.")

    raw_teams = result.get("teams", [])
    evaluation = result.get("evaluation", {})

    teams_out = [
        DraftTeamOut(
            team_id=t["team_id"],
            team_name=t["team_name"],
            size=t["size"],
            average_skill_vector=t.get("average_skill_vector", []),
            members=[
                TeamMemberOut(
                    id=m["id"],
                    name=m["name"],
                    institution=m["institution"],
                    skill_vector=m["skill_vector"]
                )
                for m in t.get("members", [])
            ]
        )
        for t in raw_teams
    ]

    return DraftLineupsResponse(
        task_id=task_id,
        teams=teams_out,
        evaluation=SolverEvaluation(**evaluation),
        total_participants=sum(t.size for t in teams_out)
    )


# ── GET /solver/status/{task_id} ──────────────────────────────────────

@router.get(
    "/status/{task_id}",
    summary="Convenience proxy to task status",
)
def get_solver_status(
    task_id: str,
    scope:   ScopedEventService = Depends(get_event_scope)
):
    status = TaskTracker.get_status_with_logs(task_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return status


@router.post("/commit/{task_id}", summary="Persist solver draft lineups into the teams table")
def commit_solver_results(
    task_id: str, 
    scope:   ScopedEventService = Depends(get_event_scope)
):
    from app.models.participant import Team, Participant
    from app.models.event_state import EventState
    from app.services.approval_service import ApprovalService

    status = TaskTracker.get_status(task_id)
    if not status or status["status"] != "success":
        raise HTTPException(status_code=425, detail="Solver task not complete. Check status first.")

    event_state = scope.db.query(EventState).filter(getattr(EventState, "event_id", scope.event_id) == scope.event_id).first()
    if not event_state:
        event_state = EventState()
        if hasattr(event_state, 'event_id'):
            event_state.event_id = scope.event_id
        scope.db.add(event_state)

    # 7. Securely scope current teams and reset their status
    current_teams = scope.db.query(Team).filter(
        Team.event_id == scope.event_id,
        Team.approval_status.in_(["pending", "approved", "rejected"])
    ).all()
    
    new_rejected = list(event_state.rejected_teams) if getattr(event_state, 'rejected_teams', None) else []
    for t in current_teams:
        if t.approval_status == "rejected":
            members = ApprovalService.get_team_members(scope.event_id, t.id, scope.db)
            member_ids = sorted([str(m.id) for m in members])
            if member_ids not in new_rejected:
                new_rejected.append(member_ids)
        t.approval_status = "superseded"
        t.is_approved = False
    
    event_state.rejected_teams = new_rejected

    teams_data = status["result"]["teams"]
    created_teams = []
    for t in teams_data:
        fallback_rationale = "This team combines strengths in Python, frontend, AI/ML, and design while respecting team size and institution constraints."
        rationale = t.get("rationale", fallback_rationale) or fallback_rationale

        # 8. Create new Team securely bound to the event
        team = Team(
            event_id=scope.event_id, 
            team_name=t["team_name"],
            rationale=rationale,
            is_approved=False,
            approval_status="pending"
        )
        scope.db.add(team)
        scope.db.flush()   # get the team.id before committing
        
        for member in t["members"]:
            # 9. Securely update Participant ensuring they belong to this event
            participant = scope.db.query(Participant).filter(
                Participant.id == member["id"],
                Participant.event_id == scope.event_id
            ).first()
            if participant:
                participant.team_id = team.id
                
        created_teams.append({"team_id": str(team.id), "team_name": team.team_name})
        
    scope.db.commit()
    return {
        "message": f"{len(created_teams)} teams committed to DB for this event. Check /approvals/pending.",
        "teams":   created_teams
    }