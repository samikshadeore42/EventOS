# File: backend/app/api/mentor_routes.py
# API routes for the Mentor Operations layer.
# Three groups:
#   1. Admin mentor management (/mentors, /mentor-assignments, /mentor-ops)
#   2. Mentor portal (/mentor-portal)
#   3. Participant mentor data (added to portal_routes resolve)

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
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

router = APIRouter(tags=["Mentor Operations"])


# ── Helper: extract mentor_id from token ───────────────────────────────────

def _get_mentor_id(token: str) -> UUID:
    payload = decode_access_token(token)
    verify_token_role(payload, "mentor")
    return parse_uuid_subject(get_token_subject(payload), "mentor ID")


# ═══════════════════════════════════════════════════════════════════════════
# ADMIN MENTOR MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mentors", summary="List all mentors")
def list_mentors(
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    return {"mentors": MentorService.list_mentors(db, active_only)}


@router.post("/mentors", summary="Create a new mentor", status_code=201)
def create_mentor(data: MentorCreate, db: Session = Depends(get_db)):
    mentor = MentorService.create_mentor(db, data)
    return MentorOut.model_validate(mentor).model_dump()


@router.get("/mentors/{mentor_id}", summary="Get mentor by ID")
def get_mentor(mentor_id: UUID, db: Session = Depends(get_db)):
    mentor = MentorService.get_mentor(db, mentor_id)
    return MentorOut.model_validate(mentor).model_dump()


@router.patch("/mentors/{mentor_id}", summary="Update a mentor")
def update_mentor(mentor_id: UUID, data: MentorUpdate, db: Session = Depends(get_db)):
    mentor = MentorService.update_mentor(db, mentor_id, data)
    return MentorOut.model_validate(mentor).model_dump()


@router.delete("/mentors/{mentor_id}", summary="Deactivate a mentor")
def deactivate_mentor(mentor_id: UUID, db: Session = Depends(get_db)):
    return MentorService.deactivate_mentor(db, mentor_id)


@router.post(
    "/mentors/{mentor_id}/send-access-link",
    summary="Send magic access link to mentor via existing email system",
)
def send_mentor_access_link(mentor_id: UUID, db: Session = Depends(get_db)):
    from app.models.mentor import MentorAssignment
    assignment_count = db.query(MentorAssignment).filter(
        MentorAssignment.mentor_id == mentor_id,
        MentorAssignment.is_active == True
    ).count()
    if assignment_count == 0:
        raise HTTPException(
            status_code=422,
            detail="Assign this mentor to at least one team before sending a portal link."
        )
    return LinkService.send_mentor_access_link(str(mentor_id), db)


# ═══════════════════════════════════════════════════════════════════════════
# MENTOR ASSIGNMENTS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mentor-assignments", summary="List all active assignments")
def list_assignments(db: Session = Depends(get_db)):
    return {"assignments": MentorService.list_assignments(db)}


@router.post("/mentor-assignments", summary="Assign mentor to team", status_code=201)
def assign_mentor(data: MentorAssignmentCreate, db: Session = Depends(get_db)):
    assignment = MentorService.assign_mentor_to_team(db, data)
    return MentorAssignmentOut.model_validate(assignment).model_dump()


@router.delete("/mentor-assignments/{assignment_id}", summary="Unassign mentor")
def unassign_mentor(assignment_id: UUID, db: Session = Depends(get_db)):
    return MentorService.unassign_mentor_from_team(db, assignment_id)


@router.get("/mentor-assignments/team/{team_id}", summary="Get mentor for a team")
def get_team_mentor(team_id: UUID, db: Session = Depends(get_db)):
    mentor = MentorService.get_team_mentor(db, team_id)
    if not mentor:
        return {"mentor": None, "message": "No active mentor assigned."}
    return {"mentor": MentorOut.model_validate(mentor).model_dump()}


# ═══════════════════════════════════════════════════════════════════════════
# MENTOR PORTAL (token-authenticated)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mentor-portal/me", summary="Mentor: get own profile + stats")
def mentor_portal_me(
    token: str = Query(..., description="Mentor JWT"),
    db: Session = Depends(get_db),
):
    mentor_id = _get_mentor_id(token)
    return MentorService.get_mentor_portal_me(db, mentor_id).model_dump()


@router.get("/mentor-portal/teams", summary="Mentor: list assigned teams")
def mentor_portal_teams(
    token: str = Query(..., description="Mentor JWT"),
    db: Session = Depends(get_db),
):
    mentor_id = _get_mentor_id(token)
    teams = MentorService.get_mentor_teams(db, mentor_id)
    return {"teams": [t.model_dump() for t in teams]}


@router.post("/mentor-portal/sessions", summary="Mentor: schedule a meeting", status_code=201)
def mentor_create_session(
    data: MentorSessionCreate,
    token: str = Query(..., description="Mentor JWT"),
    db: Session = Depends(get_db),
):
    mentor_id = _get_mentor_id(token)
    session = MentorService.create_session(db, mentor_id, data)
    return MentorSessionOut.model_validate(session).model_dump()


@router.patch("/mentor-portal/sessions/{session_id}", summary="Mentor: update a session")
def mentor_update_session(
    session_id: UUID,
    data: MentorSessionUpdate,
    token: str = Query(..., description="Mentor JWT"),
    db: Session = Depends(get_db),
):
    mentor_id = _get_mentor_id(token)
    session = MentorService.update_session(db, mentor_id, session_id, data)
    return MentorSessionOut.model_validate(session).model_dump()


@router.post("/mentor-portal/feedback", summary="Mentor: submit feedback", status_code=201)
def mentor_submit_feedback(
    data: MentorFeedbackCreate,
    token: str = Query(..., description="Mentor JWT"),
    db: Session = Depends(get_db),
):
    mentor_id = _get_mentor_id(token)
    feedback = MentorService.submit_team_feedback(db, mentor_id, data)
    return MentorFeedbackOut.model_validate(feedback).model_dump()


@router.get("/mentor-portal/feedback/team/{team_id}", summary="Mentor: get feedback for team")
def mentor_team_feedback(
    team_id: UUID,
    token: str = Query(..., description="Mentor JWT"),
    db: Session = Depends(get_db),
):
    mentor_id = _get_mentor_id(token)
    from app.models.mentor import MentorAssignment
    assignment = db.query(MentorAssignment).filter(
        MentorAssignment.mentor_id == mentor_id,
        MentorAssignment.team_id == team_id,
        MentorAssignment.is_active == True,
    ).first()
    if not assignment:
        raise HTTPException(status_code=403, detail="Mentor is not assigned to this team.")

    feedbacks = MentorService.get_feedback_for_team(db, team_id)
    return {"feedback": [MentorFeedbackOut.model_validate(fb).model_dump() for fb in feedbacks]}


# ═══════════════════════════════════════════════════════════════════════════
# ADMIN MENTOR OPS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mentor-ops/summary", summary="Mentor ops dashboard summary")
def mentor_ops_summary(db: Session = Depends(get_db)):
    return MentorOpsService.get_ops_summary(db).model_dump()


@router.get("/mentor-ops/risk-teams", summary="Risk scores for all teams")
def risk_teams(db: Session = Depends(get_db)):
    teams = MentorOpsService.get_risk_teams(db)
    return {"teams": [t.model_dump() for t in teams]}


@router.get("/mentor-ops/teams-without-mentor", summary="Approved teams without a mentor")
def teams_without_mentor(db: Session = Depends(get_db)):
    return {"teams": MentorOpsService.get_teams_without_mentor(db)}


@router.get("/mentor-ops/teams-without-meeting", summary="Teams without upcoming meeting")
def teams_without_meeting(db: Session = Depends(get_db)):
    return {"teams": MentorOpsService.get_teams_without_meeting(db)}


@router.get("/mentor-ops/missing-daily-updates", summary="Teams missing daily feedback")
def missing_daily_updates(db: Session = Depends(get_db)):
    return {"teams": MentorOpsService.get_teams_missing_daily_update(db)}


@router.get("/mentor-ops/assignment-suggestions", summary="Skill-gap mentor assignment suggestions")
def assignment_suggestions(db: Session = Depends(get_db)):
    suggestions = MentorOpsService.get_assignment_suggestions_by_skill_gap(db)
    return {"suggestions": [s.model_dump() for s in suggestions]}


@router.post("/mentor-ops/reminders/daily", summary="Send daily mentor reminders")
def send_daily_reminders(db: Session = Depends(get_db)):
    result = MentorOpsService.queue_daily_mentor_reminders(db)
    return result.model_dump()


@router.post("/mentor-ops/ai-summary", summary="Generate AI mentor summary for a team")
def generate_ai_summary(data: AISummaryRequest, db: Session = Depends(get_db)):
    from app.services.ai_service import AIService

    payload = MentorOpsService.build_ai_summary_payload(db, data.team_id)
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
        # Deterministic fallback if AI fails
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
    db: Session = Depends(get_db),
):
    payload = decode_access_token(token)
    verify_token_role(payload, "participant")
    participant_id = parse_uuid_subject(get_token_subject(payload), "participant ID")

    from app.models.participant import Participant
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant or not participant.team_id:
        return ParticipantMentorInfo().model_dump()

    return MentorService.get_participant_mentor_info(
        db, participant_id, participant.team_id
    ).model_dump()
