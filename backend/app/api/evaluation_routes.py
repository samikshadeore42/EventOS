# File: backend/app/api/evaluation_routes.py
# Multi-criteria score submission API.

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- Import Bouncer
from app.core.security import decode_access_token, parse_uuid_subject
from app.models.evaluation import Evaluation, Evaluator
from app.services.score_service import ScoreService
from app.models.assignment import EvaluatorTeamAssignment
from app.core.security import generate_score_hash
from app.schemas.evaluation_schemas import (
    ScoreSubmissionRequest,
    ScoreUpdateRequest,
    EvaluationResponse,
)

# 1. Update Prefix
router = APIRouter(prefix="/events/{event_id}/evaluations", tags=["Evaluations"])

@router.post(
    "",
    response_model=EvaluationResponse,
    status_code=201,
    summary="Submit a scorecard for a team",
)
def submit_scorecard(
    body:        ScoreSubmissionRequest,
    token:       str     = Query(..., description="Evaluator's JWT from their portal link"),
    scope:       ScopedEventService = Depends(get_event_scope)
):
    payload = decode_access_token(token)
    token_event_id = payload.get("event_id")

    # 2. Cryptographic event boundary check
    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch. This link belongs to a different event.")

    if payload.get("role") != "evaluator":
        raise HTTPException(
            status_code=403,
            detail="Only evaluators can submit scorecards."
        )

    evaluator_id = parse_uuid_subject(payload.get("sub"), "evaluator ID")

    # 3. Verify evaluator exists in THIS event
    evaluator = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found in this event.")
    if not evaluator.is_active:
        raise HTTPException(status_code=403, detail="Your evaluator account is inactive.")

    # 4. Verify assignment exists in THIS event
    assigned = scope.db.query(EvaluatorTeamAssignment).filter_by(
        evaluator_id=evaluator_id,
        team_id=body.team_id,
        event_id=scope.event_id
    ).first()
    
    if not assigned:
        raise HTTPException(
            status_code=403,
            detail="Access Denied: You are not assigned to evaluate this team."
        )
        
    return ScoreService.submit_scorecard(
        event_id=scope.event_id, # Pass boundary down
        evaluator_id=evaluator_id,
        team_id=body.team_id,
        scores=body.scores,
        db=scope.db
    )

@router.patch(
    "/{evaluation_id}",
    response_model=EvaluationResponse,
    summary="Update an existing scorecard",
)
def update_scorecard(
    evaluation_id: UUID,
    body:          ScoreUpdateRequest,
    token:         str     = Query(..., description="Evaluator's JWT"),
    scope:         ScopedEventService = Depends(get_event_scope)
):
    payload      = decode_access_token(token)
    token_event_id = payload.get("event_id")

    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    if payload.get("role") != "evaluator":
        raise HTTPException(
            status_code=403,
            detail="Only evaluators can update scorecards."
        )

    evaluator_id = parse_uuid_subject(payload.get("sub"), "evaluator ID")

    evaluation = scope.db.query(Evaluation).filter(
        Evaluation.id           == evaluation_id,
        Evaluation.evaluator_id == evaluator_id,
        Evaluation.event_id     == scope.event_id
    ).first()

    if not evaluation:
        raise HTTPException(
            status_code=404,
            detail="Scorecard not found or you don't have permission to edit it."
        )

    evaluation.scores = body.scores
    evaluation.score_hash = generate_score_hash(evaluator_id, evaluation.team_id, body.scores)
    scope.db.commit()
    scope.db.refresh(evaluation)

    ScoreService.run_anomaly_detection_for_team(scope.event_id, evaluation.team_id, scope.db)
    scope.db.refresh(evaluation)

    return evaluation


@router.get(
    "/team/{team_id}",
    summary="Get all scorecards for a specific team",
)
def get_team_scorecards(team_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    scorecards = ScoreService.get_team_scorecards(scope.event_id, team_id, scope.db)
    return {
        "team_id":   str(team_id),
        "count":     len(scorecards),
        "scorecards": [
            {
                "id":            str(sc.id),
                "evaluator_id":  str(sc.evaluator_id),
                "scores":        sc.scores,
                "is_flagged":    sc.is_flagged,
                "anomaly_score": sc.anomaly_score,
                "submitted_at":  sc.submitted_at.isoformat(),
            }
            for sc in scorecards
        ]
    }

@router.get(
    "/flagged",
    summary="Get all flagged scorecards pending admin review",
)
def get_flagged_scorecards(scope: ScopedEventService = Depends(get_event_scope)):
    flagged = ScoreService.get_flagged_scorecards(scope.event_id, scope.db)
    return {
        "total_flagged": len(flagged),
        "scorecards": [
            {
                "id":            str(sc.id),
                "team_id":       str(sc.team_id),
                "evaluator_id":  str(sc.evaluator_id),
                "scores":        sc.scores,
                "flag_reason":   sc.flag_reason,
                "anomaly_score": sc.anomaly_score,
                "submitted_at":  sc.submitted_at.isoformat(),
            }
            for sc in flagged
        ]
    }


@router.post(
    "/flags/{evaluation_id}/clear",
    response_model=EvaluationResponse,
    summary="Admin clears an anomaly flag after manual review",
)
def clear_flag(evaluation_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    return ScoreService.clear_flag(scope.event_id, evaluation_id, scope.db)


@router.get(
    "/leaderboard",
    summary="Get consolidated team leaderboard",
)
def get_leaderboard(scope: ScopedEventService = Depends(get_event_scope)):
    return ScoreService.consolidate_all_teams(scope.event_id, scope.db)


@router.get(
    "/audit-integrity", 
    summary="Run a cryptographic audit on all scores to detect database tampering"
)
def audit_score_integrity(scope: ScopedEventService = Depends(get_event_scope)):
    # Scope the audit to just THIS event
    evaluations = scope.db.query(Evaluation).filter(Evaluation.event_id == scope.event_id).all()
    tampered_records = []
    audited_count = 0
    
    for eval_record in evaluations:
        if not eval_record.score_hash:
            continue
            
        audited_count += 1
        expected_hash = generate_score_hash(
            evaluator_id=eval_record.evaluator_id, 
            team_id=eval_record.team_id, 
            scores=eval_record.scores
        )
        if expected_hash != eval_record.score_hash:
            tampered_records.append({
                "evaluation_id": str(eval_record.id),
                "team_id": str(eval_record.team_id),
                "evaluator_id": str(eval_record.evaluator_id),
                "issue": "Cryptographic signature mismatch. Data was tampered with."
            })
            
    is_secure = len(tampered_records) == 0
    
    return {
        "status": "success",
        "is_secure": is_secure,
        "total_audited": audited_count,
        "tampered_records": tampered_records,
        "message": "Zero-Trust Audit Complete. All signatures match." if is_secure else f"ALERT: {len(tampered_records)} tampered records found in this event!"
    }