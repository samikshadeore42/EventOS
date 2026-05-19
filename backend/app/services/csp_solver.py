# File: backend/app/services/csp_solver.py
#
# CSP = Constraint Satisfaction Problem
#
# We're solving: assign participants → teams such that:
#   1. Every participant is in exactly one team
#   2. Team sizes stay within [k_min, k_max]
#   3. No two participants from same institution on same team
#   4. Skill vectors are balanced across teams (minimize variance)
#
# Day 2: Data model + constraint checkers + objective function
# Day 3: Full recursive backtracking solver

import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from uuid import UUID


# ── Data Structures ──────────────────────────────────────────────────

@dataclass
class ParticipantNode:
    """
    Represents a participant in the CSP graph.
    We copy only what the solver needs — keeps it decoupled from SQLAlchemy.
    """
    id:          str
    name:        str
    institution: str
    skill_vector: Dict[str, float]  # {"python": 8.5, "ml": 7.0}

    @property
    def skill_array(self) -> np.ndarray:
        """Converts skill dict to numpy array for math operations."""
        return np.array(list(self.skill_vector.values()))

    @property
    def skill_keys(self) -> List[str]:
        return list(self.skill_vector.keys())


@dataclass
class TeamSlot:
    """
    Represents a team being formed.
    Think of it as an 'empty bucket' we're filling with participants.
    """
    id:      int                            # simple index: 0, 1, 2...
    members: List[ParticipantNode] = field(default_factory=list)

    def institution_set(self) -> set:
        """Returns set of institutions already on this team."""
        return {m.institution for m in self.members}

    def average_skill_vector(self) -> Optional[np.ndarray]:
        """Mean skill vector of current members. None if empty."""
        if not self.members:
            return None
        return np.mean([m.skill_array for m in self.members], axis=0)

    def size(self) -> int:
        return len(self.members)


@dataclass
class CSPFormulation:
    """
    The complete problem formulation.
    Created once per team-formation request, passed to the solver.
    """
    participants:    List[ParticipantNode]
    num_teams:       int
    target_size:     int
    k_min:           int
    k_max:           int
    max_per_institution: int = 1

    def __post_init__(self):
        """Validates the formulation is mathematically feasible."""
        n = len(self.participants)
        min_capacity = self.k_min * self.num_teams
        max_capacity = self.k_max * self.num_teams

        if n < min_capacity:
            raise ValueError(
                f"Not enough participants ({n}) to fill {self.num_teams} teams "
                f"with min size {self.k_min} (need at least {min_capacity})"
            )
        if n > max_capacity:
            raise ValueError(
                f"Too many participants ({n}) for {self.num_teams} teams "
                f"with max size {self.k_max} (max capacity {max_capacity})"
            )


# ── Constraint Checkers ───────────────────────────────────────────────
# These are the RULES. The solver calls these to check if an
# assignment is legal before making it.

class ConstraintChecker:

    @staticmethod
    def check_size_limit(team: TeamSlot, k_max: int) -> bool:
        """
        Constraint 1: Team must not exceed maximum size.
        Returns True if adding one more member is still OK.
        """
        return team.size() < k_max

    @staticmethod
    def check_institutional_diversity(
        team: TeamSlot,
        candidate: ParticipantNode,
        max_per_institution: int = 1
    ) -> bool:
        """
        Constraint 2: No more than `max_per_institution` members
        from the same institution on one team.
        """
        institution_count = sum(
            1 for m in team.members
            if m.institution == candidate.institution
        )
        return institution_count < max_per_institution

    @staticmethod
    def check_all_constraints(
        team: TeamSlot,
        candidate: ParticipantNode,
        k_max: int,
        max_per_institution: int = 1
    ) -> tuple[bool, str]:
        """
        Runs all constraints. Returns (is_valid, reason_if_invalid).
        The solver calls this before every placement decision.
        """
        if not ConstraintChecker.check_size_limit(team, k_max):
            return False, f"Team {team.id} is full ({team.size()}/{k_max})"

        if not ConstraintChecker.check_institutional_diversity(team, candidate, max_per_institution):
            return False, (
                f"Team {team.id} already has {max_per_institution} member(s) "
                f"from {candidate.institution}"
            )

        return True, "ok"


# ── Objective Function ────────────────────────────────────────────────
# This measures HOW GOOD a team assignment is.
# Lower score = better balanced teams.
# The solver tries to minimize this.

