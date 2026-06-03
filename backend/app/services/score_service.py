# File: backend/app/services/score_service.py
# Two responsibilities:
#   1. Anomaly detection — flags scorecards that deviate too far from
#      the panel consensus. Delegates to the AnomalyDetector module
#      (services/anomaly_detector.py) so all four detection methods
#      (z-score, weighted Euclidean divergence, intra-rater consistency,
#      conflict-of-interest) live in one place.
#   2. Score consolidation — aggregates all scorecards per team,
#      computes weighted totals, builds leaderboard data
import collections

import numpy as np
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.evaluation import Evaluation, Evaluator
from app.models.participant import Team
from app.schemas.evaluation_schemas import TeamScoreSummary
from app.services.anomaly_detector import AnomalyDetector, build_panel_from_dicts
from app.core.security import generate_score_hash

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

        calculated_hash = generate_score_hash(evaluator_id,team_id,scores)
        # Save scorecard
        evaluation = Evaluation(
            team_id=team_id,
            evaluator_id=evaluator_id,
            scores=scores,
            score_hash=calculated_hash,
            is_flagged=False
        )
        db.add(evaluation)
        db.commit()
        db.refresh(evaluation)

        # Run anomaly detection — this may update is_flagged
        ScoreService.run_anomaly_detection_for_team(team_id, db)
        db.refresh(evaluation)

        return evaluation

    # ── Helper: build detector-ready entries from DB rows ─────────────

    @staticmethod
    def _build_panel_entries(evaluations: list[Evaluation], db: Session) -> list[dict]:
        """
        Convert DB Evaluations → entry dicts in the shape the detector expects.

        Batch-loads related Team and Evaluator rows to avoid N+1 queries.
        Pulls team member institutions for the COI detector; pulls evaluator
        institution if the field exists on the model (currently it doesn't,
        so COI detection silently passes through — see class docstring above).
        """
        team_ids      = {ev.team_id      for ev in evaluations}
        evaluator_ids = {ev.evaluator_id for ev in evaluations}

        teams = {
            t.id: t
            for t in db.query(Team).filter(Team.id.in_(team_ids)).all()
        }
        evaluators = {
            e.id: e
            for e in db.query(Evaluator).filter(Evaluator.id.in_(evaluator_ids)).all()
        }

        entries = []
        for ev in evaluations:
            team      = teams.get(ev.team_id)
            evaluator = evaluators.get(ev.evaluator_id)

            # Team member institutions — used by the COI detector
            member_institutions = (
                list({m.institution for m in team.members})
                if team and team.members else []
            )

            # Evaluator institution: uses passed_out_institution (added in
            # the portal-workflow-polish branch). Falls back to legacy
            # "institution" field if it somehow exists, then empty string.
            evaluator_institution = (
                getattr(evaluator, "passed_out_institution", None)
                or getattr(evaluator, "institution", None)
                or ""
            )
            # Normalize for consistent COI matching
            evaluator_institution = " ".join(evaluator_institution.strip().lower().split())

            evaluator_name = (
                f"{evaluator.first_name} {evaluator.last_name}"
                if evaluator else "Unknown Evaluator"
            )

            entries.append({
                "judge_id":                 str(ev.evaluator_id),
                "judge_name":               evaluator_name,
                "judge_institution":        evaluator_institution,
                "team_id":                  str(ev.team_id),
                "team_member_institutions": member_institutions,
                "scores": {
                    c: float(ev.scores.get(c, 0.0)) for c in GRADING_CRITERIA.keys()
                },
            })
        return entries

    # ── Anomaly Detection (per-team) ──────────────────────────────────

    @staticmethod
    def run_anomaly_detection_for_team(team_id: UUID, db: Session) -> list[dict]:
        """
        Per-team anomaly detection. Called after every score submission
        and every score update.

        Wraps the AnomalyDetector module — the single source of truth for
        anomaly logic. Within a single team's panel these detectors are
        meaningful:
          - Z-score outliers (per-criterion)
          - Weighted Euclidean divergence
          - Conflict-of-interest (inert until Evaluator.institution exists)

        Intra-rater consistency only fires in panel-wide mode (see
        run_full_panel_anomaly_sweep) — it needs a judge to have rated
        multiple teams to detect halo/horns or no-differentiation patterns.

        Requires at least 3 evaluations for the team (per spec).
        Returns list of flagged-scorecard dicts. Shape preserved for
        backwards compatibility with previous callers.
        """
        scorecards = db.query(Evaluation).filter(
            Evaluation.team_id == team_id
        ).all()

        # Reset all flags before re-evaluation
        for sc in scorecards:
            sc.is_flagged    = False
            sc.flag_reason   = None
            sc.anomaly_score = None

        if len(scorecards) < 3:
            db.commit()
            return []

        # ── Build the panel and run the detector ──────────────────────
        entries = ScoreService._build_panel_entries(scorecards, db)

        panel = build_panel_from_dicts(
            raw_entries = entries,
            criteria    = list(GRADING_CRITERIA.keys()),
            weights     = GRADING_CRITERIA,
        )

        detector = AnomalyDetector(
            panel,
            z_score_threshold = ANOMALY_THRESHOLD,
            # Other thresholds use detector defaults tuned for a 1-10 scale
        )
        report = detector.detect_all()

        # ── Map anomalies back to scorecards ──────────────────────────
        # An evaluation may be flagged by multiple detectors. Concatenate
        # explanations with " | " and take the max metric as anomaly_score.
        scorecard_by_key = {
            (str(sc.evaluator_id), str(sc.team_id)): sc for sc in scorecards
        }

        aggregated_reasons: dict[tuple, list[str]] = {}
        max_metric: dict[tuple, float] = {}

        for anom in report.anomalies:
            # Judge-level anomalies (team_id=None) don't apply per-team
            if anom.team_id is None:
                continue
            key = (anom.judge_id, anom.team_id)
            if key not in scorecard_by_key:
                continue
            aggregated_reasons.setdefault(key, []).append(anom.explanation)
            max_metric[key] = max(max_metric.get(key, 0.0), float(anom.metric))

        # ── Write flags back to DB ────────────────────────────────────
        flagged = []
        for key, sc in scorecard_by_key.items():
            if key not in aggregated_reasons:
                continue
            sc.is_flagged    = True
            sc.flag_reason   = " | ".join(aggregated_reasons[key])
            sc.anomaly_score = max_metric[key]

            flagged.append({
                "evaluation_id": str(sc.id),
                "evaluator_id":  str(sc.evaluator_id),
                # Kept for backwards compatibility with previous callers.
                # Both fields now reflect the maximum metric across whichever
                # detector(s) flagged this card.
                "z_score":  max_metric[key],
                "distance": max_metric[key],
            })

        db.commit()
        return flagged

    # ── Anomaly Detection (panel-wide) ────────────────────────────────

    @staticmethod
    def run_full_panel_anomaly_sweep(db: Session) -> dict:
        """
        Panel-wide anomaly detection across ALL teams' scorecards at once.

        Activates the intra-rater consistency detector — no-differentiation
        and halo/horns patterns can only be seen across a judge's full
        scoring history, never within a single team's data.

        Used by the scheduled anomaly sweep (Celery beat, every 30 min).
        Replaces the previous per-team loop, which couldn't see consistency
        patterns at all.

        Writes flag updates to each Evaluation row in the database.
        Returns a summary dict for logging/observability.
        """
        all_evals = db.query(Evaluation).all()

        # Reset every scorecard's flag before re-evaluating
        for sc in all_evals:
            sc.is_flagged    = False
            sc.flag_reason   = None
            sc.anomaly_score = None

        if len(all_evals) < 3:
            db.commit()
            return {
                "evaluations_processed": len(all_evals),
                "teams_checked":         len({sc.team_id for sc in all_evals}),
                "total_flagged":         0,
                "anomaly_breakdown":     {},
                "message": (
                    f"Not enough scorecards to run detection "
                    f"({len(all_evals)} present, need ≥3)."
                ),
            }

        entries = ScoreService._build_panel_entries(all_evals, db)

        panel = build_panel_from_dicts(
            raw_entries = entries,
            criteria    = list(GRADING_CRITERIA.keys()),
            weights     = GRADING_CRITERIA,
        )
        detector = AnomalyDetector(panel, z_score_threshold=ANOMALY_THRESHOLD)
        report = detector.detect_all()

        # Helper indices for mapping anomalies → scorecards
        cards_by_evaluator: dict[str, list[Evaluation]] = {}
        cards_by_key:       dict[tuple, Evaluation]     = {}
        for sc in all_evals:
            cards_by_evaluator.setdefault(str(sc.evaluator_id), []).append(sc)
            cards_by_key[(str(sc.evaluator_id), str(sc.team_id))] = sc

        aggregated_reasons: dict = {}
        max_metric:         dict = {}

        for anom in report.anomalies:
            if anom.team_id is None:
                # Judge-level: flag every scorecard by that judge
                for sc in cards_by_evaluator.get(anom.judge_id, []):
                    aggregated_reasons.setdefault(sc.id, []).append(anom.explanation)
                    max_metric[sc.id] = max(max_metric.get(sc.id, 0.0), float(anom.metric))
            else:
                # Per-team: flag the specific scorecard
                key = (anom.judge_id, anom.team_id)
                sc  = cards_by_key.get(key)
                if sc is None:
                    continue
                aggregated_reasons.setdefault(sc.id, []).append(anom.explanation)
                max_metric[sc.id] = max(max_metric.get(sc.id, 0.0), float(anom.metric))

        flagged_count = 0
        for sc in all_evals:
            if sc.id in aggregated_reasons:
                sc.is_flagged    = True
                sc.flag_reason   = " | ".join(aggregated_reasons[sc.id])
                sc.anomaly_score = max_metric[sc.id]
                flagged_count += 1

        db.commit()

        return {
            "evaluations_processed": len(all_evals),
            "teams_checked":         len({sc.team_id for sc in all_evals}),
            "total_flagged":         flagged_count,
            "anomaly_breakdown":     report.by_kind,
            "by_severity":           report.by_severity,
            "holds_results_release": report.holds_results_release,
            "message": (
                f"Panel-wide sweep complete. "
                f"{flagged_count}/{len(all_evals)} scorecards flagged. "
                f"Breakdown: {report.by_kind}"
            ),
        }

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
        from sqlalchemy.orm import joinedload
        from collections import defaultdict
        
        approved_teams = ( db.query(Team).filter(Team.is_approved == True).options(joinedload(Team.members)).all() )

        if not approved_teams:
            return{
                "teams_processed":   0,
                "flagged_count":     0,
                "leaderboard_ready": 0,
                "leaderboard":       [],
                "message": "No approved teams to consolidate."
            }
        
        team_ids = [t.id for t in approved_teams]
        all_evaluations = (
            db.query(Evaluation)
            .filter(Evaluation.team_id.in_(team_ids))
            .all()
        )
        
        evals_by_team = defaultdict(list)
        for ev in all_evaluations:
            evals_by_team[str(ev.team_id)].append(ev)
            
        leaderboard  = []
        flagged_teams = 0
        criteria     = list(GRADING_CRITERIA.keys())
        weights      = GRADING_CRITERIA

        for team in approved_teams:
            scorecards = evals_by_team[str(team.id)]

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
                    round(float(np.mean(scores_for_criterion)), 2)
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
                weighted_total=round(float(weighted_total), 3),
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
