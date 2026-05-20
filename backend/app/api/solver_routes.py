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
    solver_config = {
        "num_teams":           config.num_teams,
        "target_size":         config.target_size,
        "k_min":               config.k_min,
        "k_max":               config.k_max,
        "max_per_institution": config.max_per_institution,
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
