# File: backend/app/schemas/portal_schemas.py
from pydantic import BaseModel
from typing import Optional, List, Dict
from uuid import UUID


class TeamMemberPortalView(BaseModel):
    name:        str
    institution: str


class ParticipantPortalResponse(BaseModel):
    participant_id:   str
    name:             str
    email:            str
    institution:      str
    stage:            str
    team_assigned:    bool
    team_name:        Optional[str]         = None
    team_rationale:   Optional[str]         = None
    teammates:        List[TeamMemberPortalView] = []
    timeline:         List[dict]            = []


class EvaluatorPortalResponse(BaseModel):
    evaluator_id:   str
    name:           str
    email:          str
    stage:          str
    assigned_teams: List[dict]    = []
    grading_criteria: List[dict]  = []
    submitted_count: int          = 0
    total_assigned:  int          = 0