# File: backend/app/services/auto_assignment_service.py
"""
Automatic evaluator & mentor assignment.

Algorithm class: greedy bipartite matching with hard-constraint filtering and
soft-objective scoring — not a full CSP solver (csp_solver.py already covers
that for team formation; assignment here is a simpler, well-balanced matching
problem, not a combinatorial search problem).

Design:
  1. PROPOSE (dry_run): compute a complete candidate assignment, return it for
     admin review. Nothing is written to the DB.
  2. COMMIT: admin sends back the (possibly hand-edited) proposal; this writes
     it using the exact same EvaluatorTeamAssignment / MentorAssignment commit
     logic the manual /assign endpoints already use, so committed assignments
     are indistinguishable from manual ones afterward.

Hard constraints (never silently violated — see RELAXATION below):
  * Evaluator conflict of interest: evaluator.passed_out_institution must not
    match any team member's institution.
  * Only approved teams are eligible.
  * Only active evaluators/mentors are eligible.

Soft objectives:
  * Evaluators: balance load as evenly as possible (teams ÷ evaluators).
  * Mentors: skill-gap match (same scoring formula as
    MentorOpsService.get_assignment_suggestions_by_skill_gap: weak-skill
    expertise match * 30, minus current_load * 5), then load balance as the
    tiebreaker.

RELAXATION: if a team cannot be matched without violating a hard constraint
(e.g. every evaluator has a conflict of interest with that team), the
algorithm relaxes conflict-of-interest as a LAST RESORT to guarantee every
team gets covered — but every relaxation is recorded in
`relaxed_constraints` and surfaced to the admin before commit. This is never
silent.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models.evaluation import Evaluator
from app.models.mentor import Mentor, MentorAssignment
from app.models.participant import Team, Participant
from app.models.assignment import EvaluatorTeamAssignment
from app.schemas.auto_assignment_schemas import (
    EvaluatorAssignmentProposalItem, EvaluatorAutoAssignProposal,
    MentorAssignmentProposalItem, MentorAutoAssignProposal,
    UnassignedTeamOut, RelaxedConstraintOut,
)


def _normalize(value: Optional[str]) -> str:
    return " ".join((value or "").strip().lower().split())


def _new_proposal_id() -> str:
    return f"prop_{uuid.uuid4().hex[:16]}"


class AutoAssignmentService:

    # ── Evaluators ───────────────────────────────────────────────────────

    @staticmethod
    def propose_evaluator_assignment(
        event_id: uuid.UUID, db: Session, judges_per_team: int = 1
    ) -> EvaluatorAutoAssignProposal:
        teams = db.query(Team).filter(
            Team.event_id == event_id, Team.is_approved == True
        ).order_by(Team.team_name).all()
        evaluators = db.query(Evaluator).filter(
            Evaluator.event_id == event_id, Evaluator.is_active == True
        ).order_by(Evaluator.last_name).all()

        unassigned: list[UnassignedTeamOut] = []
        relaxed: list[RelaxedConstraintOut] = []
        assignments: list[EvaluatorAssignmentProposalItem] = []

        if not evaluators:
            return EvaluatorAutoAssignProposal(
                proposal_id=_new_proposal_id(),
                total_teams=len(teams), total_evaluators=0,
                target_per_evaluator=0, judges_per_team=judges_per_team,
                assignments=[],
                unassigned_teams=[
                    UnassignedTeamOut(team_id=t.id, team_name=t.team_name,
                                       reason="No active evaluators registered for this event.")
                    for t in teams
                ],
                relaxed_constraints=[],
                generated_at=datetime.now(timezone.utc).isoformat(),
            )

        # Pre-compute each team's member institutions once.
        team_institutions: dict[uuid.UUID, set[str]] = {}
        for t in teams:
            team_institutions[t.id] = {_normalize(m.institution) for m in t.members}

        # Running load counter, seeded from existing active assignments so a
        # re-run doesn't ignore work already on the books.
        load: dict[uuid.UUID, int] = {e.id: 0 for e in evaluators}
        existing = db.query(EvaluatorTeamAssignment).filter(
            EvaluatorTeamAssignment.event_id == event_id
        ).all()
        for a in existing:
            if a.evaluator_id in load:
                load[a.evaluator_id] += 1

        total_slots = len(teams) * judges_per_team
        target_per_evaluator = total_slots / len(evaluators) if evaluators else 0

        for team in teams:
            team_inst = team_institutions[team.id]
            assigned_for_team = 0

            for _slot in range(judges_per_team):
                # Hard-constraint-respecting candidates, least-loaded first.
                clean_candidates = sorted(
                    (e for e in evaluators
                     if _normalize(e.passed_out_institution) not in team_inst
                     or not e.passed_out_institution),
                    key=lambda e: load[e.id],
                )
                # Already-used-for-this-team check (no duplicate judge on one team).
                used_ids = {
                    a.evaluator_id for a in assignments if a.team_id == team.id
                }
                clean_candidates = [e for e in clean_candidates if e.id not in used_ids]

                if clean_candidates:
                    chosen = clean_candidates[0]
                else:
                    # LAST RESORT: relax conflict-of-interest. Pick the
                    # least-loaded evaluator not already on this team, even if
                    # they have a COI — and record it explicitly.
                    fallback = sorted(
                        (e for e in evaluators if e.id not in used_ids),
                        key=lambda e: load[e.id],
                    )
                    if not fallback:
                        unassigned.append(UnassignedTeamOut(
                            team_id=team.id, team_name=team.team_name,
                            reason=f"Not enough distinct evaluators for {judges_per_team} judge(s)/team.",
                        ))
                        break
                    chosen = fallback[0]
                    relaxed.append(RelaxedConstraintOut(
                        team_id=team.id, team_name=team.team_name,
                        entity_id=chosen.id,
                        entity_name=f"{chosen.first_name} {chosen.last_name}",
                        constraint="conflict_of_interest",
                        detail=(
                            f"Evaluator's institution '{chosen.passed_out_institution}' "
                            f"matches a member of '{team.team_name}'. Assigned anyway — "
                            "no conflict-free evaluator was available."
                        ),
                    ))

                load[chosen.id] += 1
                assigned_for_team += 1
                assignments.append(EvaluatorAssignmentProposalItem(
                    evaluator_id=chosen.id,
                    evaluator_name=f"{chosen.first_name} {chosen.last_name}",
                    team_id=team.id,
                    team_name=team.team_name,
                    load_after=load[chosen.id],
                ))

        return EvaluatorAutoAssignProposal(
            proposal_id=_new_proposal_id(),
            total_teams=len(teams),
            total_evaluators=len(evaluators),
            target_per_evaluator=round(target_per_evaluator, 2),
            judges_per_team=judges_per_team,
            assignments=assignments,
            unassigned_teams=unassigned,
            relaxed_constraints=relaxed,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def commit_evaluator_assignment(
        event_id: uuid.UUID, db: Session,
        assignments: list[EvaluatorAssignmentProposalItem],
    ) -> dict:
        """Writes the (admin-reviewed, possibly edited) proposal. Reuses the
        same replace-by-evaluator semantics as the manual /assign endpoint:
        for each evaluator touched, their assignment set for this event is
        replaced with exactly what's in the proposal."""
        by_evaluator: dict[uuid.UUID, list[uuid.UUID]] = {}
        for item in assignments:
            by_evaluator.setdefault(item.evaluator_id, []).append(item.team_id)

        for evaluator_id, team_ids in by_evaluator.items():
            db.query(EvaluatorTeamAssignment).filter_by(
                evaluator_id=evaluator_id, event_id=event_id
            ).delete()
            for team_id in team_ids:
                db.add(EvaluatorTeamAssignment(
                    event_id=event_id, evaluator_id=evaluator_id, team_id=team_id,
                ))

        db.commit()
        return {
            "status": "success",
            "evaluators_updated": len(by_evaluator),
            "total_assignments": len(assignments),
        }

    # ── Mentors ──────────────────────────────────────────────────────────

    @staticmethod
    def propose_mentor_assignment(
        event_id: uuid.UUID, db: Session,
    ) -> MentorAutoAssignProposal:
        teams = db.query(Team).filter(
            Team.event_id == event_id, Team.is_approved == True
        ).order_by(Team.team_name).all()
        mentors = db.query(Mentor).filter(
            Mentor.event_id == event_id, Mentor.is_active == True
        ).order_by(Mentor.last_name).all()

        unassigned: list[UnassignedTeamOut] = []
        assignments: list[MentorAssignmentProposalItem] = []

        if not mentors:
            return MentorAutoAssignProposal(
                proposal_id=_new_proposal_id(),
                total_teams=len(teams), total_mentors=0,
                assignments=[],
                unassigned_teams=[
                    UnassignedTeamOut(team_id=t.id, team_name=t.team_name,
                                       reason="No active mentors registered for this event.")
                    for t in teams
                ],
                relaxed_constraints=[],
                generated_at=datetime.now(timezone.utc).isoformat(),
            )

        load: dict[uuid.UUID, int] = {m.id: 0 for m in mentors}
        existing = db.query(MentorAssignment).filter(
            MentorAssignment.event_id == event_id, MentorAssignment.is_active == True,
        ).all()
        for a in existing:
            if a.mentor_id in load:
                load[a.mentor_id] += 1

        already_mentored_team_ids = {a.team_id for a in existing}

        for team in teams:
            if team.id in already_mentored_team_ids:
                continue  # already has an active mentor — skip, don't double-assign

            members = db.query(Participant).filter(
                Participant.team_id == team.id, Participant.event_id == event_id
            ).all()

            # Same weak-skill computation as the existing skill-gap suggestion
            # logic, kept consistent so this algorithm's output matches what
            # admins already see in the "suggestions" panel.
            skill_sums: dict[str, float] = {}
            skill_counts: dict[str, int] = {}
            for m in members:
                if m.skill_vector:
                    for skill, val in m.skill_vector.items():
                        skill_sums[skill] = skill_sums.get(skill, 0) + float(val)
                        skill_counts[skill] = skill_counts.get(skill, 0) + 1

            weak_skills: list[str] = []
            if skill_sums:
                avg_skills = {s: skill_sums[s] / skill_counts[s] for s in skill_sums}
                sorted_skills = sorted(avg_skills.items(), key=lambda x: x[1])
                weak_skills = [s[0] for s in sorted_skills[:3] if s[1] < 7.0]
                if not weak_skills:
                    weak_skills = [sorted_skills[0][0]] if sorted_skills else []

            candidates = []
            for mentor in mentors:
                expertise = [e.lower().strip() for e in (mentor.expertise_areas or [])]
                matched = [
                    ws for ws in weak_skills
                    if any(ws.lower() in exp or exp in ws.lower() for exp in expertise)
                ]
                score = (len(matched) * 30) - (load[mentor.id] * 5)
                candidates.append((mentor, score, matched))

            # Highest score first; tie-break on lowest current load for balance.
            candidates.sort(key=lambda c: (-c[1], load[c[0].id]))

            if not candidates:
                unassigned.append(UnassignedTeamOut(
                    team_id=team.id, team_name=team.team_name,
                    reason="No mentors available.",
                ))
                continue

            chosen, score, matched = candidates[0]
            load[chosen.id] += 1
            assignments.append(MentorAssignmentProposalItem(
                mentor_id=chosen.id,
                mentor_name=f"{chosen.first_name} {chosen.last_name}",
                team_id=team.id,
                team_name=team.team_name,
                match_score=round(score, 1),
                matched_skills=matched,
                load_after=load[chosen.id],
            ))

        return MentorAutoAssignProposal(
            proposal_id=_new_proposal_id(),
            total_teams=len(teams),
            total_mentors=len(mentors),
            assignments=assignments,
            unassigned_teams=unassigned,
            relaxed_constraints=[],  # mentors have no hard COI rule today
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def commit_mentor_assignment(
        event_id: uuid.UUID, db: Session,
        assignments: list[MentorAssignmentProposalItem],
    ) -> dict:
        """Creates one active MentorAssignment per proposal item. Skips teams
        that already have an active mentor (defensive — propose already
        excludes them, but commit re-checks in case of a race)."""
        created = 0
        skipped = 0
        for item in assignments:
            existing = db.query(MentorAssignment).filter(
                MentorAssignment.event_id == event_id,
                MentorAssignment.team_id == item.team_id,
                MentorAssignment.is_active == True,
            ).first()
            if existing:
                skipped += 1
                continue
            db.add(MentorAssignment(
                event_id=event_id,
                mentor_id=item.mentor_id,
                team_id=item.team_id,
                is_active=True,
            ))
            created += 1

        db.commit()
        return {"status": "success", "created": created, "skipped_already_assigned": skipped}