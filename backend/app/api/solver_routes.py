# File: backend/app/api/solver_routes.py
#
# CONCEPT: These routes are the HTTP interface to your Celery solver.
#
# POST /solver/run      → enqueue a solver task, return task_id immediately
# GET  /solver/drafts/{task_id}  → fetch completed teams from a solver run
# GET  /solver/status/{task_id}  → proxy to the task tracker (convenience)
#
# The flow is always:
#   1. Client calls POST /solver/run          → gets task_id back
#   2. Client polls GET /tasks/{task_id}/status  → waits for "success"
#   3. Client calls GET /solver/drafts/{task_id} → gets the actual teams

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis_client import get_redis
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

router = APIRouter(prefix="/solver", tags=["Solver"])


# ── POST /solver/run ──────────────────────────────────────────────────

@router.post(
    "/run",
    response_model=SolverRunResponse,
    status_code=202,    # 202 Accepted = "I got your request, working on it"
    summary="Trigger team formation solver",
    description=(
        "Enqueues a Celery solver task and returns a task_id immediately. "
        "Poll GET /tasks/{task_id}/status to track progress. "
        "Fetch results with GET /solver/drafts/{task_id} once status is 'success'."
    )
)
def run_solver(
    body: SolverRunRequest,
    db:   Session = Depends(get_db)
):
    """
    Triggers the CSP team formation solver.

    If `use_mock_data=True` is set in config, uses the MOCK_ROSTER
    from schemas — useful while the FS CRUD endpoints are not yet ready.
    Otherwise, loads all participants from the database.
    """
    config = body.config

    # ── Load roster ───────────────────────────────────────────────────
    if config.use_mock_data:
        # Fallback to mock data — does not require FS CRUD to be done
        roster = []
        for i, p in enumerate(MOCK_ROSTER * max(1, config.num_teams)):
            entry = dict(p)
            entry["id"]    = f"mock-{i}"
            entry["email"] = f"mock{i}@test.com"
            roster.append(entry)
        # Trim to a sensible size
        max_participants = config.k_max * config.num_teams
        roster = roster[:max_participants]
    else:
        # Load from database
        participants = db.query(Participant).all()
        if not participants:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No participants found in the database. "
                    "Either import a roster first, or set use_mock_data=true "
                    "in the request body to use mock data."
                )
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

    # ── Validate config feasibility before enqueueing ─────────────────
    n            = len(roster)
    min_needed   = config.k_min * config.num_teams
    max_capacity = config.k_max * config.num_teams

    if n < min_needed:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Not enough participants ({n}) for {config.num_teams} teams "
                f"with minimum size {config.k_min}. Need at least {min_needed}."
            )
        )
    if n > max_capacity:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Too many participants ({n}) for {config.num_teams} teams "
                f"with maximum size {config.k_max}. Max capacity is {max_capacity}."
            )
        )

    # ── Enqueue Celery task ───────────────────────────────────────────
    from app.models.event_state import EventState
    from app.models.participant import Team
    from app.services.approval_service import ApprovalService

    event_state = db.query(EventState).first()
    if not event_state:
        event_state = EventState()
        db.add(event_state)
        db.commit()
        db.refresh(event_state)

    excluded = list(event_state.rejected_teams) if event_state.rejected_teams else []

    currently_rejected = db.query(Team).filter(Team.approval_status == "rejected").all()
    for t in currently_rejected:
        members = ApprovalService.get_team_members(t.id, db)
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
        status_url=f"/tasks/{task.id}/status",
        message=(
            f"Solver enqueued for {n} participants → {config.num_teams} teams. "
            f"Poll status_url for live progress."
        )
    )


# ── GET /solver/drafts/{task_id} ──────────────────────────────────────

@router.get(
    "/drafts/{task_id}",
    response_model=DraftLineupsResponse,
    summary="Fetch draft team lineups from a completed solver run",
    description=(
        "Returns the draft teams produced by a solver run. "
        "Only available after the task status is 'success'. "
        "Returns 404 if task is not found and 425 if task is still running."
    )
)
def get_draft_lineups(task_id: str):
    """
    Fetches the result of a completed solver task from Redis.
    The result was stored by the Celery task on completion.
    """
    status = TaskTracker.get_status(task_id)

    # ── Guard clauses — check task state before returning data ────────
    if not status:
        raise HTTPException(
            status_code=404,
            detail=f"No task found with id '{task_id}'. It may have expired."
        )

    if status["status"] == "running" or status["status"] == "pending":
        raise HTTPException(
            status_code=425,    # 425 Too Early
            detail=(
                f"Solver is still running (progress: {status['progress']}/{status['total_steps']}). "
                f"Poll /tasks/{task_id}/status and retry when status is 'success'."
            )
        )

    if status["status"] == "failed":
        raise HTTPException(
            status_code=500,
            detail=f"Solver task failed: {status.get('error', 'Unknown error')}"
        )

    result = status.get("result")
    if not result:
        raise HTTPException(
            status_code=500,
            detail="Solver completed but result data is missing. This is unexpected."
        )

    # ── Parse and return ──────────────────────────────────────────────
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
    description="Same as GET /tasks/{task_id}/status but namespaced under /solver."
)
def get_solver_status(task_id: str):
    """Proxy to the task tracker — keeps solver-related polling under /solver."""
    status = TaskTracker.get_status_with_logs(task_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return status


@router.post("/commit/{task_id}",
    summary="Persist solver draft lineups into the teams table (triggers approval queue)")
def commit_solver_results(task_id: str, db: Session = Depends(get_db)):
    """
    Takes a completed solver run and writes the draft teams to the DB.
    After this, they appear in GET /approvals/pending for committee review.
    """
    from app.models.participant import Team, Participant
    from app.models.event_state import EventState
    from app.services.approval_service import ApprovalService

    status = TaskTracker.get_status(task_id)
    if not status or status["status"] != "success":
        raise HTTPException(status_code=425,
            detail="Solver task not complete. Check status first.")

    event_state = db.query(EventState).first()
    if not event_state:
        event_state = EventState()
        db.add(event_state)

    current_teams = db.query(Team).filter(Team.approval_status.in_(["pending", "approved", "rejected"])).all()
    
    new_rejected = list(event_state.rejected_teams) if event_state.rejected_teams else []
    for t in current_teams:
        if t.approval_status == "rejected":
            members = ApprovalService.get_team_members(t.id, db)
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
        rationale = t.get("rationale", fallback_rationale)
        if not rationale:
            rationale = fallback_rationale

        team = Team(
            team_name=t["team_name"],
            rationale=rationale,
            is_approved=False,
            approval_status="pending"
        )
        db.add(team)
        db.flush()   # get the team.id before committing
        for member in t["members"]:
            participant = db.query(Participant).filter(
                Participant.id == member["id"]
            ).first()
            if participant:
                participant.team_id = team.id
        created_teams.append({"team_id": str(team.id), "team_name": team.team_name})
    db.commit()
    return {
        "message": f"{len(created_teams)} teams committed to DB. Check /approvals/pending.",
        "teams":   created_teams
    }