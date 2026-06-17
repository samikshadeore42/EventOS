# File: backend/app/schemas/auto_assignment_schemas.py
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel


# ── Shared ───────────────────────────────────────────────────────────────

class UnassignedTeamOut(BaseModel):
    team_id: UUID
    team_name: str
    reason: str  # e.g. "No evaluators available", "No conflict-free evaluator found"


class RelaxedConstraintOut(BaseModel):
    """A constraint that had to be bent to produce a complete assignment.
    Surfaced explicitly so a reviewing admin can see exactly where the
    algorithm compromised, rather than this looking identical to a clean
    assignment."""
    team_id: UUID
    team_name: str
    entity_id: UUID         # evaluator_id or mentor_id
    entity_name: str
    constraint: str         # e.g. "conflict_of_interest"
    detail: str              # human-readable explanation


# ── Evaluators ───────────────────────────────────────────────────────────

class EvaluatorAssignmentProposalItem(BaseModel):
    evaluator_id: UUID
    evaluator_name: str
    team_id: UUID
    team_name: str
    load_after: int           # how many teams this evaluator will have post-assignment


class EvaluatorAutoAssignProposal(BaseModel):
    proposal_id: str          # opaque token; pass back unchanged to /commit
    total_teams: int
    total_evaluators: int
    target_per_evaluator: float
    judges_per_team: int
    assignments: List[EvaluatorAssignmentProposalItem]
    unassigned_teams: List[UnassignedTeamOut]
    relaxed_constraints: List[RelaxedConstraintOut]
    generated_at: str


class EvaluatorAutoAssignRequest(BaseModel):
    judges_per_team: int = 1
    dry_run: bool = True       # True = propose only, False = propose AND commit


class EvaluatorAutoAssignCommitRequest(BaseModel):
    proposal_id: str
    # The exact assignment list the admin reviewed (allows hand-edits before commit)
    assignments: List[EvaluatorAssignmentProposalItem]


# ── Mentors ──────────────────────────────────────────────────────────────

class MentorAssignmentProposalItem(BaseModel):
    mentor_id: UUID
    mentor_name: str
    team_id: UUID
    team_name: str
    match_score: float
    matched_skills: List[str]
    load_after: int


class MentorAutoAssignProposal(BaseModel):
    proposal_id: str
    total_teams: int
    total_mentors: int
    assignments: List[MentorAssignmentProposalItem]
    unassigned_teams: List[UnassignedTeamOut]
    relaxed_constraints: List[RelaxedConstraintOut]
    generated_at: str


class MentorAutoAssignRequest(BaseModel):
    dry_run: bool = True


class MentorAutoAssignCommitRequest(BaseModel):
    proposal_id: str
    assignments: List[MentorAssignmentProposalItem]