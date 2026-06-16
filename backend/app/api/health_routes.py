# backend/app/api/health_routes.py
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth_deps import RequireOrganizationRole
from app.core.capabilities import require_capability
from app.core.redis_client import get_redis
from app.services.event_scope import ScopedEventService
from app.services.health_service import compute_all_teams_risk, compute_team_risk


router = APIRouter(prefix="/events/{event_id}/health-dashboard", tags=["Health Dashboard"])

CACHE_TTL = 60 * 60


def _cache_key(event_id) -> str:
    return f"health:{event_id}:all_teams"


@router.get("/teams", dependencies=[Depends(RequireOrganizationRole("owner", "admin"))])
def get_all_teams_health(
    scope: ScopedEventService = Depends(require_capability("risk_monitoring")),
):
    redis = get_redis()
    key = _cache_key(scope.event_id)

    cached = redis.get(key)
    if cached:
        return json.loads(cached)

    results = compute_all_teams_risk(scope.event_id, scope.db)
    redis.set(key, json.dumps(results), ex=CACHE_TTL)
    return results


@router.get("/team/{team_id}", dependencies=[Depends(RequireOrganizationRole("owner", "admin"))])
def get_team_health(
    team_id: UUID,
    scope: ScopedEventService = Depends(require_capability("risk_monitoring")),
):
    result = compute_team_risk(scope.event_id, team_id, scope.db)
    if not result:
        raise HTTPException(status_code=404, detail="Team not found.")
    return result


@router.post("/refresh", dependencies=[Depends(RequireOrganizationRole("owner", "admin"))])
def refresh_health_cache(
    scope: ScopedEventService = Depends(require_capability("risk_monitoring")),
):
    results = compute_all_teams_risk(scope.event_id, scope.db)
    redis = get_redis()
    redis.set(_cache_key(scope.event_id), json.dumps(results), ex=CACHE_TTL)

    return {
        "message": f"Health cache refreshed for {len(results)} teams.",
        "teams_at_risk": sum(1 for team in results if team["risk_level"] in ("high", "critical")),
    }