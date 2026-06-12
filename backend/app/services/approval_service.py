# File: backend/app/services/approval_service.py
#
# CONCEPT: The service layer sits between routes and the database.
# Routes handle HTTP concerns (parsing request, returning response).
# Services handle business logic (what should actually happen).
#
# This separation means:
# - Routes stay short and readable
# - Business logic is testable without spinning up HTTP
# - Multiple routes can reuse the same service method

from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.participant import Team, Participant
from app.schemas.approval_schemas import ApprovalDecision


class ApprovalService:

    # ── Read operations ───────────────────────────────────────────────

    @staticmethod
    def get_all_teams(db: Session) -> list[Team]:
        """Returns all teams ordered by creation time."""
        return db.query(Team).order_by(Team.created_at).all()

    @staticmethod
    def get_pending_teams(db: Session) -> list[Team]:
        """
        Fetches all unapproved teams waiting for administrative validation.
        Ordered oldest-to-newest to ensure fair triage queues.
        """
        return (
            db.query(Team)
            .filter(Team.approval_status == "pending")
            .order_by(Team.created_at)
            .all()
        )

    @staticmethod
    def get_member_counts_batch(team_ids: list, db: Session) -> dict:
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
            .group_by(Participant.team_id)
            .all()
        )
        
        return {str(row.team_id): row.cnt for row in rows}
        
            
    @staticmethod
    def get_team_by_id(team_id: UUID, db: Session) -> Team:
        """
        Fetches a single team by ID.
        Raises 404 if not found — so routes don't need to check themselves.
        """
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(
                status_code=404,
                detail=f"Team '{team_id}' not found"
            )
        return team

    @staticmethod
    def get_team_members(team_id: UUID, db: Session) -> list[Participant]:
        """Returns all participants assigned to a team."""
        return (
            db.query(Participant)
            .filter(Participant.team_id == team_id)
            .all()
        )

    # ── Write operations ──────────────────────────────────────────────

    @staticmethod
    def process_decision(
        team_id:  UUID,
        decision: ApprovalDecision,
        notes:    str | None,
        db:       Session
    ) -> dict:
        """
        Core approval logic. Called by the single-team approval route.

        On APPROVE:
          - Sets team.is_approved = True
          - Enqueues team assignment emails via Celery
          - Returns emails_queued = True

        On REJECT:
          - Sets team.is_approved = False  (stays unapproved)
          - Stores rejection notes in team.rationale
          - Does NOT send emails
          - Returns emails_queued = False
        """
        team    = ApprovalService.get_team_by_id(team_id, db)
        members = ApprovalService.get_team_members(team_id, db)

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
                # Store rejection reason in rationale field for admin reference
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
        decision: ApprovalDecision,
        notes:    str | None,
        db:       Session
    ) -> dict:
        """
        Approves or rejects ALL pending teams in one operation.
        Used by the "Approve All" button on the dashboard.
        """
        pending_teams = ApprovalService.get_pending_teams(db)

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
            members = ApprovalService.get_team_members(team.id, db)

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
    def publish_formation(db: Session) -> dict:
        """
        Validates that all currently active teams are approved, and that all participants
        are assigned to a team. If valid, marks all teams as published and sends emails.
        """
        from app.models.participant import Participant
        current_teams = db.query(Team).filter(Team.approval_status.in_(["pending", "approved", "rejected"])).all()
        
        if not current_teams:
            return {"success": False, "message": "No active team formation found."}
            
        unapproved = [t for t in current_teams if t.approval_status != "approved"]
        if unapproved:
            return {
                "success": False, 
                "message": f"Cannot publish. {len(unapproved)} teams are still pending or rejected."
            }
            
        total_participants = db.query(Participant).count()
        assigned_participants = db.query(Participant).filter(Participant.team_id.isnot(None)).count()
        if assigned_participants < total_participants:
            return {
                "success": False,
                "message": f"Cannot publish. Only {assigned_participants}/{total_participants} participants are assigned to teams."
            }

        all_email_recipients = []
        for team in current_teams:
            team.approval_status = "published"
            members = ApprovalService.get_team_members(team.id, db)
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
            from app.tasks.communications import send_batch_emails
            send_batch_emails.delay(
                recipient_list=all_email_recipients,
                template="team_assignment",
                event_name="WiSE@TI Hackathon"
            )
            
        return {
            "success": True,
            "message": f"Formation published successfully. {len(all_email_recipients)} assignment emails queued."
        }
