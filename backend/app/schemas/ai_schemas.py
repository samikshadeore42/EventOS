# File: backend/app/schemas/ai_schemas.py
#
# Pydantic contracts for the AI generation endpoints. These define the JSON
# shapes that flow in and out of /ai/* routes.

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


# ── Shared response: enqueueing an AI task ───────────────────────────

class AITaskEnqueueResponse(BaseModel):
    """
    Returned immediately when any AI generation task is enqueued.
    The client polls status_url and fetches the result from result_url.
    """
    task_id:    str
    status_url: str
    result_url: str
    message:    str = "AI generation enqueued. Poll status_url for progress."


# ── 1. Team rationale ────────────────────────────────────────────────

class TeamMemberIn(BaseModel):
    """One member of a team — minimal info needed for rationale generation."""
    name:        str
    institution: str
    skills:      List[str] = Field(default_factory=list)


class TeamRationaleRequest(BaseModel):
    team_name:          str
    members:            List[TeamMemberIn] = Field(..., min_length=1)
    distribution_rules: Dict[str, object]   = Field(default_factory=dict)
    challenge_area:     Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "team_name": "Team Atlas",
                "members": [
                    {"name": "Alice Chen",  "institution": "MIT",       "skills": ["ML", "Python"]},
                    {"name": "Ravi Kumar",  "institution": "IIT Bombay","skills": ["frontend", "UX"]},
                    {"name": "Mei Tanaka",  "institution": "ETH Zurich","skills": ["backend", "databases"]}
                ],
                "distribution_rules": {
                    "team_size": 3,
                    "max_per_institution": 1,
                    "skill_balance": True
                },
                "challenge_area": "Climate tech"
            }
        }
    }


class TeamRationaleResult(BaseModel):
    """Generated rationale, returned by GET /ai/result/{task_id}."""
    rationale: str


# ── 2. Communication drafting ────────────────────────────────────────

class CommunicationStage(str, Enum):
    welcome             = "welcome"
    evaluation_request  = "evaluation_request"
    deadline_reminder   = "deadline_reminder"
    results             = "results"
    progression         = "progression"


class RecipientRole(str, Enum):
    participant = "participant"
    judge       = "judge"
    mentor      = "mentor"


class CommunicationRequest(BaseModel):
    stage:          CommunicationStage
    recipient_name: str
    recipient_role: RecipientRole
    event_name:     str
    context:        Dict[str, object] = Field(default_factory=dict)

    model_config = {
        "json_schema_extra": {
            "example": {
                "stage":          "welcome",
                "recipient_name": "Alice Chen",
                "recipient_role": "participant",
                "event_name":     "WiSE@TI Hackathon 2025",
                "context": {
                    "team_name":    "Team Atlas",
                    "teammates":    ["Ravi Kumar", "Mei Tanaka"],
                    "challenge":    "Climate tech",
                    "start_date":   "2025-12-15",
                    "kickoff_url":  "https://example.com/kickoff"
                }
            }
        }
    }


class CommunicationResult(BaseModel):
    """Generated email, returned by GET /ai/result/{task_id}."""
    subject: str
    body:    str


# ── 3. Evaluation rubric ─────────────────────────────────────────────

class RubricRequest(BaseModel):
    challenge_area: str
    criteria:       Dict[str, float] = Field(..., min_length=1)
    event_name:     str = "the event"
    team_context:   Optional[Dict[str, object]] = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "challenge_area": "AI-powered education tools",
                "criteria": {
                    "technical_depth": 0.35,
                    "innovation":      0.25,
                    "presentation":    0.20,
                    "feasibility":     0.20
                },
                "event_name": "WiSE@TI Hackathon 2025"
            }
        }
    }


class CriterionRubric(BaseModel):
    name:             str
    weight:           float
    description:      str
    what_to_look_for: List[str]
    scoring_guide:    Dict[str, str]   # e.g. {"9-10": "...", "7-8": "..."}


class RubricResult(BaseModel):
    """Generated rubric, returned by GET /ai/result/{task_id}."""
    criteria: List[CriterionRubric]


# ── 4. Anomaly explanation ───────────────────────────────────────────

class AnomalyExplanationRequest(BaseModel):
    """
    Wraps the anomaly object (matches AnomalyOut from anomaly_schemas) and
    adds the team/evaluator names that the LLM uses for natural-language output.
    """
    anomaly:        Dict[str, object]
    team_name:      str
    evaluator_name: Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "anomaly": {
                    "kind":        "z_score",
                    "severity":    "high",
                    "judge_id":    "J3",
                    "team_id":     "T1",
                    "score":       9.8,
                    "expected":    5.1,
                    "metric":      2.4,
                    "threshold":   2.0,
                    "explanation": "Judge Carol scored team T1 9.80 on innovation — panel mean is 5.10 (z=2.40σ)."
                },
                "team_name":      "Team Atlas",
                "evaluator_name": "Carol Singh"
            }
        }
    }


class AnomalyExplanationResult(BaseModel):
    """Generated narrative, returned by GET /ai/result/{task_id}."""
    narrative: str