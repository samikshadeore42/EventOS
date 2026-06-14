# File: backend/app/api/evaluator_routes.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from app.core.database import get_db
from app.core.capabilities import require_capability
from app.services.event_scope import ScopedEventService
from app.models.evaluation import Evaluator
from app.services.link_service import LinkService
from app.models.assignment import EvaluatorTeamAssignment
from app.schemas.evaluation_schemas import EvaluatorAssignmentRequest

# 1. Update Prefix
router = APIRouter(prefix="/events/{event_id}/evaluators", tags=["Evaluators"])


class EvaluatorCreate(BaseModel):
    first_name:      str = Field(..., min_length=1, max_length=50)
    last_name:       str = Field(..., min_length=1, max_length=50)
    email:           EmailStr
    expertise_areas: List[str] = Field(default_factory=list)
    passed_out_institution: Optional[str] = None


class EvaluatorResponse(BaseModel):
    id:              uuid.UUID
    first_name:      str
    last_name:       str
    email:           str
    expertise_areas: list
    passed_out_institution: Optional[str] = None
    is_active:       bool
    access_link_sent: bool
    model_config = {"from_attributes": True}


@router.get("", summary="List all evaluators")
def list_evaluators(scope: ScopedEventService = Depends(require_capability("evaluators"))):
    # Scope query to event
    evaluators = scope.db.query(Evaluator).filter(
        Evaluator.event_id == scope.event_id
    ).order_by(Evaluator.created_at.desc()).all()
    
    return {
        "total": len(evaluators),
        "evaluators": [EvaluatorResponse.model_validate(e) for e in evaluators]
    }


@router.post("", status_code=201, response_model=EvaluatorResponse, summary="Register a new evaluator/judge")
def create_evaluator(body: EvaluatorCreate, scope: ScopedEventService = Depends(require_capability("evaluators"))):
    existing = scope.db.query(Evaluator).filter(
        Evaluator.email == body.email.lower(),
        Evaluator.event_id == scope.event_id # Scope uniqueness to the event
    ).first()
    
    if existing:
        raise HTTPException(status_code=409,
            detail=f"Evaluator with email '{body.email}' already exists in this event.")
            
    e = Evaluator(
        event_id=scope.event_id, # Bind to event
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        email=body.email.lower().strip(),
        expertise_areas=body.expertise_areas,
        passed_out_institution=body.passed_out_institution,
        is_active=True,
    )
    scope.db.add(e)
    scope.db.commit()
    scope.db.refresh(e)
    return e


@router.get("/{evaluator_id}", response_model=EvaluatorResponse, summary="Get a single evaluator")
def get_evaluator(evaluator_id: uuid.UUID, scope: ScopedEventService = Depends(require_capability("evaluators"))):
    e = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    return e


@router.patch("/{evaluator_id}", response_model=EvaluatorResponse, summary="Update an evaluator")
def update_evaluator(
    evaluator_id: uuid.UUID,
    body: dict,
    scope: ScopedEventService = Depends(require_capability("evaluators"))
):
    e = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
        
    for field, val in body.items():
        if hasattr(e, field):
            setattr(e, field, val)
    scope.db.commit()
    scope.db.refresh(e)
    return e


@router.delete("/{evaluator_id}", summary="Remove an evaluator")
def delete_evaluator(evaluator_id: uuid.UUID, scope: ScopedEventService = Depends(require_capability("evaluators"))):
    e = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    scope.db.delete(e)
    scope.db.commit()
    return {"deleted": True, "id": str(evaluator_id)}


@router.post("/{evaluator_id}/send-access-link", summary="Generate and email an access link to this evaluator")
def send_evaluator_link(
    evaluator_id: uuid.UUID,
    stage: str = "evaluation",
    scope: ScopedEventService = Depends(require_capability("evaluators"))
):
    e = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")

    link_data = LinkService.generate_evaluator_link(scope.event_id, str(evaluator_id), stage)
    
    from app.services.email_service import EmailService
    result = EmailService.send_access_link(
        event_id=scope.event_id,
        to_email=e.email,
        recipient_name=f"{e.first_name} {e.last_name}",
        role="evaluator",
        stage=stage,
        portal_url=link_data["portal_url"],
        expires_in=link_data["expires_in"],
        event_name=scope.event.name
    )
    
    if result.get("success", False):
        e.access_link_sent = True
        scope.db.commit()
    else:
        e.access_link_sent = False
        scope.db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"Email delivery failed: {result.get('error', 'Unknown error')}"
        )

    return {
        "message": f"Access link sent to {e.email}.",
        "email_sent": True,
        "simulated": result.get("simulated", False),
        "provider": result.get("provider"),
        "message_id": result.get("message_id"),
        "portal_url": link_data["portal_url"]
    }

@router.get("/{evaluator_id}/assignments", summary="Get teams assigned to an evaluator")
def get_evaluator_assignments(evaluator_id: uuid.UUID, scope: ScopedEventService = Depends(require_capability("evaluators"))):
    e = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    
    from app.models.participant import Team
    assignments = scope.db.query(EvaluatorTeamAssignment).filter_by(
        evaluator_id=evaluator_id,
        event_id=scope.event_id
    ).all()
    
    team_ids = [a.team_id for a in assignments]
    teams = scope.db.query(Team).filter(
        Team.id.in_(team_ids),
        Team.event_id == scope.event_id
    ).all() if team_ids else []
    
    return {
        "evaluator_id": str(evaluator_id),
        "teams": [
            {"team_id": str(t.id), "team_name": t.team_name, "is_approved": t.is_approved}
            for t in teams
        ]
    }

def _normalize_institution(value):
    """Trim, lowercase, collapse whitespace for institution comparison."""
    return " ".join((value or "").strip().lower().split())

@router.post("/assign", summary="Assign an evaluator to specific teams")
def assign_evaluator(
    payload: EvaluatorAssignmentRequest,
    scope: ScopedEventService = Depends(require_capability("evaluators"))
):
    from app.models.participant import Team
    
    evaluator = scope.db.query(Evaluator).filter(
        Evaluator.id == payload.evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
        
    eval_inst = _normalize_institution(evaluator.passed_out_institution)
    
    # Validation Phase
    for t_id in payload.team_ids:
        team = scope.db.query(Team).filter(
            Team.id == t_id,
            Team.event_id == scope.event_id
        ).first()
        if not team:
            raise HTTPException(status_code=404, detail=f"Team {t_id} not found in this event.")
            
        # Check conflict of interest
        if eval_inst:
            member_institutions = {_normalize_institution(m.institution) for m in team.members}
            if eval_inst in member_institutions:
                raise HTTPException(
                    status_code=422,
                    detail=f"Conflict of interest: Evaluator is from '{evaluator.passed_out_institution}', which matches team '{team.team_name}'."
                )

    # Modification Phase
    scope.db.query(EvaluatorTeamAssignment).filter_by(
        evaluator_id=payload.evaluator_id,
        event_id=scope.event_id
    ).delete()
    
    for t_id in payload.team_ids:
        new_assignment = EvaluatorTeamAssignment(
            event_id=scope.event_id, # Bind to event
            evaluator_id=payload.evaluator_id,
            team_id=t_id
        )
        scope.db.add(new_assignment)
        
    scope.db.commit()
    
    return {
        "status":"success",
        "message": f"Evaluator {payload.evaluator_id} assigned to {len(payload.team_ids)} teams in this event."
    }