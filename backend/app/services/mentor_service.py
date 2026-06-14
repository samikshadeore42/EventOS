# File: backend/app/services/mentor_service.py
# Core CRUD + assignment + session + feedback operations for the mentor layer.

from uuid import UUID
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException

from app.models.mentor import Mentor, MentorAssignment, MentorSession, MentorFeedback
from app.models.participant import Participant, Team
from app.schemas.mentor_schemas import (
    MentorCreate, MentorUpdate, MentorOut,
    MentorAssignmentCreate, MentorAssignmentOut,
    MentorSessionCreate, MentorSessionUpdate, MentorSessionOut,
    MentorFeedbackCreate, MentorFeedbackOut,
    MentorPortalMe, MentorTeamOut, MentorTeamMemberOut,
    ParticipantMentorInfo,
)


class MentorService:
    """Stateless service — all methods take an event_id and db session."""

    # ── Mentor CRUD ────────────────────────────────────────────────────

    @staticmethod
    def create_mentor(event_id: UUID, db: Session, data: MentorCreate) -> Mentor:
        # Scope email uniqueness check to event
        existing = db.query(Mentor).filter(
            Mentor.email == data.email,
            Mentor.event_id == event_id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Mentor with email {data.email} already exists in this event.")
        
        mentor = Mentor(
            event_id=event_id, # Bind to event
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            organization=data.organization,
            expertise_areas=data.expertise_areas,
        )
        db.add(mentor)
        db.commit()
        db.refresh(mentor)
        return mentor

    @staticmethod
    def list_mentors(event_id: UUID, db: Session, active_only: bool = False) -> list[dict]:
        query = db.query(Mentor).filter(Mentor.event_id == event_id) # Scope to event
        if active_only:
            query = query.filter(Mentor.is_active == True)
        mentors = query.order_by(Mentor.created_at.desc()).all()
        
        results = []
        for m in mentors:
            active_count = db.query(MentorAssignment).filter(
                MentorAssignment.mentor_id == m.id,
                MentorAssignment.event_id == event_id, # Scope to event
                MentorAssignment.is_active == True,
            ).count()
            results.append({
                **MentorOut.model_validate(m).model_dump(),
                "assigned_team_count": active_count,
            })
        return results

    @staticmethod
    def get_mentor(event_id: UUID, db: Session, mentor_id: UUID) -> Mentor:
        mentor = db.query(Mentor).filter(
            Mentor.id == mentor_id,
            Mentor.event_id == event_id # Scope to event
        ).first()
        if not mentor:
            raise HTTPException(status_code=404, detail="Mentor not found in this event.")
        return mentor

    @staticmethod
    def update_mentor(event_id: UUID, db: Session, mentor_id: UUID, data: MentorUpdate) -> Mentor:
        mentor = MentorService.get_mentor(event_id, db, mentor_id)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(mentor, key, value)
        db.commit()
        db.refresh(mentor)
        return mentor

    @staticmethod
    def deactivate_mentor(event_id: UUID, db: Session, mentor_id: UUID) -> dict:
        mentor = MentorService.get_mentor(event_id, db, mentor_id)
        mentor.is_active = False
        
        db.query(MentorAssignment).filter(
            MentorAssignment.mentor_id == mentor_id,
            MentorAssignment.event_id == event_id, # Scope to event
            MentorAssignment.is_active == True,
        ).update({"is_active": False})
        db.commit()
        return {"message": f"Mentor {mentor.first_name} {mentor.last_name} deactivated."}

    # ── Assignment ─────────────────────────────────────────────────────

    @staticmethod
    def assign_mentor_to_team(event_id: UUID, db: Session, data: MentorAssignmentCreate) -> MentorAssignment:
        mentor = MentorService.get_mentor(event_id, db, data.mentor_id)
        if not mentor.is_active:
            raise HTTPException(status_code=400, detail="Cannot assign an inactive mentor.")

        team = db.query(Team).filter(
            Team.id == data.team_id,
            Team.event_id == event_id # Scope to event
        ).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found in this event.")

        db.query(MentorAssignment).filter(
            MentorAssignment.team_id == data.team_id,
            MentorAssignment.event_id == event_id, # Scope to event
            MentorAssignment.is_active == True,
        ).update({"is_active": False})

        assignment = MentorAssignment(
            event_id=event_id, # Bind to event
            mentor_id=data.mentor_id,
            team_id=data.team_id,
            stage=data.stage,
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return assignment

    @staticmethod
    def unassign_mentor_from_team(event_id: UUID, db: Session, assignment_id: UUID) -> dict:
        assignment = db.query(MentorAssignment).filter(
            MentorAssignment.id == assignment_id,
            MentorAssignment.event_id == event_id # Scope to event
        ).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found in this event.")
        assignment.is_active = False
        db.commit()
        return {"message": "Mentor unassigned from team."}

    @staticmethod
    def get_team_mentor(event_id: UUID, db: Session, team_id: UUID) -> Mentor | None:
        assignment = db.query(MentorAssignment).filter(
            MentorAssignment.team_id == team_id,
            MentorAssignment.event_id == event_id, # Scope to event
            MentorAssignment.is_active == True,
        ).first()
        if not assignment:
            return None
        return db.query(Mentor).filter(
            Mentor.id == assignment.mentor_id,
            Mentor.event_id == event_id # Scope to event
        ).first()

    @staticmethod
    def get_mentor_teams(event_id: UUID, db: Session, mentor_id: UUID) -> list[MentorTeamOut]:
        assignments = db.query(MentorAssignment).filter(
            MentorAssignment.mentor_id == mentor_id,
            MentorAssignment.event_id == event_id, # Scope to event
            MentorAssignment.is_active == True,
        ).all()

        results = []
        now = datetime.now(timezone.utc)
        for a in assignments:
            team = db.query(Team).filter(Team.id == a.team_id).first()
            if not team:
                continue
            members = db.query(Participant).filter(Participant.team_id == team.id).all()

            next_session = db.query(MentorSession).filter(
                MentorSession.team_id == team.id,
                MentorSession.event_id == event_id, # Scope to event
                MentorSession.status == "scheduled",
                MentorSession.scheduled_at >= now,
            ).order_by(MentorSession.scheduled_at.asc()).first()

            latest_fb = db.query(MentorFeedback).filter(
                MentorFeedback.team_id == team.id,
                MentorFeedback.event_id == event_id, # Scope to event
                MentorFeedback.participant_id == None,
            ).order_by(MentorFeedback.created_at.desc()).first()

            feedback_count = db.query(MentorFeedback).filter(
                MentorFeedback.team_id == team.id,
                MentorFeedback.event_id == event_id, # Scope to event
            ).count()

            results.append(MentorTeamOut(
                team_id=team.id,
                team_name=team.team_name,
                member_count=len(members),
                members=[
                    MentorTeamMemberOut(
                        id=m.id,
                        name=f"{m.first_name} {m.last_name}",
                        institution=m.institution,
                        skills=m.skill_vector or {},
                    )
                    for m in members
                ],
                next_meeting=MentorSessionOut.model_validate(next_session) if next_session else None,
                latest_progress_score=latest_fb.progress_score if latest_fb else None,
                feedback_count=feedback_count,
            ))
        return results

    @staticmethod
    def list_assignments(event_id: UUID, db: Session, active_only: bool = True) -> list[dict]:
        query = db.query(MentorAssignment).filter(MentorAssignment.event_id == event_id) # Scope to event
        if active_only:
            query = query.filter(MentorAssignment.is_active == True)
        assignments = query.order_by(MentorAssignment.assigned_at.desc()).all()
        
        results = []
        for a in assignments:
            mentor = db.query(Mentor).filter(Mentor.id == a.mentor_id).first()
            team = db.query(Team).filter(Team.id == a.team_id).first()
            results.append({
                **MentorAssignmentOut.model_validate(a).model_dump(),
                "mentor_name": f"{mentor.first_name} {mentor.last_name}" if mentor else None,
                "team_name": team.team_name if team else None,
            })
        return results

    # ── Sessions ───────────────────────────────────────────────────────

    @staticmethod
    def create_session(event_id: UUID, db: Session, mentor_id: UUID, data: MentorSessionCreate) -> MentorSession:
        assignment = db.query(MentorAssignment).filter(
            MentorAssignment.mentor_id == mentor_id,
            MentorAssignment.team_id == data.team_id,
            MentorAssignment.event_id == event_id, # Scope to event
            MentorAssignment.is_active == True,
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="Mentor is not assigned to this team.")

        session = MentorSession(
            event_id=event_id, # Bind to event
            mentor_id=mentor_id,
            team_id=data.team_id,
            title=data.title,
            meeting_url=data.meeting_url,
            scheduled_at=data.scheduled_at,
            duration_minutes=data.duration_minutes,
            agenda=data.agenda,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def update_session(event_id: UUID, db: Session, mentor_id: UUID, session_id: UUID, data: MentorSessionUpdate) -> MentorSession:
        session = db.query(MentorSession).filter(
            MentorSession.id == session_id,
            MentorSession.mentor_id == mentor_id,
            MentorSession.event_id == event_id # Scope to event
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or not owned by this mentor in this event.")
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(session, key, value)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def list_sessions_for_team(event_id: UUID, db: Session, team_id: UUID) -> list[MentorSession]:
        return db.query(MentorSession).filter(
            MentorSession.team_id == team_id,
            MentorSession.event_id == event_id # Scope to event
        ).order_by(MentorSession.scheduled_at.desc()).all()

    @staticmethod
    def list_sessions_for_mentor(event_id: UUID, db: Session, mentor_id: UUID) -> list[MentorSession]:
        return db.query(MentorSession).filter(
            MentorSession.mentor_id == mentor_id,
            MentorSession.event_id == event_id # Scope to event
        ).order_by(MentorSession.scheduled_at.desc()).all()

    @staticmethod
    def get_next_session_for_team(event_id: UUID, db: Session, team_id: UUID) -> MentorSession | None:
        now = datetime.now(timezone.utc)
        return db.query(MentorSession).filter(
            MentorSession.team_id == team_id,
            MentorSession.event_id == event_id, # Scope to event
            MentorSession.status == "scheduled",
            MentorSession.scheduled_at >= now,
        ).order_by(MentorSession.scheduled_at.asc()).first()

    # ── Feedback ───────────────────────────────────────────────────────

    @staticmethod
    def submit_team_feedback(event_id: UUID, db: Session, mentor_id: UUID, data: MentorFeedbackCreate) -> MentorFeedback:
        assignment = db.query(MentorAssignment).filter(
            MentorAssignment.mentor_id == mentor_id,
            MentorAssignment.team_id == data.team_id,
            MentorAssignment.event_id == event_id, # Scope to event
            MentorAssignment.is_active == True,
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="Mentor is not assigned to this team.")

        feedback = MentorFeedback(
            event_id=event_id, # Bind to event
            mentor_id=mentor_id,
            team_id=data.team_id,
            participant_id=data.participant_id,
            feedback_type=data.feedback_type,
            progress_score=data.progress_score,
            collaboration_score=data.collaboration_score,
            execution_score=data.execution_score,
            clarity_score=data.clarity_score,
            blockers=data.blockers,
            feedback_text=data.feedback_text,
            action_items=data.action_items,
            visible_to_participant=data.visible_to_participant,
        )
        if data.participant_id:
            participant = db.query(Participant).filter(
                Participant.id == data.participant_id,
                Participant.team_id == data.team_id,
                Participant.event_id == event_id # Scope to event
            ).first()
            if not participant:
                raise HTTPException(
                    status_code=400,
                    detail="Participant does not belong to this team in this event."
                )
        db.add(feedback)
        db.commit()
        db.refresh(feedback)
        return feedback

    @staticmethod
    def get_visible_feedback_for_participant(event_id: UUID, db: Session, participant_id: UUID, team_id: UUID) -> list[MentorFeedback]:
        return db.query(MentorFeedback).filter(
            MentorFeedback.team_id == team_id,
            MentorFeedback.event_id == event_id, # Scope to event
            MentorFeedback.visible_to_participant == True,
            (
                (MentorFeedback.participant_id == None) |
                (MentorFeedback.participant_id == participant_id)
            ),
        ).order_by(MentorFeedback.created_at.desc()).all()

    @staticmethod
    def get_feedback_for_team(event_id: UUID, db: Session, team_id: UUID) -> list[MentorFeedback]:
        return db.query(MentorFeedback).filter(
            MentorFeedback.team_id == team_id,
            MentorFeedback.event_id == event_id # Scope to event
        ).order_by(MentorFeedback.created_at.desc()).all()

    @staticmethod
    def get_team_action_items(event_id: UUID, db: Session, team_id: UUID, visible_only: bool = False) -> list[str]:
        query = db.query(MentorFeedback).filter(
            MentorFeedback.team_id == team_id,
            MentorFeedback.event_id == event_id # Scope to event
        )
        if visible_only:
            query = query.filter(MentorFeedback.visible_to_participant == True)
        feedbacks = query.order_by(MentorFeedback.created_at.desc()).limit(5).all()
        items = []
        for fb in feedbacks:
            if fb.action_items:
                items.extend(fb.action_items)
        return items

    # ── Portal helpers ─────────────────────────────────────────────────

    @staticmethod
    def get_mentor_portal_me(event_id: UUID, db: Session, mentor_id: UUID) -> MentorPortalMe:
        mentor = MentorService.get_mentor(event_id, db, mentor_id)
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        active_assignments = db.query(MentorAssignment).filter(
            MentorAssignment.mentor_id == mentor_id,
            MentorAssignment.event_id == event_id, # Scope to event
            MentorAssignment.is_active == True,
        ).count()

        meetings = db.query(MentorSession).filter(
            MentorSession.mentor_id == mentor_id,
            MentorSession.event_id == event_id, # Scope to event
            MentorSession.status == "scheduled",
            MentorSession.scheduled_at >= now,
        ).count()

        updates_today = db.query(MentorFeedback).filter(
            MentorFeedback.mentor_id == mentor_id,
            MentorFeedback.event_id == event_id, # Scope to event
            MentorFeedback.created_at >= today_start,
        ).count()

        assigned_team_ids = [a.team_id for a in db.query(MentorAssignment).filter(
            MentorAssignment.mentor_id == mentor_id,
            MentorAssignment.event_id == event_id, # Scope to event
            MentorAssignment.is_active == True,
        ).all()]

        updated_team_ids = set()
        for fb in db.query(MentorFeedback).filter(
            MentorFeedback.mentor_id == mentor_id,
            MentorFeedback.event_id == event_id, # Scope to event
            MentorFeedback.created_at >= today_start,
            MentorFeedback.participant_id == None,
        ).all():
            updated_team_ids.add(fb.team_id)

        pending = len([tid for tid in assigned_team_ids if tid not in updated_team_ids])

        return MentorPortalMe(
            mentor_id=str(mentor.id),
            name=f"{mentor.first_name} {mentor.last_name}",
            email=mentor.email,
            organization=mentor.organization,
            expertise_areas=mentor.expertise_areas or [],
            stage="mentoring",
            assigned_teams_count=active_assignments,
            pending_updates_count=pending,
            meetings_scheduled=meetings,
            updates_today=updates_today,
        )

    @staticmethod
    def get_participant_mentor_info(event_id: UUID, db: Session, participant_id: UUID, team_id: UUID) -> ParticipantMentorInfo:
        mentor = MentorService.get_team_mentor(event_id, db, team_id)
        if not mentor:
            return ParticipantMentorInfo()

        next_meeting = MentorService.get_next_session_for_team(event_id, db, team_id)
        visible_feedback = MentorService.get_visible_feedback_for_participant(
            event_id, db, participant_id, team_id
        )
        action_items = MentorService.get_team_action_items(event_id, db, team_id, visible_only=True)

        return ParticipantMentorInfo(
            mentor_name=f"{mentor.first_name} {mentor.last_name}",
            organization=mentor.organization,
            expertise_areas=mentor.expertise_areas or [],
            email=mentor.email,
            next_meeting=MentorSessionOut.model_validate(next_meeting) if next_meeting else None,
            visible_feedback=[MentorFeedbackOut.model_validate(fb) for fb in visible_feedback[:5]],
            action_items=action_items[:10],
        )