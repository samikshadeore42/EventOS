from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
import uuid

class RiskTeamOut(BaseModel):
    team_id: uuid.UUID
    team_name: Optional[str] = None
    risk_score: int
    risk_level: str
    signals: List[dict]
    reasons: List[str]
    recommended_actions: List[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class RiskSummaryOut(BaseModel):
    event_id: uuid.UUID
    total_teams: int
    low_count: int
    medium_count: int
    high_count: int
    critical_count: int
    average_risk_score: float
    latest_snapshot_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class RiskSweepResult(BaseModel):
    event_id: uuid.UUID
    processed_teams: int
    created_snapshots: int
    high_risk_count: int
    critical_risk_count: int

    model_config = ConfigDict(from_attributes=True)

class RiskHistoryOut(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    risk_score: int
    risk_level: str
    signals: List[dict]
    reasons: List[str]
    recommended_actions: List[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
