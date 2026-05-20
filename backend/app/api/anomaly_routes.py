# File: backend/app/api/anomaly_routes.py
#
# HTTP interface to the anomaly detector.
#
# POST /anomalies/detect              → enqueue detection, return task_id
# GET  /anomalies/report/{task_id}    → fetch completed report
# GET  /anomalies/status/{task_id}    → proxy to task tracker (convenience)
#
# Flow:
#   1. Client calls POST /anomalies/detect           → gets task_id
#   2. Client polls GET /tasks/{task_id}/status      → waits for "success"
#   3. Client calls GET /anomalies/report/{task_id}  → gets the full report

from fastapi import APIRouter, HTTPException

from app.schemas.anomaly_schemas import (
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
    AnomalyReportResponse,
    AnomalyOut,
)
from app.services.task_tracker import TaskTracker
from app.tasks.anomaly import run_anomaly_detection


router = APIRouter(prefix="/anomalies", tags=["Anomaly Detection"])


# ── POST /anomalies/detect ────────────────────────────────────────────

@router.post(
    "/detect",
    response_model=AnomalyDetectionResponse,
    status_code=202,    # 202 Accepted = "I got your request, working on it"
    summary="Run anomaly detection on a panel of evaluator scores",
    description=(
        "Enqueues an anomaly detection task. Returns task_id immediately. "
        "Poll GET /tasks/{task_id}/status for progress. "
        "Fetch the full report with GET /anomalies/report/{task_id} once status is 'success'."
    ),
)
def detect_anomalies(body: AnomalyDetectionRequest):
    """
    Runs all four detection methods (z-score, divergence, consistency, COI)
    on the submitted panel. Configurable thresholds via `config`.
    """
    expected_criteria = set(body.criteria)

    # ── Cross-entry validation — every entry must score exactly the criteria
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

    # ── Weights, if given, must match criteria keys
    if body.weights is not None and set(body.weights.keys()) != expected_criteria:
        raise HTTPException(
            status_code=422,
            detail=(
                f"weights keys must match criteria. "
                f"Got {sorted(body.weights.keys())}, expected {sorted(expected_criteria)}."
            ),
        )

    # ── Serialize entries for Celery (must be JSON-safe — no Pydantic models) ─
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

    # ── Enqueue Celery task ───────────────────────────────────────────
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
        status_url=f"/tasks/{task.id}/status",
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
    description=(
        "Returns the full anomaly report. Only available after the task "
        "status is 'success'. Returns 404 if task is not found and 425 if "
        "the task is still running."
    ),
)
def get_anomaly_report(task_id: str):
    """Fetches a completed detection result from the task tracker."""
    status = TaskTracker.get_status(task_id)

    # ── Guard clauses — check task state before returning data ────────
    if not status:
        raise HTTPException(
            status_code=404,
            detail=f"No task found with id '{task_id}'. It may have expired."
        )

    if status["status"] in ("running", "pending"):
        raise HTTPException(
            status_code=425,    # 425 Too Early
            detail=(
                f"Detection still running "
                f"(progress: {status['progress']}/{status['total_steps']}). "
                f"Poll /tasks/{task_id}/status and retry when status is 'success'."
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

    # ── Parse and return ──────────────────────────────────────────────
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
    description="Same as GET /tasks/{task_id}/status but namespaced under /anomalies.",
)
def get_anomaly_status(task_id: str):
    """Proxy to the task tracker — keeps anomaly-related polling under /anomalies."""
    status = TaskTracker.get_status_with_logs(task_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return status