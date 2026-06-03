# File: backend/app/api/evaluator_routes.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from app.core.database import get_db
from app.models.evaluation import Evaluator
from app.services.link_service import LinkService
from app.models.assignment import EvaluatorTeamAssignment
from app.schemas.evaluation_schemas import EvaluatorAssignmentRequest

router = APIRouter(prefix="/evaluators", tags=["Evaluators"])


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
def list_evaluators(db: Session = Depends(get_db)):
    evaluators = db.query(Evaluator).order_by(Evaluator.created_at.desc()).all()
    return {
        "total": len(evaluators),
        "evaluators": [EvaluatorResponse.model_validate(e) for e in evaluators]
    }


@router.post("", status_code=201, response_model=EvaluatorResponse,
             summary="Register a new evaluator/judge")
def create_evaluator(body: EvaluatorCreate, db: Session = Depends(get_db)):
    existing = db.query(Evaluator).filter(
        Evaluator.email == body.email.lower()
    ).first()
    if existing:
        raise HTTPException(status_code=409,
            detail=f"Evaluator with email '{body.email}' already exists.")
    e = Evaluator(
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        email=body.email.lower().strip(),
        expertise_areas=body.expertise_areas,
        passed_out_institution=body.passed_out_institution,
        is_active=True,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.get("/{evaluator_id}", response_model=EvaluatorResponse,
            summary="Get a single evaluator")
def get_evaluator(evaluator_id: uuid.UUID, db: Session = Depends(get_db)):
    e = db.query(Evaluator).filter(Evaluator.id == evaluator_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    return e


@router.patch("/{evaluator_id}", response_model=EvaluatorResponse,
              summary="Update an evaluator")
def update_evaluator(
    evaluator_id: uuid.UUID,
    body: dict,
    db: Session = Depends(get_db)
):
    e = db.query(Evaluator).filter(Evaluator.id == evaluator_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    for field, val in body.items():
        if hasattr(e, field):
            setattr(e, field, val)
    db.commit()
    db.refresh(e)
    return e


@router.delete("/{evaluator_id}", summary="Remove an evaluator")
def delete_evaluator(evaluator_id: uuid.UUID, db: Session = Depends(get_db)):
    e = db.query(Evaluator).filter(Evaluator.id == evaluator_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    db.delete(e)
    db.commit()
    return {"deleted": True, "id": str(evaluator_id)}


@router.post("/{evaluator_id}/send-access-link",
             summary="Generate and email an access link to this evaluator")
def send_evaluator_link(
    evaluator_id: uuid.UUID,
    stage: str = "evaluation",
    db: Session = Depends(get_db)
):
    e = db.query(Evaluator).filter(Evaluator.id == evaluator_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")

    link_data = LinkService.generate_evaluator_link(str(evaluator_id), stage)
    
    from app.services.email_service import EmailService
    result = EmailService.send_access_link(
        to_email=e.email,
        recipient_name=f"{e.first_name} {e.last_name}",
        role="evaluator",
        stage=stage,
        portal_url=link_data["portal_url"],
        expires_in=link_data["expires_in"]
    )
    
    if result.get("success", False):
        e.access_link_sent = True
        db.commit()
    else:
        e.access_link_sent = False
        db.commit()
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
def get_evaluator_assignments(evaluator_id: uuid.UUID, db: Session = Depends(get_db)):
    e = db.query(Evaluator).filter(Evaluator.id == evaluator_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    
    from app.models.participant import Team
    assignments = db.query(EvaluatorTeamAssignment).filter_by(evaluator_id=evaluator_id).all()
    team_ids = [a.team_id for a in assignments]
    teams = db.query(Team).filter(Team.id.in_(team_ids)).all() if team_ids else []
    
    return {
        "evaluator_id": str(evaluator_id),
        "teams": [
            {"team_id": str(t.id), "team_name": t.team_name, "is_approved": t.is_approved}
            for t in teams
        ]
    }

@router.post("/assign", summary="Assign an evaluator to specific teams")
def assign_evaluator(
    payload: EvaluatorAssignmentRequest,
    db: Session = Depends(get_db)
):
    from app.models.participant import Team
    
    evaluator = db.query(Evaluator).filter(Evaluator.id == payload.evaluator_id).first()
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
        
    db.query(EvaluatorTeamAssignment).filter_by(evaluator_id=payload.evaluator_id).delete()
    
    for t_id in payload.team_ids:
        # Check conflict of interest
        team = db.query(Team).filter(Team.id == t_id).first()
        if team and evaluator.passed_out_institution:
            member_institutions = {m.institution for m in team.members}
            if evaluator.passed_out_institution in member_institutions:
                raise HTTPException(
                    status_code=422,
                    detail=f"Conflict of interest: Evaluator is from {evaluator.passed_out_institution}, which matches team '{team.team_name}'."
                )
                
        new_assignment = EvaluatorTeamAssignment(
            evaluator_id=payload.evaluator_id,
            team_id=t_id
        )
        db.add(new_assignment)
    db.commit()
    
    return {
        "status":"success",
        "message": f"Evaluator {payload.evaluator_id} assigned to {len(payload.team_ids)} teams."
    }
