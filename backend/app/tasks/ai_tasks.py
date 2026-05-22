# File: backend/app/tasks/ai_tasks.py
#
# Celery wrappers for AIService methods. LLM calls take seconds (sometimes
# 10-30s on cold starts), so they must run asynchronously so the HTTP request
# can return a task_id immediately.
#
# Four tasks, one per AIService method. Each follows the same pattern as
# tasks/anomaly.py: initialize tracker → mark running → call service →
# mark success/failed with the result.

from typing import Optional

from app.core.celery_app import celery_app
from app.services.ai_service import AIService
from app.services.task_tracker import TaskTracker, TaskStatus


# ── 1. Team rationale ────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    queue="algorithms",
    name="app.tasks.ai_tasks.generate_team_rationale_task",
    max_retries=2,
    default_retry_delay=15,
)
def generate_team_rationale_task(
    self,
    team_name:          str,
    members:            list,
    distribution_rules: dict,
    challenge_area:     Optional[str] = None,
):
    """Celery task: generate one team's rationale via the LLM."""
    task_id = self.request.id
    TaskTracker.initialize(
        task_id=task_id,
        task_type="ai_team_rationale",
        total_steps=1,
        metadata={"team_name": team_name, "member_count": len(members)},
    )

    try:
        TaskTracker.mark_running(task_id, f"Generating rationale for {team_name}...")

        rationale = AIService.generate_team_rationale(
            team_name          = team_name,
            members            = members,
            distribution_rules = distribution_rules,
            challenge_area     = challenge_area,
        )

        result = {"rationale": rationale, "team_name": team_name}
        TaskTracker.mark_success(
            task_id, result=result,
            message=f"Rationale generated for {team_name} ({len(rationale)} chars)."
        )
        return result

    except Exception as exc:
        TaskTracker.mark_failed(task_id, str(exc))
        raise self.retry(exc=exc)


# ── 2. Communication drafting ────────────────────────────────────────

@celery_app.task(
    bind=True,
    queue="algorithms",
    name="app.tasks.ai_tasks.draft_communication_task",
    max_retries=2,
    default_retry_delay=15,
)
def draft_communication_task(
    self,
    stage:          str,
    recipient_name: str,
    recipient_role: str,
    event_name:     str,
    context:        dict,
):
    """Celery task: draft a stage-appropriate email via the LLM."""
    task_id = self.request.id
    TaskTracker.initialize(
        task_id=task_id,
        task_type="ai_communication",
        total_steps=1,
        metadata={"stage": stage, "recipient_role": recipient_role},
    )

    try:
        TaskTracker.mark_running(
            task_id,
            f"Drafting '{stage}' email for {recipient_name}..."
        )

        result = AIService.draft_communication(
            stage          = stage,
            recipient_name = recipient_name,
            recipient_role = recipient_role,
            event_name     = event_name,
            context        = context,
        )

        TaskTracker.mark_success(
            task_id, result=result,
            message=f"Email drafted: subject = '{result['subject'][:50]}...'"
        )
        return result

    except Exception as exc:
        TaskTracker.mark_failed(task_id, str(exc))
        raise self.retry(exc=exc)


# ── 3. Evaluation rubric ─────────────────────────────────────────────

@celery_app.task(
    bind=True,
    queue="algorithms",
    name="app.tasks.ai_tasks.generate_rubric_task",
    max_retries=2,
    default_retry_delay=15,
)
def generate_rubric_task(
    self,
    challenge_area: str,
    criteria:       dict,
    event_name:     str = "the event",
    team_context:   Optional[dict] = None,
):
    """Celery task: build a structured rubric via the LLM."""
    task_id = self.request.id
    TaskTracker.initialize(
        task_id=task_id,
        task_type="ai_rubric",
        total_steps=1,
        metadata={"challenge_area": challenge_area, "criteria_count": len(criteria)},
    )

    try:
        TaskTracker.mark_running(
            task_id,
            f"Generating rubric for challenge area '{challenge_area}'..."
        )

        result = AIService.generate_evaluation_rubric(
            challenge_area = challenge_area,
            criteria       = criteria,
            event_name     = event_name,
            team_context   = team_context,
        )

        TaskTracker.mark_success(
            task_id, result=result,
            message=f"Rubric generated with {len(result['criteria'])} criteria."
        )
        return result

    except Exception as exc:
        TaskTracker.mark_failed(task_id, str(exc))
        raise self.retry(exc=exc)


# ── 4. Anomaly explanation ───────────────────────────────────────────

@celery_app.task(
    bind=True,
    queue="algorithms",
    name="app.tasks.ai_tasks.explain_anomaly_task",
    max_retries=2,
    default_retry_delay=15,
)
def explain_anomaly_task(
    self,
    anomaly:        dict,
    team_name:      str,
    evaluator_name: Optional[str] = None,
):
    """Celery task: generate a committee-friendly narrative for a flagged anomaly."""
    task_id = self.request.id
    TaskTracker.initialize(
        task_id=task_id,
        task_type="ai_anomaly_explanation",
        total_steps=1,
        metadata={
            "anomaly_kind": anomaly.get("kind"),
            "severity":     anomaly.get("severity"),
            "team_name":    team_name,
        },
    )

    try:
        TaskTracker.mark_running(
            task_id,
            f"Explaining {anomaly.get('kind')} anomaly on {team_name}..."
        )

        narrative = AIService.explain_anomaly(
            anomaly        = anomaly,
            team_name      = team_name,
            evaluator_name = evaluator_name,
        )

        result = {"narrative": narrative}
        TaskTracker.mark_success(
            task_id, result=result,
            message=f"Anomaly narrative generated ({len(narrative)} chars)."
        )
        return result

    except Exception as exc:
        TaskTracker.mark_failed(task_id, str(exc))
        raise self.retry(exc=exc)