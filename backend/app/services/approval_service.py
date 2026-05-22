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
            .filter(Team.is_approved == False)   # noqa: E712
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
            db.commit()
            db.refresh(team)

            # Enqueue team assignment emails for all members
            emails_queued = False
            if members:
                from app.tasks.communications import send_batch_emails
                recipient_list = [
                    {
                        "email":        m.email,
                        "name":         f"{m.first_name} {m.last_name}",
                        "team_name":    team.team_name,
                        "team_members": [
                            f"{x.first_name} {x.last_name}"
                            for x in members if x.id != m.id
                        ],
                        "rationale": team.rationale or "",
                    }
                    for m in members
                ]
                send_batch_emails.delay(
                    recipient_list=recipient_list,
                    template="team_assignment",
                    event_name="WiSE@TI Hackathon"
                )
                emails_queued = True

            return {
                "team":          team,
                "decision":      decision,
                "emails_queued": emails_queued,
                "message":       f"Team '{team.team_name}' approved. "
                                 f"{'Assignment emails queued.' if emails_queued else ''}"
            }

        else:  # REJECT
            team.is_approved = False
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
                if notes:
                    team.rationale = f"[BULK REJECTED] {notes}"
                rejected_count += 1

        db.commit()

        # Enqueue all emails in a single Celery task (efficient batch)
        emails_queued = False
        if all_email_recipients:
            from app.tasks.communications import send_batch_emails
            send_batch_emails.delay(
                recipient_list=all_email_recipients,
                template="team_assignment",
                event_name="WiSE@TI Hackathon"
            )
            emails_queued = True

        return {
            "total_teams":   len(pending_teams),
            "approved":      approved_count,
            "rejected":      rejected_count,
            "emails_queued": emails_queued,
            "message":       f"Bulk {decision.value}: "
                             f"{approved_count} approved, {rejected_count} rejected."
        }
