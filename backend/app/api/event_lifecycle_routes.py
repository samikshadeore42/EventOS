# backend/app/api/event_lifecycle_routes.py
import uuid

from fastapi import APIRouter, Depends

from app.core.auth_deps import get_current_user
from app.models.user import User
from app.services.event_scope import ScopedEventService, get_event_scope
from app.services.stage_service import StageService
from app.schemas.stage_schemas import PublishResponse

router = APIRouter(prefix="/events/{event_id}", tags=["Event Lifecycle"])

@router.post("/publish", response_model=PublishResponse)
def publish_event(
    scope: ScopedEventService = Depends(get_event_scope),
    actor: User = Depends(get_current_user),
):
    svc = StageService(db=scope.db, event_id=scope.event_id)
    return svc.publish_event(actor_user_id=actor.id)