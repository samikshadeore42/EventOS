# File: backend/app/services/score_service.py
import collections
import uuid
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
        event_id:     uuid.UUID, # <-- 1. Require Event Boundary
        evaluator_id: str,
        team_id:      UUID,
        scores:       dict,
        db:           Session
    ) -> Evaluation:
        from uuid import UUID as PyUUID
        evaluator_uuid = PyUUID(str(evaluator_id)) if not isinstance(evaluator_id, PyUUID) else evaluator_id

        # 2. Scope the uniqueness check
        existing = db.query(Evaluation).filter(
            Evaluation.event_id     == event_id,
            Evaluation.evaluator_id == evaluator_uuid,
            Evaluation.team_id      == team_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail="You have already submitted a scorecard for this team. Use PATCH to update it."
            )

        # 3. Scope team lookup
        team = db.query(Team).filter(
            Team.id == team_id,
            Team.event_id == event_id
        ).first()
        
        if not team:
            raise HTTPException(status_code=404, detail="Team not found in this event.")
        if not team.is_approved:
            raise HTTPException(
                status_code=422,
                detail="Cannot submit scores for a team that has not been approved yet."
            )

        # 4. Bind the scorecard to the event
        evaluation = Evaluation(
            event_id=event_id,
            team_id=team_id,
            evaluator_id=evaluator_uuid,
            scores=scores,
            score_hash=generate_score_hash(evaluator_uuid, team_id, scores),
            is_flagged=False
        )
        db.add(evaluation)
        db.commit()
        db.refresh(evaluation)

        ScoreService.run_anomaly_detection_for_team(event_id, team_id, db)
        db.refresh(evaluation)

        return evaluation

    # ── Helper: build detector-ready entries from DB rows ─────────────

    @staticmethod
    def _build_panel_entries(event_id: uuid.UUID, evaluations: list[Evaluation], db: Session) -> list[dict]:
        def normalize_institution(value: str | None) -> str:
            return " ".join((value or "").strip().lower().split())

        team_ids      = {ev.team_id      for ev in evaluations}
        evaluator_ids = {ev.evaluator_id for ev in evaluations}

        # Securely scope batch lookups
        teams = {
            t.id: t
            for t in db.query(Team).filter(
                Team.id.in_(team_ids),
                Team.event_id == event_id
            ).all()
        }
        evaluators = {
            e.id: e
            for e in db.query(Evaluator).filter(
                Evaluator.id.in_(evaluator_ids),
                Evaluator.event_id == event_id
            ).all()
        }

        entries = []
        for ev in evaluations:
            team      = teams.get(ev.team_id)
            evaluator = evaluators.get(ev.evaluator_id)

            member_institutions = (
                list({normalize_institution(m.institution) for m in team.members if m.institution})
                if team and team.members else []
            )

            evaluator_institution = (
                getattr(evaluator, "passed_out_institution", None)
                or getattr(evaluator, "institution", None)
                or ""
            )
            evaluator_institution = normalize_institution(evaluator_institution)

            evaluator_name = (
                f"{evaluator.first_name} {evaluator.last_name}"
                if evaluator else "Unknown Evaluator"
            )

            entries.append({
                "judge_id":                 str(ev.evaluator_id),
                "judge_name":               evaluator_name,
                "judge_institution":        evaluator_institution,
                "team_id":                  str(ev.team_id),
                "team_name":                team.team_name if team else str(ev.team_id),
                "team_member_institutions": member_institutions,
                "scores": {
                    c: float(ev.scores.get(c, 0.0)) for c in GRADING_CRITERIA.keys()
                },
            })
        return entries

    # ── Anomaly Detection (per-team) ──────────────────────────────────

    @staticmethod
    def run_anomaly_detection_for_team(event_id: uuid.UUID, team_id: UUID, db: Session) -> list[dict]:
        # Scope score lookup to the event
        scorecards = db.query(Evaluation).filter(
            Evaluation.team_id == team_id,
            Evaluation.event_id == event_id
        ).all()

        for sc in scorecards:
            sc.is_flagged    = False
            sc.flag_reason   = None
            sc.anomaly_score = None

        if len(scorecards) < 3:
            db.commit()
            return []

        entries = ScoreService._build_panel_entries(event_id, scorecards, db)

        panel = build_panel_from_dicts(
            raw_entries = entries,
            criteria    = list(GRADING_CRITERIA.keys()),
            weights     = GRADING_CRITERIA,
        )

        detector = AnomalyDetector(
            panel,
            z_score_threshold = ANOMALY_THRESHOLD,
        )
        report = detector.detect_all()

        scorecard_by_key = {
            (str(sc.evaluator_id), str(sc.team_id)): sc for sc in scorecards
        }

        aggregated_reasons: dict[tuple, list[str]] = {}
        max_metric: dict[tuple, float] = {}

        for anom in report.anomalies:
            if anom.team_id is None:
                continue
            key = (anom.judge_id, anom.team_id)
            if key not in scorecard_by_key:
                continue
            aggregated_reasons.setdefault(key, []).append(anom.explanation)
            max_metric[key] = max(max_metric.get(key, 0.0), float(anom.metric))

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
                "z_score":  max_metric[key],
                "distance": max_metric[key],
            })

        db.commit()
        return flagged

    # ── Anomaly Detection (panel-wide) ────────────────────────────────

    @staticmethod
    def run_full_panel_anomaly_sweep(event_id: uuid.UUID, db: Session) -> dict:
        # Prevent the sweep from checking other events
        all_evals = db.query(Evaluation).filter(Evaluation.event_id == event_id).all()

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
                    f"Not enough scorecards to run detection in this event "
                    f"({len(all_evals)} present, need ≥3)."
                ),
            }

        entries = ScoreService._build_panel_entries(event_id, all_evals, db)

        panel = build_panel_from_dicts(
            raw_entries = entries,
            criteria    = list(GRADING_CRITERIA.keys()),
            weights     = GRADING_CRITERIA,
        )
        detector = AnomalyDetector(panel, z_score_threshold=ANOMALY_THRESHOLD)
        report = detector.detect_all()

        cards_by_evaluator: dict[str, list[Evaluation]] = {}
        cards_by_key:       dict[tuple, Evaluation]     = {}
        for sc in all_evals:
            cards_by_evaluator.setdefault(str(sc.evaluator_id), []).append(sc)
            cards_by_key[(str(sc.evaluator_id), str(sc.team_id))] = sc

        aggregated_reasons: dict = {}
        max_metric:         dict = {}

        for anom in report.anomalies:
            if anom.team_id is None:
                for sc in cards_by_evaluator.get(anom.judge_id, []):
                    aggregated_reasons.setdefault(sc.id, []).append(anom.explanation)
                    max_metric[sc.id] = max(max_metric.get(sc.id, 0.0), float(anom.metric))
            else:
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
    def consolidate_all_teams(event_id: uuid.UUID, db: Session) -> dict:
        from sqlalchemy.orm import joinedload
        from collections import defaultdict
        
        # 1. Scope teams strictly to THIS event
        approved_teams = (
            db.query(Team)
            .filter(Team.is_approved == True, Team.event_id == event_id)
            .options(joinedload(Team.members))
            .all() 
        )

        if not approved_teams:
            return{
                "teams_processed":   0,
                "flagged_count":     0,
                "leaderboard_ready": 0,
                "leaderboard":       [],
                "message": "No approved teams to consolidate in this event."
            }
        
        team_ids = [t.id for t in approved_teams]
        
        # 2. Scope evaluations to THIS event
        all_evaluations = (
            db.query(Evaluation)
            .filter(
                Evaluation.team_id.in_(team_ids),
                Evaluation.event_id == event_id
            ).all()
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

            avg_scores = {}
            for criterion in criteria:
                scores_for_criterion = [
                    sc.scores.get(criterion, 0.0) for sc in scorecards
                    if not sc.is_flagged
                ]
                avg_scores[criterion] = (
                    round(float(np.mean(scores_for_criterion)), 2)
                    if scores_for_criterion else 0.0
                )

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

        leaderboard.sort(key=lambda x: x.weighted_total, reverse=True)

        rank = 1
        for entry in leaderboard:
            if not entry.has_flags:
                entry.rank = rank
                rank += 1
        
        try:
            from app.models.event import Event
            from app.models.assignment import EvaluatorTeamAssignment
            from app.models.participant import Participant
            from app.services.notification_service import NotificationService

            event = db.query(Event).filter(Event.id == event_id).first()
            event_name = event.name if event else "the event"

            total_assignments = db.query(EvaluatorTeamAssignment).filter(
                EvaluatorTeamAssignment.event_id == event_id,
            ).count()

            submitted = db.query(Evaluation).filter(
                Evaluation.event_id == event_id,
            ).count()

            if total_assignments > 0 and submitted >= total_assignments:
                NotificationService(db, event_id).enqueue(
                    "results_announced",
                    f"Results announced for {event_name}",
                    f"The results for {event_name} have been announced. Check the results tab.",
                    role="participant",
                    idempotency_key=f"results-announced:{event_id}",
                )
        except Exception:
            db.rollback()

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
    def get_team_scorecards(event_id: uuid.UUID, team_id: UUID, db: Session) -> list[Evaluation]:
        return db.query(Evaluation).filter(
            Evaluation.team_id == team_id,
            Evaluation.event_id == event_id
        ).all()

    @staticmethod
    def get_evaluator_scorecards(event_id: uuid.UUID, evaluator_id: str, db: Session) -> list[Evaluation]:
        return db.query(Evaluation).filter(
            Evaluation.evaluator_id == evaluator_id,
            Evaluation.event_id == event_id
        ).all()

    @staticmethod
    def get_flagged_scorecards(event_id: uuid.UUID, db: Session) -> list[Evaluation]:
        return (
            db.query(Evaluation)
            .filter(
                Evaluation.is_flagged == True,
                Evaluation.event_id == event_id
            )
            .order_by(Evaluation.submitted_at.desc())
            .all()
        )

    @staticmethod
    def clear_flag(event_id: uuid.UUID, evaluation_id: UUID, db: Session) -> Evaluation:
        evaluation = db.query(Evaluation).filter(
            Evaluation.id == evaluation_id,
            Evaluation.event_id == event_id
        ).first()
        if not evaluation:
            raise HTTPException(status_code=404, detail="Evaluation not found in this event.")

        evaluation.is_flagged    = False
        evaluation.flag_reason   = "[Manually cleared by admin]"
        evaluation.anomaly_score = None
        db.commit()
        db.refresh(evaluation)
        return evaluation