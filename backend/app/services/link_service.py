# File: backend/app/services/link_service.py
import os
import uuid
from datetime import timedelta
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.core.security import create_access_token, decode_access_token, get_token_subject, parse_uuid_subject
from app.models.participant import Participant, Team
from app.models.event import Event
from app.models.evaluation import Evaluator, Evaluation
from app.models.mentor import Mentor, MentorAssignment
from app.schemas.portal_schemas import (
    ParticipantPortalResponse,
    EvaluatorPortalResponse,
    TeamMemberPortalView,
)

FRONTEND_URL = (
    os.getenv("FRONTEND_BASE_URL")
    or os.getenv("FRONTEND_URL")
    or "http://localhost:5173"
)


class LinkService:
    @staticmethod
    def generate_participant_link(
        event_id:       uuid.UUID,
        participant_id: str,
        stage:          str    = "evaluation",
        expires_days:   int    = 7
    ) -> dict:
        # 1. Embed event_id deeply into the JWT payload
        token      = create_access_token(
            subject=participant_id,
            role="participant",
            stage=stage,
            event_id=str(event_id), # <-- Security constraint
            expires_in=timedelta(days=expires_days)
        )
        # 2. Add event_id to the frontend URL route
        portal_url = f"{FRONTEND_URL}/events/{event_id}/portal/participant?token={token}"
        return {
            "entity_id":  participant_id,
            "role":       "participant",
            "token":      token,
            "portal_url": portal_url,
            "expires_in": f"{expires_days} days",
        }

    @staticmethod
    def generate_evaluator_link(
        event_id:     uuid.UUID,
        evaluator_id: str,
        stage:        str = "evaluation",
        expires_days: int = 7
    ) -> dict:
        token      = create_access_token(
            subject=evaluator_id,
            role="evaluator",
            stage=stage,
            event_id=str(event_id), # <-- Security constraint
            expires_in=timedelta(days=expires_days)
        )
        # 2. Add event_id to the frontend URL route
        portal_url = f"{FRONTEND_URL}/events/{event_id}/portal/judge?token={token}"
        return {
            "entity_id":  evaluator_id,
            "role":       "evaluator",
            "token":      token,
            "portal_url": portal_url,
            "expires_in": f"{expires_days} days",
        }

    @staticmethod
    def generate_all_participant_links(
        event_id: uuid.UUID,
        db: Session,
        stage: str = "evaluation"
    ) -> list[dict]:
        # Scope participants to the event
        participants = db.query(Participant).filter(Participant.event_id == event_id).all()
        return [
            {
                **LinkService.generate_participant_link(event_id, str(p.id), stage),
                "email": p.email,
                "name":  f"{p.first_name} {p.last_name}",
            }
            for p in participants
        ]

    @staticmethod
    def generate_all_evaluator_links(
        event_id: uuid.UUID,
        db: Session,
        stage: str = "evaluation"
    ) -> list[dict]:
        # Scope evaluators to the event
        evaluators = db.query(Evaluator).filter(
            Evaluator.event_id == event_id,
            Evaluator.is_active == True
        ).all()
        return [
            {
                **LinkService.generate_evaluator_link(event_id, str(e.id), stage),
                "email": e.email,
                "name":  f"{e.first_name} {e.last_name}",
            }
            for e in evaluators
        ]

    @staticmethod
    def generate_mentor_link(
        event_id:     uuid.UUID,
        mentor_id: str,
        stage:        str = "mentoring",
        expires_days: int = 7
    ) -> dict:
        token      = create_access_token(
            subject=mentor_id,
            role="mentor",
            stage=stage,
            event_id=str(event_id), # <-- Security constraint
            expires_in=timedelta(days=expires_days)
        )
        portal_url = f"{FRONTEND_URL}/events/{event_id}/portal/mentor?token={token}"
        return {
            "entity_id":  mentor_id,
            "role":       "mentor",
            "token":      token,
            "portal_url": portal_url,
            "expires_in": f"{expires_days} days",
        }

    @staticmethod
    def send_mentor_access_link(event_id: uuid.UUID, mentor_id: str, db: Session) -> dict:
        from app.services.email_service import EmailService

        mentor = db.query(Mentor).filter(
            Mentor.id == mentor_id,
            Mentor.event_id == event_id
        ).first()
        if not mentor:
            raise HTTPException(status_code=404, detail="Mentor not found in this event.")

        team_count = db.query(MentorAssignment).filter(
            MentorAssignment.mentor_id == mentor.id,
            MentorAssignment.is_active == True,
            # Note: Assuming assignments cascade or are similarly scoped
        ).count()

        if team_count == 0:
            raise HTTPException(
                status_code=422,
                detail="Assign this mentor to at least one team before sending a portal link."
            )

        link_data = LinkService.generate_mentor_link(event_id, str(mentor.id))

        # Dynamically fetch event name
        from app.models.event import Event
        event_obj = db.query(Event).filter(Event.id == event_id).first()
        event_name = event_obj.name if event_obj else "EventOS Hackathon"

        result = EmailService.send_access_link(
            event_id=event_id,
            to_email=mentor.email,
            recipient_name=f"{mentor.first_name} {mentor.last_name}",
            role="Mentor",
            stage="mentoring",
            portal_url=link_data["portal_url"],
            expires_in=link_data["expires_in"],
            event_name=event_name # Inject event name into email
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
        event_id: uuid.UUID,
        db: Session,
        stage: str = "mentoring"
    ) -> list[dict]:
        mentors = db.query(Mentor).filter(
            Mentor.event_id == event_id,
            Mentor.is_active == True
        ).all()
        return [
            {
                **LinkService.generate_mentor_link(event_id, str(m.id), stage),
                "email": m.email,
                "name":  f"{m.first_name} {m.last_name}",
            }
            for m in mentors
        ]

    @classmethod
    def resolve_portal_access(cls, url_event_id: uuid.UUID, token: str, db: Session) -> dict:
        payload = decode_access_token(token)
        role    = payload.get("role")
        subject = parse_uuid_subject(get_token_subject(payload), "portal subject")
        stage   = payload.get("stage", "unknown")
        token_event_id = payload.get("event_id")

        # 3. CRITICAL SECURITY CHECK: Ensure token isn't being used across boundaries
        if str(token_event_id) != str(url_event_id):
            raise HTTPException(
                status_code=403, 
                detail="Token mismatch. This access link belongs to a different event."
            )

        if role == "participant":
            return cls._load_participant_view(url_event_id, subject, stage, db)
        elif role == "evaluator":
            return cls._load_evaluator_view(url_event_id, subject, stage, db)
        elif role == "mentor":
            return cls._load_mentor_view(url_event_id, subject, stage, db)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown token role: {role}")

    @staticmethod
    def _stage_snapshot(event_id: uuid.UUID, db: Session) -> dict:
        from app.models.stage_definition import StageDefinition
        from app.models.stage_run import StageRun
        from app.services.event_state_service import get_event_state

        stage_defs = db.query(StageDefinition).filter(
            StageDefinition.event_id == event_id,
            StageDefinition.is_active == True,
        ).order_by(StageDefinition.position.asc()).all()

        if not stage_defs:
            current_stage = get_event_state(event_id, db).current_stage
            return {
                "current_stage": current_stage,
                "timeline": [
                    {"phase": "Registration", "status": "completed"},
                    {
                        "phase": "Team Formation",
                        "status": "active" if current_stage == "team_formation" else "pending",
                    },
                    {
                        "phase": "Evaluation",
                        "status": "active" if current_stage == "evaluation" else "pending",
                    },
                    {
                        "phase": "Results",
                        "status": "active" if current_stage == "results" else "pending",
                    },
                ],
            }

        runs = db.query(StageRun).filter(StageRun.event_id == event_id).all()
        run_by_stage = {run.stage_definition_id: run for run in runs}

        active_index = 0
        for index, stage_def in enumerate(stage_defs):
            run = run_by_stage.get(stage_def.id)
            if run and run.status in ("active", "awaiting_approval"):
                active_index = index
                break
        else:
            for index, stage_def in enumerate(stage_defs):
                run = run_by_stage.get(stage_def.id)
                if not run or run.status not in ("completed", "skipped"):
                    active_index = index
                    break
            else:
                active_index = len(stage_defs) - 1

        timeline = []
        for index, stage_def in enumerate(stage_defs):
            run = run_by_stage.get(stage_def.id)

            if run and run.status in ("completed", "skipped"):
                status = "completed"
            elif run and run.status in ("active", "awaiting_approval"):
                status = "active"
            elif index < active_index:
                status = "completed"
            elif index == active_index:
                status = "active"
            else:
                status = "pending"

            timeline.append({
                "phase": stage_def.name,
                "status": status,
            })

        return {
            "current_stage": stage_defs[active_index].key,
            "timeline": timeline,
        }

    @staticmethod
    def _load_participant_view(
        event_id:       uuid.UUID,
        participant_id: str,
        stage:          str,
        db:             Session
    ) -> dict:
        stage_snapshot = LinkService._stage_snapshot(event_id, db)
        current_stage = stage_snapshot["current_stage"]

        participant = db.query(Participant).filter(
            Participant.id == participant_id,
            Participant.event_id == event_id
        ).first()

        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found.")

        event = db.query(Event).filter(Event.id == event_id).first()
        event_name = event.name if event else "EventOS Hackathon"

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

        rank = None
        total_score = None
        if current_stage == "results" and team:
            from app.services.score_service import ScoreService
            leaderboard_data = ScoreService.consolidate_all_teams(event_id, db).get("leaderboard", [])
            for entry in leaderboard_data:
                if str(entry["team_id"]) == str(team.id):
                    rank = entry.get("rank")
                    total_score = entry.get("weighted_total")
                    break

        return ParticipantPortalResponse(
            participant_id = str(participant.id),
            name           = f"{participant.first_name} {participant.last_name}",
            email          = participant.email,
            event_name     = event_name,
            institution    = participant.institution,
            stage          = current_stage,
            team_assigned  = participant.team_id is not None,
            team_id        = str(team.id) if team else None,
            team_name      = team.team_name if team else None,
            team_rationale = team.rationale if team else None,
            teammates      = teammates,
            timeline       = stage_snapshot["timeline"],
            rank                  = rank,
            total_score           = total_score,
            progression_confirmed = participant.progression_confirmed,
        ).model_dump()

    @staticmethod
    def _load_evaluator_view(
        event_id:     uuid.UUID,
        evaluator_id: str,
        stage:        str,
        db:           Session
    ) -> dict:
        evaluator = db.query(Evaluator).filter(
            Evaluator.id == evaluator_id,
            Evaluator.event_id == event_id
        ).first()

        if not evaluator:
            raise HTTPException(status_code=404, detail="Evaluator not found.")
        stage_snapshot = LinkService._stage_snapshot(event_id, db)

        from app.models.participant import Team
        from app.models.evaluation import Evaluation
        from app.models.assignment import EvaluatorTeamAssignment

        assignments = db.query(EvaluatorTeamAssignment).filter(
            EvaluatorTeamAssignment.evaluator_id == evaluator_id,
            EvaluatorTeamAssignment.event_id == event_id
        ).all()
        assigned_team_ids = [a.team_id for a in assignments]

        if assigned_team_ids:
            assigned_teams = db.query(Team).filter(Team.id.in_(assigned_team_ids)).all()
        else:
            assigned_teams = []

        submitted = db.query(Evaluation).filter(
            Evaluation.evaluator_id == evaluator_id,
            Evaluation.event_id == event_id
        ).all()
        submitted_team_ids = {str(e.team_id) for e in submitted}

        teams_data = [
            {
                "team_id":      str(t.id),
                "team_name":    t.team_name,
                "is_approved":  t.is_approved,
                "already_graded": str(t.id) in submitted_team_ids,
            }
            for t in assigned_teams
        ]

        return EvaluatorPortalResponse(
            evaluator_id    = str(evaluator.id),
            name            = f"{evaluator.first_name} {evaluator.last_name}",
            email           = evaluator.email,
            stage           = stage_snapshot["current_stage"],
            assigned_teams  = teams_data,
            grading_criteria = [
                {"key": "technical_depth",  "label": "Technical Depth",  "max": 10, "weight": 0.35},
                {"key": "innovation",       "label": "Innovation",       "max": 10, "weight": 0.25},
                {"key": "presentation",     "label": "Presentation",     "max": 10, "weight": 0.20},
                {"key": "feasibility",      "label": "Feasibility",       "max": 10, "weight": 0.20},
            ],
            submitted_count = len(submitted_team_ids),
            total_assigned  = len(assigned_teams),
        ).model_dump()

    @staticmethod
    def _load_mentor_view(
        event_id:  uuid.UUID,
        mentor_id: str,
        stage:     str,
        db:        Session
    ) -> dict:
        mentor = db.query(Mentor).filter(
            Mentor.id == mentor_id,
            Mentor.event_id == event_id
        ).first()
        if not mentor:
            raise HTTPException(status_code=404, detail="Mentor not found.")

        from app.services.mentor_service import MentorService
        portal_me = MentorService.get_mentor_portal_me(event_id, db, mentor.id)

        return {
            "role": "mentor",
            **portal_me.model_dump(),
        }