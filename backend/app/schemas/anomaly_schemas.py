# File: backend/app/schemas/anomaly_schemas.py
#
# Pydantic contracts for the anomaly detection endpoints.
# Frontend codes against these shapes. Mirrors solver_schemas.py style.

from pydantic import BaseModel, Field
from typing import List, Optional, Dict


# ── Request shapes (what comes IN to the API) ─────────────────────────

class ScoreEntryIn(BaseModel):
    """One judge's score for one team across multiple criteria."""
    judge_id:                 str
    judge_name:               str
    judge_institution:        str
    team_id:                  str
    team_member_institutions: List[str]
    scores:                   Dict[str, float]


class AnomalyDetectionConfig(BaseModel):
    """
    Threshold configuration. All five detectors can be tuned independently.
    Defaults are calibrated for a 1-10 scoring scale with 3-5 judges per team.
    """
    z_score_threshold:    float = Field(default=2.0, gt=0, description="σ threshold for per-criterion outliers")
    divergence_threshold: float = Field(default=3.0, gt=0, description="Weighted Euclidean distance threshold")
    consistency_min_std:  float = Field(default=0.5, gt=0, description="Below this, judge isn't differentiating")
    halo_threshold:       float = Field(default=2.0, gt=0, description="Judge mean vs grand mean offset")
    coi_bias_threshold:   float = Field(default=1.5, gt=0, description="Same-institution score bias threshold")


class AnomalyDetectionRequest(BaseModel):
    """Top-level request body for POST /anomalies/detect."""
    entries:  List[ScoreEntryIn] = Field(..., min_length=1)
    criteria: List[str]          = Field(..., min_length=1)
    weights:  Optional[Dict[str, float]] = None
    config:   AnomalyDetectionConfig     = Field(default_factory=AnomalyDetectionConfig)

    model_config = {
        "json_schema_extra": {
            "example": {
                "criteria": ["innovation", "execution", "presentation"],
                "weights":  {"innovation": 1.2, "execution": 1.0, "presentation": 0.8},
                "entries": [
                    {
                        "judge_id":                 "J1",
                        "judge_name":               "Alice",
                        "judge_institution":        "MIT",
                        "team_id":                  "T1",
                        "team_member_institutions": ["MIT", "Stanford"],
                        "scores": {"innovation": 7.0, "execution": 7.5, "presentation": 8.0}
                    },
                    {
                        "judge_id":                 "J2",
                        "judge_name":               "Bob",
                        "judge_institution":        "Berkeley",
                        "team_id":                  "T1",
                        "team_member_institutions": ["MIT", "Stanford"],
                        "scores": {"innovation": 6.5, "execution": 7.0, "presentation": 7.5}
                    }
                ],
                "config": {
                    "z_score_threshold": 2.0,
                    "divergence_threshold": 3.0,
                    "consistency_min_std": 0.5,
                    "halo_threshold": 2.0,
                    "coi_bias_threshold": 1.5
                }
            }
        }
    }


# ── Response shapes (what goes OUT from the API) ──────────────────────

class AnomalyDetectionResponse(BaseModel):
    """
    Returned immediately when an anomaly detection task is enqueued.
    Frontend uses task_id to poll GET /tasks/{task_id}/status.
    """
    task_id:    str
    status_url: str
    message:    str = "Anomaly detection enqueued. Poll status_url for progress."


class AnomalyOut(BaseModel):
    """A single detected anomaly in the report."""
    kind:        str           # "z_score" | "divergence" | "consistency" | "conflict_of_interest"
    severity:    str           # "low" | "medium" | "high"
    judge_id:    str
    team_id:     Optional[str] = None    # None for judge-level anomalies
    score:       float
    expected:    float
    metric:      float
    threshold:   float
    explanation: str


class AnomalyReportResponse(BaseModel):
    """
    Full anomaly report — returned when fetching a completed detection run.
    `holds_results_release` is the flag the committee dashboard reads to
    decide whether to enable the "Publish Results" button.
    """
    task_id:               str
    total_anomalies:       int
    by_kind:               Dict[str, int]
    by_severity:           Dict[str, int]
    holds_results_release: bool
    anomalies:             List[AnomalyOut]