# File: backend/app/api/evaluator_routes.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from app.core.database import get_db
from app.models.evaluation import Evaluator
from app.services.link_service import LinkService

router = APIRouter(prefix="/evaluators", tags=["Evaluators"])


class EvaluatorCreate(BaseModel):
    first_name:      str = Field(..., min_length=1, max_length=50)
    last_name:       str = Field(..., min_length=1, max_length=50)
    email:           EmailStr
    expertise_areas: List[str] = Field(default_factory=list)


class EvaluatorResponse(BaseModel):
    id:              uuid.UUID
    first_name:      str
    last_name:       str
    email:           str
    expertise_areas: list
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
    link_data["email"] = e.email
    link_data["name"]  = f"{e.first_name} {e.last_name}"

    from app.tasks.communications import send_access_links
    send_access_links.delay(links=[link_data], role="evaluator", stage=stage)

    e.access_link_sent = True
    db.commit()

    return {
        "message":    f"Access link dispatched to {e.email}.",
        "portal_url": link_data["portal_url"],
        "expires_in": link_data["expires_in"],
    }
