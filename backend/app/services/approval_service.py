# File: backend/app/services/approval_service.py

import uuid
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.participant import Team, Participant
from app.schemas.approval_schemas import ApprovalDecision


class ApprovalService:

    # ── Read operations ───────────────────────────────────────────────

    @staticmethod
    def get_all_teams(event_id: uuid.UUID, db: Session) -> list[Team]:
        """Returns all teams ordered by creation time."""
        return db.query(Team).filter(Team.event_id == event_id).order_by(Team.created_at).all()

    @staticmethod
    def get_pending_teams(event_id: uuid.UUID, db: Session) -> list[Team]:
        """
        Fetches all unapproved teams waiting for administrative validation.
        Ordered oldest-to-newest to ensure fair triage queues.
        """
        return (
            db.query(Team)
            .filter(Team.event_id == event_id) # <-- 1. Scope to event
            .filter(Team.approval_status == "pending")
            .order_by(Team.created_at)
            .all()
        )

    @staticmethod
    def get_member_counts_batch(event_id: uuid.UUID, team_ids: list, db: Session) -> dict:
        """
        OPTIMIZED: Returns a dictionary mapping {team_id_string: member_count_integer} 
        for a batch list of targeted team IDs using a single SQL GROUP BY query.
        """
        from sqlalchemy import func
        from app.models.participant import Participant
        
        if not team_ids:
            return {}
        
        rows = (
            db.query(Participant.team_id, func.count(Participant.id).label("cnt"))
            .filter(Participant.team_id.in_(team_ids))
            .filter(Participant.event_id == event_id) # <-- 2. Scope to event
            .group_by(Participant.team_id)
            .all()
        )
        
        return {str(row.team_id): row.cnt for row in rows}
        
            
    @staticmethod
    def get_team_by_id(event_id: uuid.UUID, team_id: UUID, db: Session) -> Team:
        """
        Fetches a single team by ID.
        Raises 404 if not found — so routes don't need to check themselves.
        """
        team = db.query(Team).filter(Team.id == team_id, Team.event_id == event_id).first()
        if not team:
            raise HTTPException(
                status_code=404,
                detail=f"Team '{team_id}' not found in this event."
            )
        return team

    @staticmethod
    def get_team_members(event_id: uuid.UUID, team_id: UUID, db: Session) -> list[Participant]:
        """Returns all participants assigned to a team."""
        return (
            db.query(Participant)
            .filter(Participant.team_id == team_id, Participant.event_id == event_id)
            .all()
        )

    # ── Write operations ──────────────────────────────────────────────

    @staticmethod
    def process_decision(
        event_id: uuid.UUID,
        team_id:  UUID,
        decision: ApprovalDecision,
        notes:    str | None,
        db:       Session
    ) -> dict:
        """
        Core approval logic. Called by the single-team approval route.
        """
        team    = ApprovalService.get_team_by_id(event_id, team_id, db)
        members = ApprovalService.get_team_members(event_id, team_id, db)

        if decision == ApprovalDecision.APPROVE:
            team.is_approved = True
            team.approval_status = "approved"
            db.commit()
            db.refresh(team)

            return {
                "team":          team,
                "decision":      decision,
                "emails_queued": False,
                "message":       f"Team '{team.team_name}' approved. Formation must be fully published to send emails."
            }

        else:  # REJECT
            team.is_approved = False
            team.approval_status = "rejected"
            if notes:
                team.rationale = f"[REJECTED] {notes}"
            db.commit()
            db.refresh(team)

            return {
                "team":          team,
                "decision":      decision,
                "emails_queued": False,
                "message":       f"Team '{team.team_name}' rejected. "
                                 f"Reason: {notes or 'No reason provided'}"
            }

    @staticmethod
    def process_bulk_decision(
        event_id: uuid.UUID,
        decision: ApprovalDecision,
        notes:    str | None,
        db:       Session
    ) -> dict:
        """
        Approves or rejects ALL pending teams in one operation.
        Used by the "Approve All" button on the dashboard.
        """
        pending_teams = ApprovalService.get_pending_teams(event_id, db)

        if not pending_teams:
            return {
                "total_teams":   0,
                "approved":      0,
                "rejected":      0,
                "emails_queued": False,
                "message":       "No pending teams found."
            }

        approved_count = 0
        rejected_count = 0
        all_email_recipients = []

        for team in pending_teams:
            members = ApprovalService.get_team_members(event_id, team.id, db)

            if decision == ApprovalDecision.APPROVE:
                team.is_approved = True
                team.approval_status = "approved"
                approved_count += 1

                for m in members:
                    all_email_recipients.append({
                        "email":        m.email,
                        "name":         f"{m.first_name} {m.last_name}",
                        "team_name":    team.team_name,
                        "team_members": [
                            f"{x.first_name} {x.last_name}"
                            for x in members if x.id != m.id
                        ],
                        "rationale": team.rationale or "",
                    })
            else:
                team.is_approved = False
                team.approval_status = "rejected"
                if notes:
                    team.rationale = f"[BULK REJECTED] {notes}"
                rejected_count += 1

        db.commit()

        return {
            "total_teams":   len(pending_teams),
            "approved":      approved_count,
            "rejected":      rejected_count,
            "emails_queued": False,
            "message":       f"Bulk {decision.value}: "
                             f"{approved_count} approved, {rejected_count} rejected. Publish formation to send emails."
        }
        
    @staticmethod
    def publish_formation(event_id: uuid.UUID, db: Session) -> dict:
        """
        Validates that all currently active teams are approved, and that all participants
        are assigned to a team. If valid, marks all teams as published and sends emails.
        """
        from app.models.participant import Participant
        
        # 3. Securely scope the current teams
        current_teams = db.query(Team).filter(
            Team.event_id == event_id, 
            Team.approval_status.in_(["pending", "approved", "rejected"])
        ).all()
        
        if not current_teams:
            return {"success": False, "message": "No active team formation found."}
            
        unapproved = [t for t in current_teams if t.approval_status != "approved"]
        if unapproved:
            return {
                "success": False, 
                "message": f"Cannot publish. {len(unapproved)} teams are still pending or rejected."
            }
            
        # 4. Securely scope the participant validation counts
        total_participants = db.query(Participant).filter(Participant.event_id == event_id).count()
        assigned_participants = db.query(Participant).filter(
            Participant.event_id == event_id, 
            Participant.team_id.isnot(None)
        ).count()
        
        if assigned_participants < total_participants:
            return {
                "success": False,
                "message": f"Cannot publish. Only {assigned_participants}/{total_participants} participants are assigned to teams."
            }

        all_email_recipients = []
        for team in current_teams:
            team.approval_status = "published"
            members = ApprovalService.get_team_members(event_id, team.id, db)
            for m in members:
                all_email_recipients.append({
                    "email":        m.email,
                    "name":         f"{m.first_name} {m.last_name}",
                    "team_name":    team.team_name,
                    "team_members": [
                        f"{x.first_name} {x.last_name}"
                        for x in members if x.id != m.id
                    ],
                    "rationale": team.rationale or "",
                })
        
        db.commit()

        if all_email_recipients:
            # Dynamically fetch event name to inject into the email
            from app.models.event import Event
            event = db.query(Event).filter(Event.id == event_id).first()
            event_name = event.name if event else "EventOS Hackathon"

            from app.tasks.communications import send_batch_emails
            send_batch_emails.delay(
                recipient_list=all_email_recipients,
                template="team_assignment",
                event_name=event_name  # <-- 5. Dynamic Email Titles
            )
            
        return {
            "success": True,
            "message": f"Formation published successfully. {len(all_email_recipients)} assignment emails queued."
        }