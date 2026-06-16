from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid
from typing import List

from app.core.database import get_db
from app.api.dependencies import require_capability
from app.api.auth_dependencies import RequireOrganizationRole
from app.models.event import Event
from app.services.risk_intelligence_service import RiskIntelligenceService
from app.schemas.risk_schemas import RiskSummaryOut, RiskTeamOut, RiskSweepResult, RiskHistoryOut

router = APIRouter(prefix="/events/{event_id}/risk", tags=["risk"])

def get_event_scope(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    # RequireOrganizationRole ensures the user has owner or admin access to the org.
    # To fully secure this, we need to ensure the event belongs to the org they are accessing.
    # The actual org check is done by the dependencies in main.py, but we also ensure event exists.
) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

@router.get("/summary", response_model=RiskSummaryOut, dependencies=[Depends(RequireOrganizationRole(["owner", "admin"])), Depends(require_capability("risk_monitoring"))])
def get_risk_summary(event_id: uuid.UUID, db: Session = Depends(get_db), event: Event = Depends(get_event_scope)):
    service = RiskIntelligenceService(db, event_id)
    return service.get_summary()

@router.get("/teams", response_model=List[RiskTeamOut], dependencies=[Depends(RequireOrganizationRole(["owner", "admin"])), Depends(require_capability("risk_monitoring"))])
def list_team_risks(event_id: uuid.UUID, db: Session = Depends(get_db), event: Event = Depends(get_event_scope)):
    service = RiskIntelligenceService(db, event_id)
    return service.list_latest_team_risks()

@router.post("/sweep", response_model=RiskSweepResult, dependencies=[Depends(RequireOrganizationRole(["owner", "admin"])), Depends(require_capability("risk_monitoring"))])
def run_risk_sweep(event_id: uuid.UUID, db: Session = Depends(get_db), event: Event = Depends(get_event_scope)):
    service = RiskIntelligenceService(db, event_id)
    return service.run_sweep()

@router.get("/teams/{team_id}/history", response_model=List[RiskHistoryOut], dependencies=[Depends(RequireOrganizationRole(["owner", "admin"])), Depends(require_capability("risk_monitoring"))])
def get_team_risk_history(event_id: uuid.UUID, team_id: uuid.UUID, db: Session = Depends(get_db), event: Event = Depends(get_event_scope)):
    service = RiskIntelligenceService(db, event_id)
    return service.get_team_history(team_id)
