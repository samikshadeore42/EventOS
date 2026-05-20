# File: backend/app/services/score_service.py
# Two responsibilities:
#   1. Anomaly detection — flags scorecards that deviate too far from
#      the panel consensus (implements the math from the spec doc)
#   2. Score consolidation — aggregates all scorecards per team,
#      computes weighted totals, builds leaderboard data
import numpy as np
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.evaluation import Evaluation, Evaluator
from app.models.participant import Team
from app.schemas.evaluation_schemas import TeamScoreSummary

GRADING_CRITERIA = {
    "technical_depth": 0.35,
    "innovation":      0.25,
    "presentation":    0.20,
    "feasibility":     0.20,
}

ANOMALY_THRESHOLD = 2.0

class ScoreService:
    @staticmethod
    def submit_scorecard(
        evaluator_id: str,
        team_id:      UUID,
        scores:       dict,
        db:           Session
    ) -> Evaluation:
        existing = db.query(Evaluation).filter(
            Evaluation.evaluator_id == evaluator_id,
            Evaluation.team_id      == team_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"You have already submitted a scorecard for this team. "
                    f"Use PATCH /evaluations/{existing.id} to update it."
                )
            )

        # Validate team is approved
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found.")
        if not team.is_approved:
            raise HTTPException(
                status_code=422,
                detail="Cannot submit scores for a team that has not been approved yet."
            )

        # Save scorecard
        evaluation = Evaluation(
            team_id=team_id,
            evaluator_id=evaluator_id,
            scores=scores,
            is_flagged=False
        )
        db.add(evaluation)
        db.commit()
        db.refresh(evaluation)

        # Run anomaly detection — this may update is_flagged
        ScoreService.run_anomaly_detection_for_team(team_id, db)
        db.refresh(evaluation)

        return evaluation

    # ── Anomaly Detection ─────────────────────────────────────────────

    @staticmethod
    def run_anomaly_detection_for_team(team_id: UUID, db: Session) -> list[dict]:
        """
        Implements the weighted Euclidean distance anomaly detection
        formula from the specification document.

        Formula:
          D_{r,j} = sqrt( Σ_c ω_c * (Y_{r,j,c} - Ȳ_{-r,j,c})² )

        Where:
          Y_{r,j,c}   = judge r's score for team j on criterion c
          Ȳ_{-r,j,c}  = mean score from ALL OTHER judges on same criterion
          ω_c         = weight of criterion c

        An evaluation is flagged if its z-score > ANOMALY_THRESHOLD.

        Requires at least 3 evaluations to run (doc specification).
        Returns list of flagged evaluation dicts.
        """
        scorecards = db.query(Evaluation).filter(
            Evaluation.team_id == team_id
        ).all()

        for sc in scorecards:
            sc.is_flagged    = False
            sc.flag_reason   = None
            sc.anomaly_score = None

        if len(scorecards) < 3:
            db.commit()
            return []

        criteria = list(GRADING_CRITERIA.keys())
        weights  = np.array([GRADING_CRITERIA[c] for c in criteria])

        score_matrix = np.array([
            [sc.scores.get(c, 0.0) for c in criteria]
            for sc in scorecards
        ])

        distances = []
        for i, sc in enumerate(scorecards):
            # Consensus = mean of all OTHER evaluators (leave-one-out)
            peer_indices = [j for j in range(len(scorecards)) if j != i]
            peer_scores  = score_matrix[peer_indices]
            consensus    = np.mean(peer_scores, axis=0)

            my_scores    = score_matrix[i]

            # Weighted Euclidean distance
            distance = np.sqrt(np.sum(weights * (my_scores - consensus) ** 2))
            distances.append(distance)

        distances = np.array(distances)
        mean_dist = np.mean(distances)
        std_dist  = np.std(distances)

        flagged = []
        for i, sc in enumerate(scorecards):
            z_score = (distances[i] - mean_dist) / std_dist if std_dist > 0 else 0.0
            sc.anomaly_score = float(z_score)

            if z_score > ANOMALY_THRESHOLD:
                sc.is_flagged  = True
                sc.flag_reason = (
                    f"Score deviates significantly from panel consensus. "
                    f"Z-score: {z_score:.2f} (threshold: {ANOMALY_THRESHOLD}). "
                    f"Distance from consensus: {distances[i]:.3f}."
                )
                flagged.append({
                    "evaluation_id": str(sc.id),
                    "evaluator_id":  str(sc.evaluator_id),
                    "z_score":       float(z_score),
                    "distance":      float(distances[i]),
                })

        db.commit()
        return flagged

    # ── Score Consolidation ───────────────────────────────────────────

    @staticmethod
    def consolidate_all_teams(db: Session) -> dict:
        """
        Aggregates scores across all teams.
        Called by the Celery Beat hourly consolidation task.

        For each approved team:
          - Skips if any scorecard is still flagged (awaiting review)
          - Computes per-criterion averages across all evaluators
          - Computes weighted total score
          - Returns leaderboard-ready data
        """
        approved_teams = db.query(Team).filter(Team.is_approved == True).all()  # noqa: E712

        leaderboard  = []
        flagged_teams = 0
        criteria     = list(GRADING_CRITERIA.keys())
        weights      = GRADING_CRITERIA

        for team in approved_teams:
            scorecards = db.query(Evaluation).filter(
                Evaluation.team_id == team.id
            ).all()

            if not scorecards:
                continue

            has_flags = any(sc.is_flagged for sc in scorecards)
            if has_flags:
                flagged_teams += 1

            # Compute per-criterion averages
            avg_scores = {}
            for criterion in criteria:
                scores_for_criterion = [
                    sc.scores.get(criterion, 0.0) for sc in scorecards
                    if not sc.is_flagged   # exclude flagged cards from averages
                ]
                avg_scores[criterion] = (
                    round(np.mean(scores_for_criterion), 2)
                    if scores_for_criterion else 0.0
                )

            # Weighted total
            weighted_total = sum(
                avg_scores.get(c, 0.0) * weights[c]
                for c in criteria
            )

            leaderboard.append(TeamScoreSummary(
                team_id=team.id,
                team_name=team.team_name,
                evaluator_count=len(scorecards),
                average_scores=avg_scores,
                weighted_total=round(weighted_total, 3),
                has_flags=has_flags,
            ))

        # Sort by weighted total descending
        leaderboard.sort(key=lambda x: x.weighted_total, reverse=True)

        # Assign ranks (only to unflagged teams)
        rank = 1
        for entry in leaderboard:
            if not entry.has_flags:
                entry.rank = rank
                rank += 1

        return {
            "teams_processed":   len(leaderboard),
            "flagged_count":     flagged_teams,
            "leaderboard_ready": rank - 1,
            "leaderboard":       [e.model_dump() for e in leaderboard],
            "message": (
                f"Consolidated {len(leaderboard)} teams. "
                f"{flagged_teams} have flagged scorecards pending review. "
                f"{rank-1} teams are leaderboard-ready."
            )
        }


    @staticmethod
    def get_team_scorecards(team_id: UUID, db: Session) -> list[Evaluation]:
        """Returns all scorecards for a team."""
        return db.query(Evaluation).filter(Evaluation.team_id == team_id).all()

    @staticmethod
    def get_evaluator_scorecards(evaluator_id: str, db: Session) -> list[Evaluation]:
        """Returns all scorecards submitted by a specific evaluator."""
        return db.query(Evaluation).filter(
            Evaluation.evaluator_id == evaluator_id
        ).all()

    @staticmethod
    def get_flagged_scorecards(db: Session) -> list[Evaluation]:
        """Returns all flagged scorecards — shown on admin anomaly dashboard."""
        return (
            db.query(Evaluation)
            .filter(Evaluation.is_flagged == True)   # noqa: E712
            .order_by(Evaluation.submitted_at.desc())
            .all()
        )

    @staticmethod
    def clear_flag(evaluation_id: UUID, db: Session) -> Evaluation:
        """
        Admin manually clears a flag after reviewing.
        Once cleared, this scorecard counts toward the leaderboard.
        """
        evaluation = db.query(Evaluation).filter(
            Evaluation.id == evaluation_id
        ).first()
        if not evaluation:
            raise HTTPException(status_code=404, detail="Evaluation not found.")

        evaluation.is_flagged    = False
        evaluation.flag_reason   = "[Manually cleared by admin]"
        evaluation.anomaly_score = None
        db.commit()
        db.refresh(evaluation)
        return evaluation