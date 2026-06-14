# File: backend/app/core/capabilities.py
from fastapi import Depends, HTTPException, status

from app.services.event_scope import ScopedEventService, get_event_scope


CAPABILITY_REGISTRY = {
    "teams": {"label": "Teams"},
    "mentors": {"label": "Mentors"},
    "evaluators": {"label": "Evaluators"},
    "problem_statements": {"label": "Problem statements"},
    "submissions": {"label": "Submissions"},
    "weighted_scoring": {"label": "Weighted scoring"},
    "live_scoring": {"label": "Live scoring"},
    "leaderboard": {"label": "Leaderboard"},
    "risk_monitoring": {"label": "Risk monitoring"},
    "presentation_evaluation": {"label": "Presentation evaluation"},
    "matches": {"label": "Matches"},
    "fixtures": {"label": "Fixtures"},
    "elimination": {"label": "Elimination"},
}


IMPOSSIBLE_COMBINATIONS = [
    {"matches", "problem_statements"},
    {"fixtures", "presentation_evaluation"},
]


def validate_capabilities(capabilities: list[str]) -> list[str]:
    normalized = []
    seen = set()

    for capability in capabilities:
        key = capability.strip().lower()
        if key not in CAPABILITY_REGISTRY:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown capability: {capability}",
            )
        if key not in seen:
            normalized.append(key)
            seen.add(key)

    selected = set(normalized)
    for combo in IMPOSSIBLE_COMBINATIONS:
        if combo.issubset(selected):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Impossible capability combination: {sorted(combo)}",
            )

    return normalized


def require_capability(capability: str):
    def dependency(scope: ScopedEventService = Depends(get_event_scope)) -> ScopedEventService:
        if capability not in (scope.event.active_capabilities or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This event does not enable capability: {capability}",
            )
        return scope

    return dependency