# File: backend/app/schemas/solver_schemas.py
#
# These are the "contracts" — what the API accepts as input
# and what it guarantees to return as output.
# The frontend and FS teammate code against these shapes.

from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from uuid import UUID
from datetime import datetime


# ── Request shapes (what comes IN to the API) ─────────────────────────

class SolverConfig(BaseModel):
    """
    Configuration passed when triggering a solver run.
    All fields have sensible defaults for WiSE@TI hackathon scale.
    """
    num_teams:            int   = Field(default=5,  ge=1,  description="Number of teams to form")
    target_size:          int   = Field(default=4,  ge=2,  description="Ideal members per team")
    k_min:                int   = Field(default=3,  ge=1,  description="Minimum team size")
    k_max:                int   = Field(default=5,  ge=2,  description="Maximum team size")
    max_per_institution:  int   = Field(default=1,  ge=1,  description="Max members from same institution per team")
    use_mock_data:        bool  = Field(default=False,     description="Use mock roster if DB has no participants")

    model_config = {
        "json_schema_extra": {
            "example": {
                "num_teams": 5,
                "target_size": 4,
                "k_min": 3,
                "k_max": 5,
                "max_per_institution": 1,
                "use_mock_data": False
            }
        }
    }


class SolverRunRequest(BaseModel):
    """Top-level request body for POST /solver/run"""
    config: SolverConfig = Field(default_factory=SolverConfig)


# ── Response shapes (what goes OUT from the API) ──────────────────────

class TeamMemberOut(BaseModel):
    """Single participant inside a team response."""
    id:           str
    name:         str
    institution:  str
    skill_vector: Dict[str, float]


class DraftTeamOut(BaseModel):
    """One draft team as returned by the solver."""
    team_id:              int
    team_name:            str
    members:              List[TeamMemberOut]
    size:                 int
    average_skill_vector: List[float]


class SolverEvaluation(BaseModel):
    """Quality metrics from the solver run."""
    variance_score:   float
    quality:          str    # "excellent" | "good" | "fair"
    nodes_visited:    Optional[int]   = None
    elapsed_seconds:  Optional[float] = None
    timed_out:        bool            = False
    algorithm:        str             = "backtracking"


class SolverRunResponse(BaseModel):
    """
    Returned immediately when solver task is enqueued.
    Frontend uses task_id to poll GET /tasks/{task_id}/status.
    """
    task_id:    str
    status_url: str
    message:    str = "Solver task enqueued. Poll status_url for progress."


class DraftLineupsResponse(BaseModel):
    """
    Returned when fetching completed draft lineups.
    Only available after the solver task has succeeded.
    """
    task_id:    str
    teams:      List[DraftTeamOut]
    evaluation: SolverEvaluation
    total_participants: int