class ObjectiveFunction:

    @staticmethod
    def compute_target_averages(
        participants: List[ParticipantNode],
        num_teams: int,
        target_size: int
    ) -> np.ndarray:
        """
        μ_d = (k/N) * Σ S_{i,d}
        The ideal average skill score per dimension if perfectly balanced.
        """
        all_skills = np.array([p.skill_array for p in participants])
        # Mean across all participants, scaled by team size ratio
        return (target_size / len(participants)) * all_skills.sum(axis=0)

    @staticmethod
    def skill_variance_score(
        teams: List[TeamSlot],
        target_averages: np.ndarray
    ) -> float:
        """
        Main objective: minimize total skill variance across all teams.

        Formula from doc:
        min Σ_j Σ_d ( Σ_i x_{i,j} * S_{i,d} - μ_d )²

        Lower = better balanced teams.
        """
        total_variance = 0.0
        for team in teams:
            if not team.members:
                continue
            team_avg = team.average_skill_vector()
            # Squared distance from target averages, summed across all skill dimensions
            variance = np.sum((team_avg - target_averages) ** 2)
            total_variance += variance
        return float(total_variance)

    @staticmethod
    def evaluate_assignment(
        teams: List[TeamSlot],
        formulation: CSPFormulation
    ) -> dict:
        """
        Full evaluation report for a completed assignment.
        Used by the API to return solver quality metrics.
        """
        target_avgs = ObjectiveFunction.compute_target_averages(
            formulation.participants,
            formulation.num_teams,
            formulation.target_size
        )
        variance_score = ObjectiveFunction.skill_variance_score(teams, target_avgs)

        return {
            "variance_score": round(variance_score, 4),
            "num_teams": len(teams),
            "team_sizes": [t.size() for t in teams],
            "target_averages": target_avgs.tolist(),
            "team_average_skills": [
                t.average_skill_vector().tolist() if t.average_skill_vector() is not None else []
                for t in teams
            ],
            "quality": "excellent" if variance_score < 5 else "good" if variance_score < 15 else "fair"
        }


# ── Solver Interface (stub for Day 2 — full solver Day 3) ────────────

class CSPTeamSolver:
    """
    Main solver class. Day 2 version exposes the interface and
    runs a greedy heuristic. Day 3 replaces this with full
    recursive backtracking + forward checking.
    """

    def __init__(self, formulation: CSPFormulation):
        self.formulation  = formulation
        self.checker      = ConstraintChecker()
        self.objective    = ObjectiveFunction()

    def solve(self) -> tuple[List[TeamSlot], dict]:
        """
        Entry point. Returns (teams, evaluation_report).
        Day 2: greedy placement (fast, good enough for testing)
        Day 3: replace with backtracking for optimal solution
        """
        teams = [
            TeamSlot(id=i)
            for i in range(self.formulation.num_teams)
        ]

        # Sort participants by skill diversity (most specialized first)
        # Placing "hard to fit" participants first reduces backtracking later
        sorted_participants = sorted(
            self.formulation.participants,
            key=lambda p: np.std(p.skill_array),
            reverse=True
        )

        for participant in sorted_participants:
            placed = self._greedy_place(participant, teams)
            if not placed:
                # Fallback: place in smallest team ignoring institution constraint
                smallest = min(teams, key=lambda t: t.size())
                smallest.members.append(participant)
                print(f"⚠️  Constraint relaxed for {participant.name} → Team {smallest.id}")

        target_avgs = self.objective.compute_target_averages(
            self.formulation.participants,
            self.formulation.num_teams,
            self.formulation.target_size
        )
        report = self.objective.evaluate_assignment(teams, self.formulation)
        return teams, report

    def _greedy_place(self, participant: ParticipantNode, teams: List[TeamSlot]) -> bool:
        """
        Tries to place participant in the best valid team.
        'Best' = team whose avg skill is furthest from target (needs balancing most).
        """
        target_avgs = self.objective.compute_target_averages(
            self.formulation.participants,
            self.formulation.num_teams,
            self.formulation.target_size
        )

        # Score each team: how much does adding this participant help balance it?
        candidates = []
        for team in teams:
            is_valid, reason = self.checker.check_all_constraints(
                team, participant,
                self.formulation.k_max,
                self.formulation.max_per_institution
            )
            if is_valid:
                # Simulate adding this participant and score the result
                team.members.append(participant)
                score = self.objective.skill_variance_score([team], target_avgs)
                team.members.pop()
                candidates.append((score, team))

        if not candidates:
            return False

        # Place in the team where variance improves the most
        best_team = min(candidates, key=lambda x: x[0])[1]
        best_team.members.append(participant)
        return True
