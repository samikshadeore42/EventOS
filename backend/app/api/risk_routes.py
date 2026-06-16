import uuid
from typing import List

from fastapi import APIRouter, Depends

from app.core.auth_deps import RequireOrganizationRole
from app.core.capabilities import require_capability
from app.schemas.risk_schemas import RiskHistoryOut, RiskSummaryOut, RiskSweepResult, RiskTeamOut
from app.services.event_scope import ScopedEventService
from app.services.risk_intelligence_service import RiskIntelligenceService


router = APIRouter(prefix="/events/{event_id}/risk", tags=["risk"])
_admin_only = [Depends(RequireOrganizationRole("owner", "admin"))]


@router.get("/summary", response_model=RiskSummaryOut, dependencies=_admin_only)
def get_risk_summary(
    scope: ScopedEventService = Depends(require_capability("risk_monitoring")),
):
    return RiskIntelligenceService(scope.db, scope.event_id).get_summary()


@router.get("/teams", response_model=List[RiskTeamOut], dependencies=_admin_only)
def list_team_risks(
    scope: ScopedEventService = Depends(require_capability("risk_monitoring")),
):
    return RiskIntelligenceService(scope.db, scope.event_id).list_latest_team_risks()


@router.post("/sweep", response_model=RiskSweepResult, dependencies=_admin_only)
def run_risk_sweep(
    scope: ScopedEventService = Depends(require_capability("risk_monitoring")),
):
    return RiskIntelligenceService(scope.db, scope.event_id).run_sweep()


@router.get("/teams/{team_id}/history", response_model=List[RiskHistoryOut], dependencies=_admin_only)
def get_team_risk_history(
    team_id: uuid.UUID,
    scope: ScopedEventService = Depends(require_capability("risk_monitoring")),
):
    return RiskIntelligenceService(scope.db, scope.event_id).get_team_history(team_id)