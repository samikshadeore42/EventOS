# backend/app/api/daily_update_routes.py
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.security import decode_access_token, TokenRole, verify_token_role, get_token_subject, parse_uuid_subject
from app.models.daily_update import DailyUpdate
from app.models.participant import Participant
from fastapi import Query

router = APIRouter(prefix="/daily-updates", tags=["Daily Updates"])


class DailyUpdateSubmit(BaseModel):
    what_i_built: str
    blockers:     Optional[str] = None
    hours_worked: Optional[int] = None


class DailyUpdateResponse(BaseModel):
    id:           str
    participant_id: str
    team_id:      str
    what_i_built: str
    blockers:     Optional[str]
    hours_worked: Optional[int]
    update_date:  str
    submitted_at: str


# ── POST /daily-updates/submit  (participant submits their update) ────
@router.post("/submit", response_model=DailyUpdateResponse)
def submit_update(
    body:  DailyUpdateSubmit,
    token: str = Query(..., description="Participant JWT"),
    db:    Session = Depends(get_db),
):
    payload = decode_access_token(token)
    verify_token_role(payload, TokenRole.PARTICIPANT)
    participant_id = parse_uuid_subject(get_token_subject(payload))

    participant = db.query(Participant).filter(
        Participant.id == participant_id
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")
    if not participant.team_id:
        raise HTTPException(status_code=400,
                            detail="You must be assigned to a team before submitting updates.")

    today = date.today()

    # Check if already submitted today
    existing = db.query(DailyUpdate).filter(
        DailyUpdate.participant_id == participant_id,
        DailyUpdate.update_date == today,
    ).first()

    if existing:
        # Allow editing today's update
        existing.what_i_built = body.what_i_built
        existing.blockers     = body.blockers
        existing.hours_worked = body.hours_worked
        existing.submitted_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        update = existing
    else:
        update = DailyUpdate(
            participant_id = participant_id,
            team_id        = participant.team_id,
            what_i_built   = body.what_i_built,
            blockers       = body.blockers,
            hours_worked   = body.hours_worked,
            update_date    = today,
            submitted_at   = datetime.now(timezone.utc),
        )
        db.add(update)
        db.commit()
        db.refresh(update)

    return DailyUpdateResponse(
        id             = str(update.id),
        participant_id = str(update.participant_id),
        team_id        = str(update.team_id),
        what_i_built   = update.what_i_built,
        blockers       = update.blockers,
        hours_worked   = update.hours_worked,
        update_date    = str(update.update_date),
        submitted_at   = update.submitted_at.isoformat(),
    )


# ── GET /daily-updates/my-updates  (participant sees their history) ──
@router.get("/my-updates")
def get_my_updates(
    token: str = Query(...),
    db:    Session = Depends(get_db),
):
    payload = decode_access_token(token)
    verify_token_role(payload, TokenRole.PARTICIPANT)
    participant_id = parse_uuid_subject(get_token_subject(payload))

    updates = db.query(DailyUpdate).filter(
        DailyUpdate.participant_id == participant_id
    ).order_by(DailyUpdate.update_date.desc()).limit(14).all()

    return [
        {
            "id":           str(u.id),
            "what_i_built": u.what_i_built,
            "blockers":     u.blockers,
            "hours_worked": u.hours_worked,
            "update_date":  str(u.update_date),
            "submitted_at": u.submitted_at.isoformat(),
        }
        for u in updates
    ]


# ── GET /daily-updates/team/{team_id}  (admin/mentor sees team updates) ─
@router.get("/team/{team_id}")
def get_team_updates(
    team_id: UUID,
    db:      Session = Depends(get_db),
):
    updates = db.query(DailyUpdate).filter(
        DailyUpdate.team_id == team_id
    ).order_by(DailyUpdate.update_date.desc()).limit(30).all()

    return [
        {
            "id":             str(u.id),
            "participant_id": str(u.participant_id),
            "what_i_built":   u.what_i_built,
            "blockers":       u.blockers,
            "hours_worked":   u.hours_worked,
            "update_date":    str(u.update_date),
            "submitted_at":   u.submitted_at.isoformat(),
        }
        for u in updates
    ]