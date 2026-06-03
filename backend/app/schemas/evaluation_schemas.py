# File: backend/app/schemas/evaluation_schemas.py

from pydantic import BaseModel, Field, field_validator
from typing import Dict, Optional, List
from uuid import UUID
from datetime import datetime

class ScoreSubmissionRequest(BaseModel):
    team_id: UUID
    scores:  Dict[str, float] = Field(
        ...,
        description="Criteria name → score (0.0–10.0)",
        examples=[{"technical_depth": 8.5, "innovation": 7.0, "presentation": 9.0, "feasibility": 6.5}]
    )

    @field_validator("scores")
    @classmethod
    def validate_score_range(cls, v: Dict[str, float]) -> Dict[str, float]:
        REQUIRED_CRITERIA = {"technical_depth", "innovation", "presentation", "feasibility"}
        provided = set(v.keys())
        if provided != REQUIRED_CRITERIA:
            missing = REQUIRED_CRITERIA - provided
            extra = provided - REQUIRED_CRITERIA
            parts = []
            if missing:
                parts.append(f"missing: {', '.join(sorted(missing))}")
            if extra:
                parts.append(f"unexpected: {', '.join(sorted(extra))}")
            raise ValueError(
                f"Scores must include exactly: technical_depth, innovation, presentation, feasibility. "
                f"({'; '.join(parts)})"
            )
        for criterion, score in v.items():
            if not (0.0 <= score <= 10.0):
                raise ValueError(
                    f"Score for '{criterion}' is {score}. Must be between 0.0 and 10.0."
                )
        return v


class ScoreUpdateRequest(BaseModel):
    scores: Dict[str, float]

    @field_validator("scores")
    @classmethod
    def validate_score_range(cls, v: Dict[str, float]) -> Dict[str, float]:
        for criterion, score in v.items():
            if not (0.0 <= score <= 10.0):
                raise ValueError(f"Score for '{criterion}' must be 0.0–10.0, got {score}.")
        return v

class EvaluationResponse(BaseModel):
    id:            UUID
    team_id:       UUID
    evaluator_id:  UUID
    scores:        Dict[str, float]
    is_flagged:    bool
    flag_reason:   Optional[str]   = None
    anomaly_score: Optional[float] = None
    submitted_at:  datetime
    model_config = {"from_attributes": True}


class TeamScoreSummary(BaseModel):
    team_id:          UUID
    team_name:        str
    evaluator_count:  int
    average_scores:   Dict[str, float]   
    weighted_total:   float              
    has_flags:        bool               
    rank:             Optional[int] = None


class ConsolidationResult(BaseModel):
    """Result returned by the score consolidation task."""
    teams_processed:   int
    flagged_count:     int
    leaderboard_ready: int     
    message:           str
    
class EvaluatorAssignmentRequest(BaseModel):
    evaluator_id: UUID
    team_ids:     List[UUID]