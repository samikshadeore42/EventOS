# backend/app/api/notification_routes.py
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.auth_deps import get_current_user
from app.models.user import User
from app.services.event_scope import ScopedEventService, get_event_scope
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/events/{event_id}/notifications", tags=["Notifications"])


def _roles_for(db, org_id, user_id) -> list[str]:
    """The current user's org-level roles — used so role-broadcast notifications
    (e.g. 'owner') also surface in their inbox."""
    from app.models.organization_membership import OrganizationMembership
    rows = db.query(OrganizationMembership.role).filter(
        OrganizationMembership.organization_id == org_id,
        OrganizationMembership.user_id == user_id,
        OrganizationMembership.status == "active",
    ).all()
    return [r[0] for r in rows]


def _svc(scope: ScopedEventService) -> NotificationService:
    return NotificationService(scope.db, scope.event_id)


@router.get("")
def list_notifications(
    unread_only: bool = False,
    scope: ScopedEventService = Depends(get_event_scope),
    user: User = Depends(get_current_user),
):
    roles = _roles_for(scope.db, scope.event.organization_id, user.id)
    items = _svc(scope).list_for_user(user.id, roles=roles, unread_only=unread_only)
    return [
        {
            "id": str(n.id),
            "title": n.title,
            "message": n.message,
            "notification_type": n.notification_type,
            "read": n.read_at is not None,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in items
    ]


@router.get("/unread-count")
def unread_count(
    scope: ScopedEventService = Depends(get_event_scope),
    user: User = Depends(get_current_user),
):
    roles = _roles_for(scope.db, scope.event.organization_id, user.id)
    return {"unread": _svc(scope).unread_count(user.id, roles=roles)}


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: uuid.UUID,
    scope: ScopedEventService = Depends(get_event_scope),
    user: User = Depends(get_current_user),
):
    notif = _svc(scope).mark_read(notification_id, user.id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"id": str(notif.id), "read": notif.read_at is not None}


@router.post("/read-all")
def mark_all_read(
    scope: ScopedEventService = Depends(get_event_scope),
    user: User = Depends(get_current_user),
):
    roles = _roles_for(scope.db, scope.event.organization_id, user.id)
    count = _svc(scope).mark_all_read(user.id, roles=roles)
    return {"marked_read": count}
