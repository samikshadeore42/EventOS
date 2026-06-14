# File: backend/app/api/mentor_routes.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- Import Bouncer
from app.core.security import decode_access_token, verify_token_role, get_token_subject, parse_uuid_subject
from app.services.mentor_service import MentorService
from app.services.mentor_ops_service import MentorOpsService
from app.services.link_service import LinkService
from app.schemas.mentor_schemas import (
    MentorCreate, MentorUpdate, MentorOut,
    MentorAssignmentCreate, MentorAssignmentOut,
    MentorSessionCreate, MentorSessionUpdate, MentorSessionOut,
    MentorFeedbackCreate, MentorFeedbackOut,
    MentorPortalMe, MentorTeamOut,
    MentorOpsSummary, TeamRiskOut,
    MentorSuggestionOut,
    AISummaryRequest, AISummaryResult,
    DailyReminderResult,
    ParticipantMentorInfo,
)

# 1. Update Prefix
router = APIRouter(prefix="/events/{event_id}", tags=["Mentor Operations"])


# ── Helper: extract mentor_id from token securely ──────────────────────────

def _get_mentor_id(token: str, scope: ScopedEventService) -> UUID:
    payload = decode_access_token(token)
    verify_token_role(payload, "mentor")
    
    # Cryptographic event boundary check
    token_event_id = payload.get("event_id")
    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch. This link belongs to a different event.")
        
    return parse_uuid_subject(get_token_subject(payload), "mentor ID")


# ═══════════════════════════════════════════════════════════════════════════
# ADMIN MENTOR MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mentors", summary="List all mentors")
def list_mentors(
    active_only: bool = Query(default=False),
    scope: ScopedEventService = Depends(get_event_scope),
):
    return {"mentors": MentorService.list_mentors(scope.event_id, scope.db, active_only)}


@router.post("/mentors", summary="Create a new mentor", status_code=201)
def create_mentor(data: MentorCreate, scope: ScopedEventService = Depends(get_event_scope)):
    mentor = MentorService.create_mentor(scope.event_id, scope.db, data)
    return MentorOut.model_validate(mentor).model_dump()


