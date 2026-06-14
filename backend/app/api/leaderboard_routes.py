# File: backend/app/api/leaderboard_routes.py

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- Import Bouncer
from app.models.evaluation import Evaluation, Evaluator
from app.models.participant import Team
from app.services.score_service import ScoreService

# 1. Update Prefix
router = APIRouter(prefix="/events/{event_id}/leaderboard", tags=["Leaderboard"])


# ── GET /leaderboard — full ranked leaderboard ────────────────────────

@router.get(
    "",
    summary="Get the full ranked team leaderboard",
)
def get_leaderboard(scope: ScopedEventService = Depends(get_event_scope)):
    return ScoreService.consolidate_all_teams(scope.event_id, scope.db)


# ── GET /leaderboard/anomalies — all flagged scorecards ───────────────

@router.get(
    "/anomalies",
    summary="Get all anomaly-flagged scorecards pending admin review",
)
def get_anomalies(scope: ScopedEventService = Depends(get_event_scope)):
    flagged = ScoreService.get_flagged_scorecards(scope.event_id, scope.db)
    
    team_ids = {sc.team_id for sc in flagged}
    teams = {
        t.id: t for t in scope.db.query(Team).filter(
            Team.id.in_(team_ids),
            Team.event_id == scope.event_id
        ).all()
    } if team_ids else {}
    
    evaluator_ids = {sc.evaluator_id for sc in flagged}
    evaluators = {
        e.id: e for e in scope.db.query(Evaluator).filter(
            Evaluator.id.in_(evaluator_ids),
            Evaluator.event_id == scope.event_id
        ).all()
    } if evaluator_ids else {}
    
    return {
        "total_flagged": len(flagged),
        "message": (
            "These scorecards deviate significantly from panel consensus. "
            "Review and clear each flag to include them in the leaderboard."
        ) if flagged else "No flagged scorecards. All evaluations are within consensus.",
        "scorecards": [
            {
                "id":            str(sc.id),
                "team_id":       str(sc.team_id),
                "team_name":     teams.get(sc.team_id).team_name if teams.get(sc.team_id) else "Unknown Team",
                "total_score":   sum(float(v) for v in sc.scores.values()) if sc.scores else 0,
                "evaluator_id":  str(sc.evaluator_id),
                "evaluator_name": f"{evaluators.get(sc.evaluator_id).first_name} {evaluators.get(sc.evaluator_id).last_name}" if evaluators.get(sc.evaluator_id) else "Unknown",
                "scores":        sc.scores,
                "flag_reason":   sc.flag_reason,
                "anomaly_score": round(sc.anomaly_score, 3) if sc.anomaly_score else None,
                "submitted_at":  sc.submitted_at.isoformat(),
            }
            for sc in flagged
        ]
    }


# ── POST /leaderboard/anomalies/{id}/override — admin clears a flag ───

@router.post(
    "/anomalies/{evaluation_id}/override",
    summary="Admin overrides an anomaly flag — includes scorecard in leaderboard",
)
def override_anomaly(evaluation_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    evaluation = ScoreService.clear_flag(scope.event_id, evaluation_id, scope.db)

    ScoreService.run_anomaly_detection_for_team(scope.event_id, evaluation.team_id, scope.db)

    return {
        "message":       "Flag cleared. Scorecard now counts toward leaderboard.",
        "evaluation_id": str(evaluation.id),
        "team_id":       str(evaluation.team_id),
        "is_flagged":    evaluation.is_flagged
    }


# ── POST /leaderboard/anomalies/override-all — bulk clear all flags ───

@router.post(
    "/anomalies/override-all",
    summary="Admin bulk-clears all anomaly flags",
)
def override_all_anomalies(scope: ScopedEventService = Depends(get_event_scope)):
    flagged = ScoreService.get_flagged_scorecards(scope.event_id, scope.db)
    if not flagged:
        return {"message": "No flagged scorecards to clear.", "cleared": 0}

    cleared_team_ids = set()
    for sc in flagged:
        sc.is_flagged    = False
        sc.flag_reason   = "[Bulk cleared by admin]"
        sc.anomaly_score = None
        cleared_team_ids.add(sc.team_id)

    scope.db.commit()

    for team_id in cleared_team_ids:
        ScoreService.run_anomaly_detection_for_team(scope.event_id, team_id, scope.db)

    return {
        "message": f"Cleared {len(flagged)} flags across {len(cleared_team_ids)} teams.",
        "cleared": len(flagged)
    }