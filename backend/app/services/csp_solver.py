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
#
# ALGORITHM OVERVIEW:
# 1. Sort participants by "most constrained first" — those with fewest
#    valid teams go first. Placing hard-to-fit people early reduces
#    backtracking later. (This is the MRV heuristic from CSP theory.)
# 2. For each participant, try every team in order of "least constraining"
#    — the team whose average skill is furthest from target (needs help most).
# 3. After each placement, run forward checking — verify every unplaced
#    participant still has at least one valid team. If not, prune.
# 4. On full success, score with objective function. Track the best solution
#    seen across the entire search tree.
# 5. On dead end, undo placement and try the next team.


from itertools import count

import numpy as np
import time 
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from uuid import UUID
from copy import deepcopy


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
        return team.size() < k_max

    @staticmethod
    def check_institutional_diversity(
        team: TeamSlot,
        candidate: ParticipantNode,
        max_per_institution: int = 1
    ) -> bool:
        count = sum(
            1 for m in team.members
            if m.institution == candidate.institution
        )
        return count < max_per_institution

    @staticmethod
    def check_all_constraints(
        team: TeamSlot,
        candidate: ParticipantNode,
        k_max: int,
        max_per_institution: int = 1
    ) -> tuple[bool, str]:
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
        if not participants:
            return np.array([])
        all_skills = np.array([p.skill_array for p in participants])
        return all_skills.mean(axis=0)

    @staticmethod
    def skill_variance_score(
        teams: List[TeamSlot],
        target_averages: np.ndarray
    ) -> float:
        total_variance = 0.0
        for team in teams:
            if not team.members:
                continue
            team_avg = team.average_skill_vector()
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


# ── Solver Interface  ────────────

