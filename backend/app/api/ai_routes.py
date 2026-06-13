# File: backend/app/api/ai_routes.py
#
# HTTP interface to the AIService. Five endpoints:
#
#   POST /ai/team-rationale       → enqueue rationale generation
#   POST /ai/communication        → enqueue email drafting
#   POST /ai/rubric               → enqueue rubric generation
#   POST /ai/explain-anomaly      → enqueue anomaly explanation
#   GET  /ai/result/{task_id}     → fetch a completed result
#
# Same flow as anomaly detection:
#   1. Client POSTs → gets task_id back immediately
#   2. Client polls /tasks/{task_id}/status until success
#   3. Client GETs /ai/result/{task_id} to retrieve the generated content

from fastapi import APIRouter, HTTPException

from app.schemas.ai_schemas import (
    AITaskEnqueueResponse,
    TeamRationaleRequest,
    TeamRationaleResult,
    CommunicationRequest,
    CommunicationResult,
    RubricRequest,
    RubricResult,
    CriterionRubric,
    AnomalyExplanationRequest,
    AnomalyExplanationResult,
)
from app.services.task_tracker import TaskTracker
from app.tasks.ai_tasks import (
    generate_team_rationale_task,
    draft_communication_task,
    generate_rubric_task,
    explain_anomaly_task,
)


router = APIRouter(prefix="/ai", tags=["AI Generation"])


def _enqueue_response(task_id: str, what: str) -> AITaskEnqueueResponse:
    """Common shape returned when any AI task is enqueued."""
    return AITaskEnqueueResponse(
        task_id    = task_id,
        status_url = f"/tasks/{task_id}/status",
        result_url = f"/ai/result/{task_id}",
        message    = f"{what} enqueued. Poll status_url, then GET result_url when status is 'success'.",
    )


# ── 1. POST /ai/team-rationale ───────────────────────────────────────

@router.post(
    "/team-rationale",
    response_model=AITaskEnqueueResponse,
    status_code=202,
    summary="Generate an LLM rationale for a single team's composition",
    description=(
        "Takes a team's members and the distribution rules used to form it, "
        "and produces a 2-3 sentence committee-facing rationale. Used after "
        "the CSP solver forms teams, before the committee approves rosters."
    ),
)
def generate_team_rationale(body: TeamRationaleRequest):
    """Enqueues the rationale generation Celery task and returns task_id."""
    members_payload = [m.model_dump() for m in body.members]

    task = generate_team_rationale_task.delay(
        body.team_name,
        members_payload,
        body.distribution_rules,
        body.challenge_area,
    )
    return _enqueue_response(task.id, f"Team rationale for '{body.team_name}'")


# ── 2. POST /ai/communication ────────────────────────────────────────

@router.post(
    "/communication",
    response_model=AITaskEnqueueResponse,
    status_code=202,
    summary="Draft a stage-appropriate email via the LLM",
    description=(
        "Drafts the subject + body of an email for one of five stages: "
        "welcome, evaluation_request, deadline_reminder, results, progression. "
        "Returns the draft for committee preview — the email is NOT sent here. "
        "Sending happens via the existing EmailService once a human approves."
    ),
)
def draft_communication(body: CommunicationRequest):
    """Enqueues the communication drafting Celery task and returns task_id."""
    task = draft_communication_task.delay(
        body.stage.value,
        body.recipient_name,
        body.recipient_role.value,
        body.event_name,
        body.context,
    )
    return _enqueue_response(
        task.id,
        f"'{body.stage.value}' email for {body.recipient_name}"
    )


# ── 3. POST /ai/rubric ───────────────────────────────────────────────

