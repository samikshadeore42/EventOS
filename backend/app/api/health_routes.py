# backend/app/api/health_routes.py
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.services.health_service import compute_all_teams_risk, compute_team_risk
import json

router = APIRouter(prefix="/health-dashboard", tags=["Health Dashboard"])

CACHE_KEY = "health:all_teams"
CACHE_TTL = 60 * 60  # 1 hour — recalculated by scheduler


# ── GET /health-dashboard/teams ──────────────────────────────────────
@router.get("/teams")
def get_all_teams_health(db: Session = Depends(get_db)):
    """
    Returns risk scores for all approved teams.
    Reads from Redis cache if available (refreshed hourly by scheduler).
    Falls back to live calculation if cache is cold.
    """
    r = get_redis()
    cached = r.get(CACHE_KEY)
    if cached:
        return json.loads(cached)

    # Cache miss — compute live and store
    results = compute_all_teams_risk(db)
    r.set(CACHE_KEY, json.dumps(results), ex=CACHE_TTL)
    return results


# ── GET /health-dashboard/team/{team_id} ────────────────────────────
@router.get("/team/{team_id}")
def get_team_health(team_id: UUID, db: Session = Depends(get_db)):
    """Live (non-cached) risk calculation for one team."""
    result = compute_team_risk(team_id, db)
    if not result:
        raise HTTPException(status_code=404, detail="Team not found.")
    return result


# ── POST /health-dashboard/refresh ──────────────────────────────────
@router.post("/refresh")
def refresh_health_cache(db: Session = Depends(get_db)):
    """
    Admin manually triggers a cache refresh.
    Also called by the Celery Beat scheduler every hour.
    """
    results = compute_all_teams_risk(db)
    r = get_redis()
    r.set(CACHE_KEY, json.dumps(results), ex=CACHE_TTL)
    return {
        "message":       f"Health cache refreshed for {len(results)} teams.",
        "teams_at_risk": sum(1 for t in results if t["risk_level"] in ("high", "critical")),
    }