class CSPTeamSolver:
    """
    Recursive backtracking solver with forward checking and MRV heuristic.

    MRV  = Minimum Remaining Values — place the most constrained
           participant first (fewest valid teams available to them).
    FC   = Forward Checking — after each placement, verify every
           remaining participant still has ≥ 1 valid team. Prune if not.
    """

    TIME_LIMIT_SECONDS = 10
    
    def __init__(self, formulation: CSPFormulation):
        self.f             = formulation
        self.checker       = ConstraintChecker()
        self.objective     = ObjectiveFunction()
        self._best_teams:  Optional[List[TeamSlot]] = None
        self._best_score:  float                    = float("inf")
        self._nodes_visited: int                    = 0
        self._start_time:  float                    = 0.0
        self._timed_out:   bool                     = False

        # Pre-compute target averages once — used throughout search
        self._target_avgs = self.objective.compute_target_averages(
            self.f.participants,
            self.f.num_teams,
            self.f.target_size
        )
        
    #-- Public Entry Point ------------------------------------------------
    def solve(self) -> Tuple[List[TeamSlot], dict]:
        """
        Returns (best_teams_found, evaluation_report).
        Tries full backtracking first; falls back to greedy if time limit hit.
        """
        self._start_time = time.time()

        # Initial empty teams
        teams = [TeamSlot(id=i) for i in range(self.f.num_teams)]

        # Sort all participants by MRV (most constrained first)
        ordered = self._order_by_mrv(self.f.participants, teams)

        print(f"[CSP] Starting backtracking search: "
              f"{len(self.f.participants)} participants → "
              f"{self.f.num_teams} teams")

        self._backtrack(ordered, teams, depth=0)

        elapsed = time.time() - self._start_time

        if self._best_teams is None:
            # Should never happen (greedy fallback ensures a solution exists)
            print("[CSP] WARNING: backtracking found no solution, using greedy fallback")
            self._best_teams = self._greedy_fallback(self.f.participants)

        report = self.objective.evaluate_assignment(self._best_teams, self.f)
        report["nodes_visited"] = self._nodes_visited
        report["elapsed_seconds"] = round(elapsed, 3)
        report["timed_out"] = self._timed_out
        report["algorithm"] = "backtracking" if not self._timed_out else "greedy_fallback"

        print(f"[CSP] Solved in {elapsed:.2f}s | "
              f"nodes={self._nodes_visited} | "
              f"variance={report['variance_score']} | "
              f"quality={report['quality']}")

        return self._best_teams, report

    # ── Core Recursive Backtracking ───────────────────────────────────
    
    def _backtrack(
        self,
        remaining:  List[ParticipantNode],
        teams:      List[TeamSlot],
        depth:      int
    ) -> bool:
        if time.time() - self._start_time > self.TIME_LIMIT_SECONDS:
            self._timed_out = True
            return False

        self._nodes_visited += 1

        if not remaining:
            if any(t.size() < self.f.k_min for t in teams):
                return False

            score = self.objective.skill_variance_score(teams, self._target_avgs)

            if score < self._best_score:
                self._best_score = score
                self._best_teams = deepcopy(teams)   # snapshot the current state
                print(f"[CSP]   New best solution at depth {depth}: "
                      f"variance={score:.4f}")

            return False

        ordered_remaining = self._order_by_mrv(remaining, teams)
        current           = ordered_remaining[0]
        rest              = ordered_remaining[1:]

        ordered_teams = self._order_teams_by_lcv(current, teams)

        for team in ordered_teams:
            valid, reason = self.checker.check_all_constraints(
                team, current, self.f.k_max, self.f.max_per_institution
            )

            if not valid:
                continue  

            team.members.append(current)

            if self._forward_check(rest, teams):
                self._backtrack(rest, teams, depth + 1)

            team.members.pop()

        return False 
    
    # ── Forward Checking ─────────────────────────────────────────────
    def _forward_check(
        self,
        remaining: List[ParticipantNode],
        teams:     List[TeamSlot]
    ) -> bool:
        for participant in remaining:
            has_valid_team = any(
                self.checker.check_all_constraints(
                    team, participant, self.f.k_max, self.f.max_per_institution
                )[0]
                for team in teams
            )
            if not has_valid_team:
                return False 
        return True


    # ── Heuristics ───────────────────────────────────────────────────
    def _order_by_mrv(
        self,
        participants: List[ParticipantNode],
        teams:        List[TeamSlot]
    ) -> List[ParticipantNode]:
        def valid_team_count(p: ParticipantNode) -> int:
            return sum(
                1 for t in teams
                if self.checker.check_all_constraints(
                    t, p, self.f.k_max, self.f.max_per_institution
                )[0]
            )

        return sorted(participants, key=valid_team_count)

    def _order_teams_by_lcv(
        self,
        candidate: ParticipantNode,
        teams:     List[TeamSlot]
    ) -> List[TeamSlot]:
        scored = []
        for team in teams:
            valid, _ = self.checker.check_all_constraints(
                team, candidate, self.f.k_max, self.f.max_per_institution
            )
            if not valid:
                continue

            team.members.append(candidate)
            score = self.objective.skill_variance_score([team], self._target_avgs)
            team.members.pop()

            scored.append((score, team))

        scored.sort(key=lambda x: x[0])
        valid_teams   = [t for _, t in scored]
        invalid_teams = [t for t in teams if t not in valid_teams]
        return valid_teams + invalid_teams

    # ── Greedy Fallback  ────────
    def _greedy_fallback(
        self,
        participants: List[ParticipantNode]
    ) -> List[TeamSlot]:
        print("[CSP] Running greedy fallback solver")
        teams = [TeamSlot(id=i) for i in range(self.f.num_teams)]
        sorted_p = sorted(participants, key=lambda p: np.std(p.skill_array), reverse=True)

        for participant in sorted_p:
            placed = False
            for team in sorted(teams, key=lambda t: t.size()):
                valid, _ = self.checker.check_all_constraints(
                    team, participant, self.f.k_max, self.f.max_per_institution
                )
                if valid:
                    team.members.append(participant)
                    placed = True
                    break
            if not placed:
                min(teams, key=lambda t: t.size()).members.append(participant)

        return teams


# ── Helper: build formulation from raw dicts (used by Celery task) ───
def build_formulation_from_dicts(
    roster:      List[dict],
    num_teams:   int,
    target_size: int,
    k_min:       int,
    k_max:       int,
    max_per_institution: int = 1
) -> CSPFormulation:
    nodes = [
        ParticipantNode(
            id=str(p.get("id", p.get("email"))),
            name=f"{p['first_name']} {p['last_name']}",
            institution=p["institution"],
            skill_vector=p["skill_vector"]
        )
        for p in roster
    ]
    return CSPFormulation(
        participants=nodes,
        num_teams=num_teams,
        target_size=target_size,
        k_min=k_min,
        k_max=k_max,
        max_per_institution=max_per_institution
    )