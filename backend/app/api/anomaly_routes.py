# File: backend/app/api/anomaly_routes.py

from fastapi import APIRouter, HTTPException, Depends

from app.schemas.anomaly_schemas import (
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
    AnomalyReportResponse,
    AnomalyOut,
)
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- Import Bouncer
from app.services.task_tracker import TaskTracker
from app.tasks.anomaly import run_anomaly_detection

# 1. Update Prefix
router = APIRouter(prefix="/events/{event_id}/anomalies", tags=["Anomaly Detection"])


# ── POST /anomalies/detect ────────────────────────────────────────────

@router.post(
    "/detect",
    response_model=AnomalyDetectionResponse,
    status_code=202, 
    summary="Run anomaly detection on a panel of evaluator scores",
)
def detect_anomalies(
    body:  AnomalyDetectionRequest,
    scope: ScopedEventService = Depends(get_event_scope) # <-- Add Scope
):
    expected_criteria = set(body.criteria)

    for i, e in enumerate(body.entries):
        if set(e.scores.keys()) != expected_criteria:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Entry #{i} (judge={e.judge_id}, team={e.team_id}) has "
                    f"scores for {sorted(e.scores.keys())} but criteria are "
                    f"{sorted(expected_criteria)}."
                ),
            )

    if body.weights is not None and set(body.weights.keys()) != expected_criteria:
        raise HTTPException(
            status_code=422,
            detail=(
                f"weights keys must match criteria. "
                f"Got {sorted(body.weights.keys())}, expected {sorted(expected_criteria)}."
            ),
        )

    entries_payload = [
        {
            "judge_id":                 e.judge_id,
            "judge_name":               e.judge_name,
            "judge_institution":        e.judge_institution,
            "team_id":                  e.team_id,
            "team_member_institutions": e.team_member_institutions,
            "scores":                   e.scores,
        }
        for e in body.entries
    ]

    config_payload = body.config.model_dump()

    # Pass the event context into the task if you later want to store reports in DB
    task = run_anomaly_detection.delay(
        entries_payload,
        body.criteria,
        body.weights,
        config_payload,
    )

    num_judges = len({e.judge_id for e in body.entries})
    num_teams  = len({e.team_id  for e in body.entries})

    return AnomalyDetectionResponse(
        task_id=task.id,
        status_url=f"/events/{scope.event_id}/anomalies/status/{task.id}", # <-- Correct nested status URL
        message=(
            f"Anomaly detection enqueued for {len(body.entries)} score entries "
            f"({num_judges} judges × {num_teams} teams). "
            f"Poll status_url for live progress."
        ),
    )


# ── GET /anomalies/report/{task_id} ───────────────────────────────────

@router.get(
    "/report/{task_id}",
    response_model=AnomalyReportResponse,
    summary="Fetch the anomaly report from a completed detection run",
)
def get_anomaly_report(
    task_id: str,
    scope:   ScopedEventService = Depends(get_event_scope)
):
    status = TaskTracker.get_status(task_id)

    if not status:
        raise HTTPException(
            status_code=404,
            detail=f"No task found with id '{task_id}'. It may have expired."
        )

    if status["status"] in ("running", "pending"):
        raise HTTPException(
            status_code=425,
            detail=(
                f"Detection still running "
                f"(progress: {status['progress']}/{status['total_steps']}). "
                f"Poll status_url and retry when status is 'success'."
            ),
        )

    if status["status"] == "failed":
        raise HTTPException(
            status_code=500,
            detail=f"Detection task failed: {status.get('error', 'Unknown error')}",
        )

    result = status.get("result")
    if not result:
        raise HTTPException(
            status_code=500,
            detail="Detection completed but result data is missing. This is unexpected.",
        )

    return AnomalyReportResponse(
        task_id=task_id,
        total_anomalies=       result["total_anomalies"],
        by_kind=               result["by_kind"],
        by_severity=           result["by_severity"],
        holds_results_release= result["holds_results_release"],
        anomalies=             [AnomalyOut(**a) for a in result["anomalies"]],
    )


# ── GET /anomalies/status/{task_id} ───────────────────────────────────

@router.get(
    "/status/{task_id}",
    summary="Convenience proxy to task status",
)
def get_anomaly_status(
    task_id: str,
    scope:   ScopedEventService = Depends(get_event_scope)
):
    status = TaskTracker.get_status_with_logs(task_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return status