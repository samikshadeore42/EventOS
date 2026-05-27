# File: backend/app/services/link_service.py
# Responsible for:
#   1. Generating secure portal URLs for participants and evaluators
#   2. Resolving portal access (decode token → load the right view)

import os
from datetime import timedelta
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.core.security import create_access_token, decode_access_token, get_token_subject
from app.models.participant import Participant, Team
from app.models.evaluation import Evaluator, Evaluation
from app.schemas.portal_schemas import (
    ParticipantPortalResponse,
    EvaluatorPortalResponse,
    TeamMemberPortalView,
)

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")


class LinkService:
    @staticmethod
    def generate_participant_link(
        participant_id: str,
        stage:          str    = "evaluation",
        expires_days:   int    = 7
    ) -> dict:
        token      = create_access_token(
            subject=participant_id,
            role="participant",
            stage=stage,
            expires_in=timedelta(days=expires_days)
        )
        portal_url = f"{FRONTEND_BASE_URL}/participant?token={token}"
        return {
            "entity_id":  participant_id,
            "role":       "participant",
            "token":      token,
            "portal_url": portal_url,
            "expires_in": f"{expires_days} days",
        }

    @staticmethod
    def generate_evaluator_link(
        evaluator_id: str,
        stage:        str = "evaluation",
        expires_days: int = 7
    ) -> dict:
        token      = create_access_token(
            subject=evaluator_id,
            role="evaluator",
            stage=stage,
            expires_in=timedelta(days=expires_days)
        )
        portal_url = f"{FRONTEND_BASE_URL}/judge?token={token}"
        return {
            "entity_id":  evaluator_id,
            "role":       "evaluator",
            "token":      token,
            "portal_url": portal_url,
            "expires_in": f"{expires_days} days",
        }

    @staticmethod
    def generate_all_participant_links(
        db: Session,
        stage: str = "evaluation"
    ) -> list[dict]:
        participants = db.query(Participant).all()
        return [
            {
                **LinkService.generate_participant_link(str(p.id), stage),
                "email": p.email,
                "name":  f"{p.first_name} {p.last_name}",
            }
            for p in participants
        ]

    @staticmethod
    def generate_all_evaluator_links(
        db: Session,
        stage: str = "evaluation"
    ) -> list[dict]:
        evaluators = db.query(Evaluator).filter(Evaluator.is_active == True).all() 
        return [
            {
                **LinkService.generate_evaluator_link(str(e.id), stage),
                "email": e.email,
                "name":  f"{e.first_name} {e.last_name}",
            }
            for e in evaluators
        ]

    @classmethod
    def resolve_portal_access(cls, token: str, db: Session) -> dict:
        payload = decode_access_token(token)
        role    = payload.get("role")
        subject = get_token_subject(payload)
        stage   = payload.get("stage", "unknown")

        if role == "participant":
            return cls._load_participant_view(subject, stage, db)
        elif role == "evaluator":
            return cls._load_evaluator_view(subject, stage, db)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown token role: {role}")

    @staticmethod
    def _load_participant_view(
        participant_id: str,
        stage:          str,
        db:             Session
    ) -> dict:
        participant = db.query(Participant).filter(
            Participant.id == participant_id
        ).first()

        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found.")

        team      = None
        teammates = []
        if participant.team_id:
            team = db.query(Team).filter(Team.id == participant.team_id).first()
            if team:
                all_members = db.query(Participant).filter(
                    Participant.team_id == team.id,
                    Participant.id != participant.id   
                ).all()
                teammates = [
                    TeamMemberPortalView(
                        name=f"{m.first_name} {m.last_name}",
                        institution=m.institution
                    )
                    for m in all_members
                ]

        return ParticipantPortalResponse(
            participant_id = str(participant.id),
            name           = f"{participant.first_name} {participant.last_name}",
            email          = participant.email,
            institution    = participant.institution,
            stage          = stage,
            team_assigned  = participant.team_id is not None,
            team_name      = team.team_name if team else None,
            team_rationale = team.rationale if team else None,
            teammates      = teammates,
            timeline       = [
                {"phase": "Registration",    "status": "completed"},
                {"phase": "Team Formation",  "status": "completed" if participant.team_id else "pending"},
                {"phase": "Evaluation",      "status": "active" if stage == "evaluation" else "pending"},
                {"phase": "Results",         "status": "pending"},
            ]
        ).model_dump()

    @staticmethod
    def _load_evaluator_view(
        evaluator_id: str,
        stage:        str,
        db:           Session
    ) -> dict:
        evaluator = db.query(Evaluator).filter(
            Evaluator.id == evaluator_id
        ).first()

        if not evaluator:
            raise HTTPException(status_code=404, detail="Evaluator not found.")

        from app.models.participant import Team
        from app.models.evaluation import Evaluation
        
        approved_teams = db.query(Team).filter(Team.is_approved == True).all()
        if not approved_teams:
            approved_teams = db.query(Team).all()

        submitted = db.query(Evaluation).filter(
            Evaluation.evaluator_id == evaluator_id
        ).all()
        submitted_team_ids = {str(e.team_id) for e in submitted}

        teams_data = [
            {
                "team_id":      str(t.id),
                "team_name":    t.team_name,
                "is_approved":  t.is_approved,
                "already_graded": str(t.id) in submitted_team_ids,
            }
            for t in approved_teams
        ]

        return EvaluatorPortalResponse(
            evaluator_id    = str(evaluator.id),
            name            = f"{evaluator.first_name} {evaluator.last_name}",
            email           = evaluator.email,
            stage           = stage,
            assigned_teams  = teams_data,
            grading_criteria = [
                {"key": "technical_depth",  "label": "Technical Depth",  "max": 10, "weight": 0.35},
                {"key": "innovation",       "label": "Innovation",        "max": 10, "weight": 0.25},
                {"key": "presentation",     "label": "Presentation",      "max": 10, "weight": 0.20},
                {"key": "feasibility",      "label": "Feasibility",       "max": 10, "weight": 0.20},
            ],
            submitted_count = len(submitted_team_ids),
            total_assigned  = len(approved_teams),
        ).model_dump()