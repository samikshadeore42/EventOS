# backend/app/api/daily_update_routes.py
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import TokenRole, decode_access_token, get_token_subject, parse_uuid_subject, verify_token_role
from app.models.daily_update import DailyUpdate
from app.models.participant import Participant, Team


router = APIRouter(prefix="/events/{event_id}/daily-updates", tags=["Daily Updates"])


class DailyUpdateSubmit(BaseModel):
    what_i_built: str = Field(..., min_length=1, max_length=5000)
    blockers: str | None = Field(default=None, max_length=2000)
    hours_worked: int | None = Field(default=None, ge=0, le=24)


class DailyUpdateResponse(BaseModel):
    id: str
    participant_id: str
    team_id: str
    what_i_built: str
    blockers: str | None
    hours_worked: int | None
    update_date: str
    submitted_at: str


def _participant_from_token(event_id: UUID, token: str, db: Session) -> Participant:
    payload = decode_access_token(token)
    verify_token_role(payload, TokenRole.PARTICIPANT)

    token_event_id = payload.get("event_id")
    if str(token_event_id) != str(event_id):
        raise HTTPException(status_code=403, detail="Token does not belong to this event.")

    participant_id = parse_uuid_subject(get_token_subject(payload))
    participant = db.query(Participant).filter(
        Participant.id == participant_id,
        Participant.event_id == event_id,
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")

    return participant


@router.post("/submit", response_model=DailyUpdateResponse)
def submit_update(
    event_id: UUID,
    body: DailyUpdateSubmit,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    participant = _participant_from_token(event_id, token, db)

    if not participant.team_id:
        raise HTTPException(
            status_code=400,
            detail="You must be assigned to a team before submitting updates.",
        )

    team = db.query(Team).filter(
        Team.id == participant.team_id,
        Team.event_id == event_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Participant team not found in this event.")

    today = date.today()

    update = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.participant_id == participant.id,
        DailyUpdate.update_date == today,
    ).first()

    if update:
        update.what_i_built = body.what_i_built
        update.blockers = body.blockers
        update.hours_worked = body.hours_worked
        update.submitted_at = datetime.now(timezone.utc)
    else:
        update = DailyUpdate(
            event_id=event_id,
            participant_id=participant.id,
            team_id=participant.team_id,
            what_i_built=body.what_i_built,
            blockers=body.blockers,
            hours_worked=body.hours_worked,
            update_date=today,
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(update)

    db.commit()
    db.refresh(update)

    return DailyUpdateResponse(
        id=str(update.id),
        participant_id=str(update.participant_id),
        team_id=str(update.team_id),
        what_i_built=update.what_i_built,
        blockers=update.blockers,
        hours_worked=update.hours_worked,
        update_date=str(update.update_date),
        submitted_at=update.submitted_at.isoformat(),
    )


@router.get("/my-updates")
def get_my_updates(
    event_id: UUID,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    participant = _participant_from_token(event_id, token, db)

    updates = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.participant_id == participant.id,
    ).order_by(DailyUpdate.update_date.desc()).limit(14).all()

    return [
        {
            "id": str(update.id),
            "what_i_built": update.what_i_built,
            "blockers": update.blockers,
            "hours_worked": update.hours_worked,
            "update_date": str(update.update_date),
            "submitted_at": update.submitted_at.isoformat(),
        }
        for update in updates
    ]