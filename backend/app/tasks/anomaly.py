# File: backend/app/tasks/anomaly.py
#
# Celery task that:
# 1. Initializes a Redis status tracker entry
# 2. Builds the evaluation panel from raw entries
# 3. Runs all four anomaly detectors
# 4. Writes the report back to tracker
#
# The API enqueues this task and immediately returns task_id.
# The frontend polls GET /tasks/{task_id}/status to show live progress.

from typing import Optional, Dict

from app.core.celery_app import celery_app
from app.services.anomaly_detector import AnomalyDetector, build_panel_from_dicts
from app.services.task_tracker import TaskTracker, TaskStatus


@celery_app.task(
    bind=True,
    queue="algorithms",
    name="app.tasks.anomaly.run_anomaly_detection",
    max_retries=1,
    default_retry_delay=30,
)
def run_anomaly_detection(
    self,
    entries:  list,
    criteria: list,
    weights:  Optional[Dict[str, float]],
    config:   dict,
):
    """
    Celery task: runs the four anomaly detectors on a panel of scores.

    Args:
        entries  : list of score-entry dicts. Each dict needs:
                   judge_id, judge_name, judge_institution, team_id,
                   team_member_institutions (list of strings), scores (dict).
        criteria : ordered list of criterion names.
        weights  : optional dict mapping criterion → weight. None ⇒ all 1.0.
        config   : threshold configuration dict. Keys:
                   z_score_threshold, divergence_threshold,
                   consistency_min_std, halo_threshold, coi_bias_threshold.

    Returns:
        dict with keys: task_id, total_anomalies, by_kind, by_severity,
        holds_results_release, anomalies.
    """
    task_id = self.request.id

    # ── Step 1: Initialize tracker ────────────────────────────────────
    TaskTracker.initialize(
        task_id=task_id,
        task_type="anomaly_detection",
        total_steps=4,   # 4 detection methods
        metadata={
            "num_entries":  len(entries),
            "num_criteria": len(criteria),
            "num_judges":   len({e.get("judge_id") for e in entries}),
            "num_teams":    len({e.get("team_id")  for e in entries}),
        },
    )

    try:
        # ── Step 2: Mark running ──────────────────────────────────────
        TaskTracker.mark_running(
            task_id,
            f"Starting anomaly detection on {len(entries)} score entries"
        )

        # ── Step 3: Build panel ───────────────────────────────────────
        TaskTracker.update(
            task_id, TaskStatus.RUNNING, 1,
            "Building evaluation panel and validating entry shapes..."
        )

        try:
            panel = build_panel_from_dicts(
                raw_entries=entries,
                criteria=criteria,
                weights=weights,
            )
        except ValueError as e:
            TaskTracker.mark_failed(task_id, str(e))
            raise

        TaskTracker.update(
            task_id, TaskStatus.RUNNING, 2,
            f"Panel built ({len(entries)} entries, {len(criteria)} criteria). "
            f"Running detectors..."
        )

        # ── Step 4: Run detection ─────────────────────────────────────
        detector = AnomalyDetector(
            panel,
            z_score_threshold    = config.get("z_score_threshold",    2.0),
            divergence_threshold = config.get("divergence_threshold", 3.0),
            consistency_min_std  = config.get("consistency_min_std",  0.5),
            halo_threshold       = config.get("halo_threshold",       2.0),
            coi_bias_threshold   = config.get("coi_bias_threshold",   1.5),
        )

        report = detector.detect_all()

        TaskTracker.update(
            task_id, TaskStatus.RUNNING, 3,
            f"Detection complete. "
            f"{report.total_anomalies} anomalies found "
            f"({report.by_severity.get('high', 0)} high-severity)."
        )

        # ── Step 5: Serialize result ──────────────────────────────────
        result = report.to_dict()
        result["task_id"] = task_id

        # ── Step 6: Mark success ──────────────────────────────────────
        message = (
            f"Detection complete: {report.total_anomalies} anomalies. "
            f"{'HOLDS RESULTS RELEASE' if report.holds_results_release else 'Safe to release.'}"
        )
        TaskTracker.mark_success(task_id, result=result, message=message)

        return result

    except Exception as exc:
        # Mark failed in tracker before re-raising
        TaskTracker.mark_failed(task_id, str(exc))
        raise self.retry(exc=exc)