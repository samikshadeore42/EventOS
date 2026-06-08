# File: backend/app/api/leaderboard_routes.py

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.evaluation import Evaluation
from app.models.participant import Team
from app.services.score_service import ScoreService

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])


# ── GET /leaderboard — full ranked leaderboard ────────────────────────

@router.get(
    "",
    summary="Get the full ranked team leaderboard",
    description=(
        "Returns teams ranked by weighted score. "
        "Teams with active anomaly flags are listed but not ranked "
        "until flags are cleared by admin."
    )
)
def get_leaderboard(db: Session = Depends(get_db)):
    return ScoreService.consolidate_all_teams(db)


# ── GET /leaderboard/anomalies — all flagged scorecards ───────────────

@router.get(
    "/anomalies",
    summary="Get all anomaly-flagged scorecards pending admin review",
)
def get_anomalies(db: Session = Depends(get_db)):
    flagged = ScoreService.get_flagged_scorecards(db)
    
    # Fetch team names for the flagged scorecards
    team_ids = {sc.team_id for sc in flagged}
    teams = {t.id: t for t in db.query(Team).filter(Team.id.in_(team_ids)).all()} if team_ids else {}
    
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
    description=(
        "After manual review, admin clears the flag. "
        "The scorecard then counts toward the team's final score."
    )
)
def override_anomaly(evaluation_id: UUID, db: Session = Depends(get_db)):
    evaluation = ScoreService.clear_flag(evaluation_id, db)

    # Re-run consolidation so leaderboard reflects the change immediately
    ScoreService.run_anomaly_detection_for_team(evaluation.team_id, db)

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
    description="Use with caution — clears ALL flags without individual review."
)
def override_all_anomalies(db: Session = Depends(get_db)):
    flagged = ScoreService.get_flagged_scorecards(db)
    if not flagged:
        return {"message": "No flagged scorecards to clear.", "cleared": 0}

    cleared_team_ids = set()
    for sc in flagged:
        sc.is_flagged    = False
        sc.flag_reason   = "[Bulk cleared by admin]"
        sc.anomaly_score = None
        cleared_team_ids.add(sc.team_id)

    db.commit()

    # Re-run anomaly detection for all affected teams
    for team_id in cleared_team_ids:
        ScoreService.run_anomaly_detection_for_team(team_id, db)

    return {
        "message": f"Cleared {len(flagged)} flags across {len(cleared_team_ids)} teams.",
        "cleared": len(flagged)
    }
