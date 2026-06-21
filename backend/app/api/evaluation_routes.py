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
from app.core.auth_deps import RequireOrganizationRole
from app.schemas.evaluation_schemas import (
    ScoreSubmissionRequest,
    ScoreUpdateRequest,
    EvaluationResponse,
)
from app.schemas.ai_schemas import AITaskEnqueueResponse, RubricRequest, RubricResult, CriterionRubric
from app.services.task_tracker import TaskTracker
from app.tasks.ai_tasks import generate_rubric_task
from app.services.portal_notification_service import (
    list_for_evaluator,
    unread_count_for_evaluator,
    mark_read_by_role,
    mark_all_read_by_role,
    evaluator_role_key,
)

# 1. Update Prefix
router = APIRouter(prefix="/events/{event_id}/evaluations", tags=["Evaluations"])

def _require_evaluator_portal_access(token: str, scope: ScopedEventService) -> Evaluator:
    payload = decode_access_token(token)
    token_event_id = payload.get("event_id")

    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch. This link belongs to a different event.")

    if payload.get("role") != "evaluator":
        raise HTTPException(status_code=403, detail="Only evaluators can access this resource.")

    evaluator_id = parse_uuid_subject(payload.get("sub"), "evaluator ID")

    evaluator = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id,
    ).first()

    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found in this event.")

    if not evaluator.is_active:
        raise HTTPException(status_code=403, detail="Your evaluator account is inactive.")

    return evaluator

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


@router.post(
    "/ai-rubric",
    response_model=AITaskEnqueueResponse,
    status_code=202,
    summary="Generate an AI scoring guide for evaluator portal",
)
def generate_evaluator_ai_rubric(
    body: RubricRequest,
    token: str = Query(..., description="Evaluator JWT from portal link"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    evaluator = _require_evaluator_portal_access(token, scope)

    team_context = body.team_context or {}
    team_id = team_context.get("team_id")

    if team_id:
        try:
            team_uuid = UUID(str(team_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid team_id in team_context.")

        assigned = scope.db.query(EvaluatorTeamAssignment).filter_by(
            evaluator_id=evaluator.id,
            team_id=team_uuid,
            event_id=scope.event_id,
        ).first()

        if not assigned:
            raise HTTPException(status_code=403, detail="You are not assigned to evaluate this team.")

    event_name = body.event_name
    if not event_name or event_name == "the event":
        event_name = scope.event.name

    task = generate_rubric_task.delay(
        body.challenge_area,
        body.criteria,
        event_name,
        team_context,
    )

    return AITaskEnqueueResponse(
        task_id=task.id,
        status_url=f"/tasks/{task.id}/status",
        result_url=f"/events/{scope.event_id}/evaluations/ai-rubric/{task.id}",
        message="AI scoring guide generation enqueued. Poll the result endpoint until it completes.",
    )


@router.get(
    "/ai-rubric/{task_id}",
    response_model=RubricResult,
    summary="Fetch generated evaluator AI scoring guide",
)
def get_evaluator_ai_rubric_result(
    task_id: str,
    token: str = Query(..., description="Evaluator JWT from portal link"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    _require_evaluator_portal_access(token, scope)

    status = TaskTracker.get_status(task_id)

    if not status:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")

    if status.get("task_type") != "ai_rubric":
        raise HTTPException(status_code=400, detail="This task is not an AI rubric task.")

    if status["status"] in ("running", "pending", "retrying"):
        raise HTTPException(status_code=425, detail="AI scoring guide is still generating.")

    if status["status"] == "failed":
        raise HTTPException(status_code=500, detail=status.get("error") or "AI scoring guide generation failed.")

    result = status.get("result")
    if not result:
        raise HTTPException(status_code=500, detail="AI rubric task completed but result is missing.")

    return RubricResult(criteria=[CriterionRubric(**c) for c in result["criteria"]])

@router.get("/portal/notifications", summary="Evaluator: list own notifications")
def evaluator_portal_notifications(
    unread_only: bool = False,
    token: str = Query(...),
    scope: ScopedEventService = Depends(get_event_scope),
):
    evaluator = _require_evaluator_portal_access(token, scope)
    rows = list_for_evaluator(scope.db, scope.event_id, evaluator.id, unread_only=unread_only)

    return {
        "notifications": [
            {
                "id": str(row.id),
                "title": row.title,
                "message": row.message,
                "notification_type": row.notification_type,
                "read": row.read_at is not None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    }


@router.get("/portal/notifications/unread-count", summary="Evaluator: unread notification count")
def evaluator_portal_notification_count(
    token: str = Query(...),
    scope: ScopedEventService = Depends(get_event_scope),
):
    evaluator = _require_evaluator_portal_access(token, scope)
    return {"unread": unread_count_for_evaluator(scope.db, scope.event_id, evaluator.id)}


@router.post("/portal/notifications/{notification_id}/read", summary="Evaluator: mark notification read")
def evaluator_portal_mark_notification_read(
    notification_id: UUID,
    token: str = Query(...),
    scope: ScopedEventService = Depends(get_event_scope),
):
    evaluator = _require_evaluator_portal_access(token, scope)
    roles = [evaluator_role_key(evaluator.id), "evaluator", "all"]

    row = mark_read_by_role(scope.db, scope.event_id, roles, notification_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found.")

    return {"id": str(row.id), "read": row.read_at is not None}


@router.post("/portal/notifications/read-all", summary="Evaluator: mark all notifications read")
def evaluator_portal_mark_all_notifications_read(
    token: str = Query(...),
    scope: ScopedEventService = Depends(get_event_scope),
):
    evaluator = _require_evaluator_portal_access(token, scope)
    roles = [evaluator_role_key(evaluator.id), "evaluator", "all"]

    return {"marked_read": mark_all_read_by_role(scope.db, scope.event_id, roles)}

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
    dependencies=[Depends(RequireOrganizationRole('owner', 'admin'))]
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
    dependencies=[Depends(RequireOrganizationRole('owner', 'admin'))]
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
    dependencies=[Depends(RequireOrganizationRole('owner', 'admin'))]
)
def clear_flag(evaluation_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    return ScoreService.clear_flag(scope.event_id, evaluation_id, scope.db)


@router.get(
    "/leaderboard",
    summary="Get consolidated team leaderboard",
    description=(
        "Returns weighted average scores per team. "
        "Teams with active flags are included but marked as not leaderboard-ready."
    ),
    dependencies=[Depends(RequireOrganizationRole('owner', 'admin'))]
)
def get_leaderboard(scope: ScopedEventService = Depends(get_event_scope)):
    return ScoreService.consolidate_all_teams(scope.event_id, scope.db)


@router.get(
    "/audit-integrity", 
    summary="Run a cryptographic audit on all scores to detect database tampering",
    dependencies=[Depends(RequireOrganizationRole('owner', 'admin'))]
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