@router.post(
    "/rubric",
    response_model=AITaskEnqueueResponse,
    status_code=202,
    summary="Generate a structured evaluation rubric for judges",
    description=(
        "Given a challenge area and the weighted grading criteria, produces a "
        "rubric with descriptions, what-to-look-for points, and scoring bands "
        "per criterion. Judges read this when they receive their assignments."
    ),
)
def generate_rubric(body: RubricRequest):
    """Enqueues the rubric generation Celery task and returns task_id."""
    task = generate_rubric_task.delay(
        body.challenge_area,
        body.criteria,
        body.event_name,
        body.team_context,
    )
    return _enqueue_response(task.id, f"Rubric for '{body.challenge_area}'")


# ── 4. POST /ai/explain-anomaly ──────────────────────────────────────

@router.post(
    "/explain-anomaly",
    response_model=AITaskEnqueueResponse,
    status_code=202,
    summary="Generate a committee-friendly narrative for a flagged anomaly",
    description=(
        "Turns a statistical anomaly (from /anomalies/report) into a 2-3 "
        "sentence plain-English explanation suitable for committee review. "
        "The anomaly detector already produces a templated explanation; this "
        "is a richer LLM-written version."
    ),
)
def explain_anomaly(body: AnomalyExplanationRequest):
    """Enqueues the anomaly explanation Celery task and returns task_id."""
    task = explain_anomaly_task.delay(
        body.anomaly,
        body.team_name,
        body.evaluator_name,
    )
    return _enqueue_response(
        task.id,
        f"Anomaly explanation for {body.team_name}"
    )


# ── 5. GET /ai/result/{task_id} ──────────────────────────────────────

@router.get(
    "/result/{task_id}",
    summary="Fetch the completed result of any AI generation task",
    description=(
        "Returns the generated content. The response shape depends on the "
        "task type — rationales return a string, emails return subject+body, "
        "rubrics return structured criteria, anomaly explanations return a "
        "narrative. Returns 404 if the task isn't found and 425 if it's still "
        "running."
    ),
)
def get_ai_result(task_id: str):
    """Generic result fetcher — works for all four AI task types."""
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
                f"Generation still running "
                f"(progress: {status['progress']}/{status['total_steps']}). "
                f"Poll /tasks/{task_id}/status and retry when status is 'success'."
            ),
        )

    if status["status"] == "failed":
        raise HTTPException(
            status_code=500,
            detail=f"AI generation failed: {status.get('error', 'Unknown error')}",
        )

    result = status.get("result")
    if not result:
        raise HTTPException(
            status_code=500,
            detail="Generation completed but result is missing. This is unexpected.",
        )

    # ── Shape the response based on task_type stored in the tracker ──
    task_type = status.get("task_type", "unknown")

    if task_type == "ai_team_rationale":
        return TeamRationaleResult(rationale=result["rationale"])

    if task_type == "ai_communication":
        return CommunicationResult(subject=result["subject"], body=result["body"])

    if task_type == "ai_rubric":
        return RubricResult(criteria=[CriterionRubric(**c) for c in result["criteria"]])

    if task_type == "ai_anomaly_explanation":
        return AnomalyExplanationResult(narrative=result["narrative"])

    # Fallback — task_type not recognized, return raw result
    return result

# ── 6. POST /ai/configure-event ──────────────────────────────────────

from app.schemas.langgraph_schemas import ConfigureEventRequest, ConfigureEventResponse
from app.services.langgraph_agent import run_agent_turn


@router.post(
    "/configure-event",
    response_model=ConfigureEventResponse,
    summary="LangGraph agent: configure an event through natural conversation",
    description=(
        "Multi-turn conversational agent. Committee member describes their event "
        "in plain English. Agent asks clarifying questions for any missing fields "
        "and returns is_complete=True with the structured config JSON when done. "
        "Conversation history is stored in Redis by session_id."
    ),
)
def configure_event(body: ConfigureEventRequest):
    try:
        result = run_agent_turn(
            message    = body.message,
            session_id = body.session_id,
        )
        return ConfigureEventResponse(
            reply       = result["reply"],
            is_complete = result["is_complete"],
            config      = result["config"],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")