@router.get("/mentors/{mentor_id}", summary="Get mentor by ID")
def get_mentor(mentor_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    mentor = MentorService.get_mentor(scope.event_id, scope.db, mentor_id)
    return MentorOut.model_validate(mentor).model_dump()


@router.patch("/mentors/{mentor_id}", summary="Update a mentor")
def update_mentor(mentor_id: UUID, data: MentorUpdate, scope: ScopedEventService = Depends(get_event_scope)):
    mentor = MentorService.update_mentor(scope.event_id, scope.db, mentor_id, data)
    return MentorOut.model_validate(mentor).model_dump()


@router.delete("/mentors/{mentor_id}", summary="Deactivate a mentor")
def deactivate_mentor(mentor_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    return MentorService.deactivate_mentor(scope.event_id, scope.db, mentor_id)


@router.post(
    "/mentors/{mentor_id}/send-access-link",
    summary="Send magic access link to mentor via existing email system",
)
def send_mentor_access_link(mentor_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    from app.models.mentor import MentorAssignment
    assignment_count = scope.db.query(MentorAssignment).filter(
        MentorAssignment.mentor_id == mentor_id,
        MentorAssignment.event_id == scope.event_id, # Scope check
        MentorAssignment.is_active == True
    ).count()
    if assignment_count == 0:
        raise HTTPException(
            status_code=422,
            detail="Assign this mentor to at least one team before sending a portal link."
        )
    return LinkService.send_mentor_access_link(scope.event_id, str(mentor_id), scope.db)


# ═══════════════════════════════════════════════════════════════════════════
# MENTOR ASSIGNMENTS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mentor-assignments", summary="List all active assignments")
def list_assignments(scope: ScopedEventService = Depends(get_event_scope)):
    return {"assignments": MentorService.list_assignments(scope.event_id, scope.db)}


@router.post("/mentor-assignments", summary="Assign mentor to team", status_code=201)
def assign_mentor(data: MentorAssignmentCreate, scope: ScopedEventService = Depends(get_event_scope)):
    assignment = MentorService.assign_mentor_to_team(scope.event_id, scope.db, data)
    return MentorAssignmentOut.model_validate(assignment).model_dump()


@router.delete("/mentor-assignments/{assignment_id}", summary="Unassign mentor")
def unassign_mentor(assignment_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    return MentorService.unassign_mentor_from_team(scope.event_id, scope.db, assignment_id)


@router.get("/mentor-assignments/team/{team_id}", summary="Get mentor for a team")
def get_team_mentor(team_id: UUID, scope: ScopedEventService = Depends(get_event_scope)):
    mentor = MentorService.get_team_mentor(scope.event_id, scope.db, team_id)
    if not mentor:
        return {"mentor": None, "message": "No active mentor assigned."}
    return {"mentor": MentorOut.model_validate(mentor).model_dump()}


# ═══════════════════════════════════════════════════════════════════════════
# MENTOR PORTAL (token-authenticated)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mentor-portal/me", summary="Mentor: get own profile + stats")
def mentor_portal_me(
    token: str = Query(..., description="Mentor JWT"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    mentor_id = _get_mentor_id(token, scope)
    return MentorService.get_mentor_portal_me(scope.event_id, scope.db, mentor_id).model_dump()


@router.get("/mentor-portal/teams", summary="Mentor: list assigned teams")
def mentor_portal_teams(
    token: str = Query(..., description="Mentor JWT"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    mentor_id = _get_mentor_id(token, scope)
    teams = MentorService.get_mentor_teams(scope.event_id, scope.db, mentor_id)
    return {"teams": [t.model_dump() for t in teams]}


@router.post("/mentor-portal/sessions", summary="Mentor: schedule a meeting", status_code=201)
def mentor_create_session(
    data: MentorSessionCreate,
    token: str = Query(..., description="Mentor JWT"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    mentor_id = _get_mentor_id(token, scope)
    session = MentorService.create_session(scope.event_id, scope.db, mentor_id, data)
    return MentorSessionOut.model_validate(session).model_dump()


@router.patch("/mentor-portal/sessions/{session_id}", summary="Mentor: update a session")
def mentor_update_session(
    session_id: UUID,
    data: MentorSessionUpdate,
    token: str = Query(..., description="Mentor JWT"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    mentor_id = _get_mentor_id(token, scope)
    session = MentorService.update_session(scope.event_id, scope.db, mentor_id, session_id, data)
    return MentorSessionOut.model_validate(session).model_dump()


@router.post("/mentor-portal/feedback", summary="Mentor: submit feedback", status_code=201)
def mentor_submit_feedback(
    data: MentorFeedbackCreate,
    token: str = Query(..., description="Mentor JWT"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    mentor_id = _get_mentor_id(token, scope)
    feedback = MentorService.submit_team_feedback(scope.event_id, scope.db, mentor_id, data)
    return MentorFeedbackOut.model_validate(feedback).model_dump()


@router.get("/mentor-portal/feedback/team/{team_id}", summary="Mentor: get feedback for team")
def mentor_team_feedback(
    team_id: UUID,
    token: str = Query(..., description="Mentor JWT"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    mentor_id = _get_mentor_id(token, scope)
    from app.models.mentor import MentorAssignment
    assignment = scope.db.query(MentorAssignment).filter(
        MentorAssignment.mentor_id == mentor_id,
        MentorAssignment.team_id == team_id,
        MentorAssignment.event_id == scope.event_id, # Scope check
        MentorAssignment.is_active == True,
    ).first()
    if not assignment:
        raise HTTPException(status_code=403, detail="Mentor is not assigned to this team.")

    feedbacks = MentorService.get_feedback_for_team(scope.event_id, scope.db, team_id)
    return {"feedback": [MentorFeedbackOut.model_validate(fb).model_dump() for fb in feedbacks]}


# ═══════════════════════════════════════════════════════════════════════════
# ADMIN MENTOR OPS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mentor-ops/summary", summary="Mentor ops dashboard summary")
def mentor_ops_summary(scope: ScopedEventService = Depends(get_event_scope)):
    return MentorOpsService.get_ops_summary(scope.event_id, scope.db).model_dump()


@router.get("/mentor-ops/risk-teams", summary="Risk scores for all teams")
def risk_teams(scope: ScopedEventService = Depends(get_event_scope)):
    teams = MentorOpsService.get_risk_teams(scope.event_id, scope.db)
    return {"teams": [t.model_dump() for t in teams]}


@router.get("/mentor-ops/teams-without-mentor", summary="Approved teams without a mentor")
def teams_without_mentor(scope: ScopedEventService = Depends(get_event_scope)):
    return {"teams": MentorOpsService.get_teams_without_mentor(scope.event_id, scope.db)}


@router.get("/mentor-ops/teams-without-meeting", summary="Teams without upcoming meeting")
def teams_without_meeting(scope: ScopedEventService = Depends(get_event_scope)):
    return {"teams": MentorOpsService.get_teams_without_meeting(scope.event_id, scope.db)}


@router.get("/mentor-ops/missing-daily-updates", summary="Teams missing daily feedback")
def missing_daily_updates(scope: ScopedEventService = Depends(get_event_scope)):
    return {"teams": MentorOpsService.get_teams_missing_daily_update(scope.event_id, scope.db)}


@router.get("/mentor-ops/assignment-suggestions", summary="Skill-gap mentor assignment suggestions")
def assignment_suggestions(scope: ScopedEventService = Depends(get_event_scope)):
    suggestions = MentorOpsService.get_assignment_suggestions_by_skill_gap(scope.event_id, scope.db)
    return {"suggestions": [s.model_dump() for s in suggestions]}


@router.post("/mentor-ops/reminders/daily", summary="Send daily mentor reminders")
def send_daily_reminders(scope: ScopedEventService = Depends(get_event_scope)):
    result = MentorOpsService.queue_daily_mentor_reminders(scope.event_id, scope.db)
    return result.model_dump()


@router.post("/mentor-ops/ai-summary", summary="Generate AI mentor summary for a team")
def generate_ai_summary(data: AISummaryRequest, scope: ScopedEventService = Depends(get_event_scope)):
    from app.services.ai_service import AIService

    payload = MentorOpsService.build_ai_summary_payload(scope.event_id, scope.db, data.team_id)
    if "error" in payload:
        raise HTTPException(status_code=404, detail=payload["error"])

    try:
        summary = AIService.generate_mentor_summary(payload)
        return AISummaryResult(
            team_id=data.team_id,
            team_name=payload["team_name"],
            summary=summary.get("summary", ""),
            recommended_focus=summary.get("recommended_focus", ""),
            committee_note=summary.get("committee_note", ""),
            tone=summary.get("tone", "stable"),
        ).model_dump()
    except Exception as e:
        risk_level = payload.get("risk_level", "low")
        tone = "urgent" if risk_level == "critical" else ("watchlist" if risk_level in ("high", "medium") else "stable")
        return AISummaryResult(
            team_id=data.team_id,
            team_name=payload["team_name"],
            summary=f"Team {payload['team_name']} has a risk score of {payload.get('risk_score', 0)} ({risk_level}). "
                    f"Latest progress: {payload.get('latest_progress_score', 'N/A')}. "
                    f"Reasons: {', '.join(payload.get('risk_reasons', ['No data']))}.",
            recommended_focus=payload.get("blockers", "") or "Continue monitoring progress.",
            committee_note=f"Auto-generated fallback summary. AI error: {str(e)[:100]}",
            tone=tone,
        ).model_dump()


# ═══════════════════════════════════════════════════════════════════════════
# PARTICIPANT MENTOR DATA
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/participant-mentor-info",
    summary="Participant-safe mentor data (mentor name, next meeting, visible feedback)",
)
def participant_mentor_info(
    token: str = Query(..., description="Participant JWT"),
    scope: ScopedEventService = Depends(get_event_scope),
):
    payload = decode_access_token(token)
    verify_token_role(payload, "participant")
    
    # Cryptographic check
    token_event_id = payload.get("event_id")
    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")
        
    participant_id = parse_uuid_subject(get_token_subject(payload), "participant ID")

    from app.models.participant import Participant
    participant = scope.db.query(Participant).filter(
        Participant.id == participant_id,
        Participant.event_id == scope.event_id
    ).first()
    
    if not participant or not participant.team_id:
        return ParticipantMentorInfo().model_dump()

    return MentorService.get_participant_mentor_info(
        scope.event_id, scope.db, participant_id, participant.team_id
    ).model_dump()