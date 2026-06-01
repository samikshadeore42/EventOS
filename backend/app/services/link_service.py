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
from app.models.mentor import Mentor, MentorAssignment
from app.schemas.portal_schemas import (
    ParticipantPortalResponse,
    EvaluatorPortalResponse,
    TeamMemberPortalView,
)


# BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
FRONTEND_URL = (
    os.getenv("FRONTEND_BASE_URL")
    or os.getenv("FRONTEND_URL")
    or "http://localhost:5173"
)


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
        portal_url = f"{FRONTEND_URL}/participant?token={token}"
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
        portal_url = f"{FRONTEND_URL}/judge?token={token}"
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

    @staticmethod
    def generate_mentor_link(
        mentor_id: str,
        stage:        str = "mentoring",
        expires_days: int = 7
    ) -> dict:
        token      = create_access_token(
            subject=mentor_id,
            role="mentor",
            stage=stage,
            expires_in=timedelta(days=expires_days)
        )
        portal_url = f"{FRONTEND_URL}/mentor?token={token}"
        return {
            "entity_id":  mentor_id,
            "role":       "mentor",
            "token":      token,
            "portal_url": portal_url,
            "expires_in": f"{expires_days} days",
        }

    @staticmethod
    def send_mentor_access_link(mentor_id: str, db: Session) -> dict:
        """Generate + email a magic link to a mentor using the existing email system."""
        from app.services.email_service import EmailService

        mentor = db.query(Mentor).filter(Mentor.id == mentor_id).first()
        if not mentor:
            raise HTTPException(status_code=404, detail="Mentor not found.")

        # Count assigned teams
        team_count = db.query(MentorAssignment).filter(
            MentorAssignment.mentor_id == mentor.id,
            MentorAssignment.is_active == True,
        ).count()

        if team_count == 0:
            raise HTTPException(
                status_code=422,
                detail="Assign this mentor to at least one team before sending a portal link."
            )

        link_data = LinkService.generate_mentor_link(str(mentor.id))

        result = EmailService.send_access_link(
            to_email=mentor.email,
            recipient_name=f"{mentor.first_name} {mentor.last_name}",
            role="Mentor",
            stage="mentoring",
            portal_url=link_data["portal_url"],
            expires_in=link_data["expires_in"],
        )

        is_success = result.get("success", False)
        if is_success:
            mentor.access_link_sent = True
            db.commit()
        else:
            mentor.access_link_sent = False
            db.commit()
            raise HTTPException(
                status_code=502,
                detail=f"Email delivery failed: {result.get('error', 'Unknown error')}"
            )

        return {
            **link_data,
            "email_sent": True,
            "simulated": result.get("simulated", False),
            "assigned_teams": team_count,
            "provider": result.get("provider"),
            "message_id": result.get("message_id")
        }

    @staticmethod
    def generate_all_mentor_links(
        db: Session,
        stage: str = "mentoring"
    ) -> list[dict]:
        mentors = db.query(Mentor).filter(Mentor.is_active == True).all()
        return [
            {
                **LinkService.generate_mentor_link(str(m.id), stage),
                "email": m.email,
                "name":  f"{m.first_name} {m.last_name}",
            }
            for m in mentors
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
        elif role == "mentor":
            return cls._load_mentor_view(subject, stage, db)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown token role: {role}")

    @staticmethod
    def _load_participant_view(
        participant_id: str,
        stage:          str,
        db:             Session
    ) -> dict:
        from app.services.event_state_service import get_event_state
        current_stage = get_event_state(db).current_stage

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
            stage          = current_stage,
            team_assigned  = participant.team_id is not None,
            team_name      = team.team_name if team else None,
            team_rationale = team.rationale if team else None,
            teammates      = teammates,
            timeline       = [
                {"phase": "Registration",    "status": "completed"},
                {"phase": "Team Formation",  "status": "completed" if participant.team_id else ("active" if current_stage == "team_formation" else ("pending" if current_stage == "registration" else "completed"))},
                {"phase": "Evaluation",      "status": "active" if current_stage == "evaluation" else ("completed" if current_stage == "results" else "pending")},
                {"phase": "Results",         "status": "active" if current_stage == "results" else "pending"},
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

    @staticmethod
    def _load_mentor_view(
        mentor_id: str,
        stage:     str,
        db:        Session
    ) -> dict:
        mentor = db.query(Mentor).filter(Mentor.id == mentor_id).first()
        if not mentor:
            raise HTTPException(status_code=404, detail="Mentor not found.")

        from app.services.mentor_service import MentorService
        portal_me = MentorService.get_mentor_portal_me(db, mentor.id)

        return {
            "role": "mentor",
            **portal_me.model_dump(),
        }
