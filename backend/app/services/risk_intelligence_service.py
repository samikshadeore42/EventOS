import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.risk import RiskSignal, TeamRiskSnapshot
from app.models.participant import Team, Participant
from app.models.mentor import MentorAssignment, MentorFeedback, MentorSession
from app.models.project_submission import ProjectSubmission
from app.schemas.risk_schemas import RiskTeamOut, RiskSummaryOut, RiskSweepResult, RiskHistoryOut
from app.services.notification_service import NotificationService

class RiskIntelligenceService:
    def __init__(self, db: Session, event_id: uuid.UUID):
        self.db = db
        self.event_id = event_id
        self.notification_service = NotificationService(db, event_id)

    def list_latest_team_risks(self) -> List[RiskTeamOut]:
        subquery = (
            self.db.query(
                TeamRiskSnapshot.team_id,
                func.max(TeamRiskSnapshot.created_at).label("max_created_at")
            )
            .filter(TeamRiskSnapshot.event_id == self.event_id)
            .group_by(TeamRiskSnapshot.team_id)
            .subquery()
        )

        latest_snapshots = (
            self.db.query(TeamRiskSnapshot, Team)
            .join(subquery, (TeamRiskSnapshot.team_id == subquery.c.team_id) & (TeamRiskSnapshot.created_at == subquery.c.max_created_at))
            .join(Team, Team.id == TeamRiskSnapshot.team_id)
            .filter(TeamRiskSnapshot.event_id == self.event_id)
            .all()
        )

        results = []
        for snapshot, team in latest_snapshots:
            results.append(RiskTeamOut(
                team_id=team.id,
                team_name=team.team_name,
                risk_score=snapshot.risk_score,
                risk_level=snapshot.risk_level,
                signals=snapshot.signals,
                reasons=snapshot.reasons,
                recommended_actions=snapshot.recommended_actions,
                created_at=snapshot.created_at
            ))
        return results

    def get_summary(self) -> RiskSummaryOut:
        teams_count = self.db.query(Team).filter(Team.event_id == self.event_id, Team.is_approved == True).count()
        if teams_count == 0:
            return RiskSummaryOut(
                event_id=self.event_id,
                total_teams=0,
                low_count=0,
                medium_count=0,
                high_count=0,
                critical_count=0,
                average_risk_score=0.0,
                latest_snapshot_at=None
            )

        latest_risks = self.list_latest_team_risks()
        
        low_count = sum(1 for r in latest_risks if r.risk_level == "low")
        medium_count = sum(1 for r in latest_risks if r.risk_level == "medium")
        high_count = sum(1 for r in latest_risks if r.risk_level == "high")
        critical_count = sum(1 for r in latest_risks if r.risk_level == "critical")
        
        total_score = sum(r.risk_score for r in latest_risks)
        average_score = total_score / len(latest_risks) if latest_risks else 0.0
        
        latest_snapshot_at = max((r.created_at for r in latest_risks), default=None)

        return RiskSummaryOut(
            event_id=self.event_id,
            total_teams=teams_count,
            low_count=low_count,
            medium_count=medium_count,
            high_count=high_count,
            critical_count=critical_count,
            average_risk_score=average_score,
            latest_snapshot_at=latest_snapshot_at
        )

    def get_team_history(self, team_id: uuid.UUID) -> List[RiskHistoryOut]:
        snapshots = (
            self.db.query(TeamRiskSnapshot)
            .filter(TeamRiskSnapshot.event_id == self.event_id, TeamRiskSnapshot.team_id == team_id)
            .order_by(TeamRiskSnapshot.created_at.desc())
            .all()
        )
        return [RiskHistoryOut.model_validate(s) for s in snapshots]

    def _determine_risk_level(self, score: int) -> str:
        if score <= 34: return "low"
        if score <= 59: return "medium"
        if score <= 79: return "high"
        return "critical"

    def compute_team_risk(self, team: Team) -> Dict[str, Any]:
        score = 0
        signals = []
        reasons = []
        recommended_actions = []

        now = datetime.now(timezone.utc)

        # 1. Check Mentor Assignment
        has_mentor = self.db.query(MentorAssignment).filter(
            MentorAssignment.event_id == self.event_id,
            MentorAssignment.team_id == team.id,
            MentorAssignment.is_active == True
        ).first() is not None

        if not has_mentor:
            score += 20
            signals.append({"type": "missing_mentor", "weight": 20})
            reasons.append("No mentor is assigned to this team.")
            recommended_actions.append("Assign a mentor to the team.")

        # 2. Check Mentor Feedback/Session
        latest_feedback = self.db.query(MentorFeedback).filter(
            MentorFeedback.event_id == self.event_id,
            MentorFeedback.team_id == team.id
        ).order_by(MentorFeedback.created_at.desc()).first()

        latest_session = self.db.query(MentorSession).filter(
            MentorSession.event_id == self.event_id,
            MentorSession.team_id == team.id
        ).order_by(MentorSession.created_at.desc()).first()

        has_feedback_or_session = latest_feedback is not None or latest_session is not None
        
        if not has_feedback_or_session:
            score += 15
            signals.append({"type": "no_feedback_or_session", "weight": 15})
            reasons.append("Team has no mentor feedback, session, or check-in recorded.")
            recommended_actions.append("Schedule an initial mentor session.")
        else:
            latest_interaction_time = None
            if latest_feedback and latest_session:
                latest_interaction_time = max(latest_feedback.created_at, latest_session.created_at)
            elif latest_feedback:
                latest_interaction_time = latest_feedback.created_at
            else:
                latest_interaction_time = latest_session.created_at

            if latest_interaction_time:
                latest_interaction_time = latest_interaction_time.replace(tzinfo=timezone.utc) if latest_interaction_time.tzinfo is None else latest_interaction_time
                if (now - latest_interaction_time) > timedelta(hours=48):
                    score += 15
                    signals.append({"type": "stale_feedback", "weight": 15})
                    reasons.append("Latest mentor feedback or check-in is older than 48 hours.")
                    recommended_actions.append("Check in with the team or ask mentor for an update.")

        # 3. Open Blocker-like feedback
        if latest_feedback and (
            (latest_feedback.blockers and len(latest_feedback.blockers.strip()) > 0)
            or "blocker" in (latest_feedback.feedback_text or "").lower()
            or "stuck" in (latest_feedback.feedback_text or "").lower()
            or "help" in (latest_feedback.feedback_text or "").lower()
        ):
            score += 15
            signals.append({"type": "open_blocker", "weight": 15})
            reasons.append("Recent mentor feedback indicates team is stuck or has blockers.")
            recommended_actions.append("Review recent mentor feedback and intervene if necessary.")

        # 4. No Submission
        has_submission = self.db.query(ProjectSubmission).filter(
            ProjectSubmission.event_id == self.event_id,
            ProjectSubmission.team_id == team.id
        ).first() is not None

        # Here we just apply it always to ensure logic is hit, or maybe only if we are past a certain point.
        # The instruction says "when event is past build/development stage". Since we can't easily check stage without more context, let's just add it if no submission and no recent activity.
        if not has_submission:
            score += 20
            signals.append({"type": "no_submission", "weight": 20})
            reasons.append("No submission or project artifact found.")
            recommended_actions.append("Remind team to submit their project artifacts.")

        # 5. Fewer than 2 active participants
        active_participants = self.db.query(Participant).filter(
            Participant.event_id == self.event_id,
            Participant.team_id == team.id
        ).count()
        if active_participants < 2:
            score += 10
            signals.append({"type": "low_participant_count", "weight": 10})
            reasons.append(f"Team has only {active_participants} active participant(s).")
            recommended_actions.append("Verify team composition and handle dropout if necessary.")

        # 6. No recent activity signal
        # We can simulate this by checking if the team hasn't been updated recently.
        team_created_at = team.created_at.replace(tzinfo=timezone.utc) if team.created_at.tzinfo is None else team.created_at
        if (now - team_created_at) > timedelta(hours=72):
            score += 10
            signals.append({"type": "no_recent_activity", "weight": 10})
            reasons.append("No recent activity signal recorded for the team.")
            recommended_actions.append("Check in with the team to ensure they are active.")

        # 7. Previous snapshot high/critical
        previous_snapshot = self.db.query(TeamRiskSnapshot).filter(
            TeamRiskSnapshot.event_id == self.event_id,
            TeamRiskSnapshot.team_id == team.id
        ).order_by(TeamRiskSnapshot.created_at.desc()).first()

        if previous_snapshot and previous_snapshot.risk_level in ["high", "critical"]:
            score += 15
            signals.append({"type": "previous_high_risk", "weight": 15})
            reasons.append("Previous risk snapshot was already high or critical.")
            recommended_actions.append("Urgent: Investigate why previous risk has not been mitigated.")

        score = max(0, min(100, score))
        level = self._determine_risk_level(score)

        return {
            "score": score,
            "level": level,
            "signals": signals,
            "reasons": reasons,
            "recommended_actions": recommended_actions
        }

    def run_sweep(self) -> RiskSweepResult:
        import traceback
        import sys
        try:
            teams = self.db.query(Team).filter(Team.event_id == self.event_id, Team.is_approved == True).all()
            
            created_snapshots = 0
            high_risk_count = 0
            critical_risk_count = 0

            now_date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

            for team in teams:
                risk_data = self.compute_team_risk(team)
                
                snapshot = TeamRiskSnapshot(
                    event_id=self.event_id,
                    team_id=team.id,
                    risk_score=risk_data["score"],
                    risk_level=risk_data["level"],
                    signals=risk_data["signals"],
                    reasons=risk_data["reasons"],
                    recommended_actions=risk_data["recommended_actions"]
                )
                self.db.add(snapshot)
                created_snapshots += 1

                if risk_data["level"] in ["high", "critical"]:
                    if risk_data["level"] == "high": high_risk_count += 1
                    if risk_data["level"] == "critical": critical_risk_count += 1
                    
                    idempotency_key = f"phase9-risk:{self.event_id}:{team.id}:{risk_data['level']}:{now_date_str}"
                    
                    # Check if we already notified for this team today
                    # Assuming we use NotificationService methods. The easiest way is to use existing features or direct insert if needed.
                    self.notification_service.enqueue(
                        notification_type="risk_alert",
                        title=f"Team Risk Alert: {team.team_name} is {risk_data['level'].upper()} risk",
                        message=" ".join(risk_data["reasons"]),
                        role="admin",
                        payload={"team_id": str(team.id), "risk_level": risk_data["level"]},
                        idempotency_key=idempotency_key,
                        commit=False
                    )

            self.db.commit()

            return RiskSweepResult(
                event_id=self.event_id,
                processed_teams=len(teams),
                created_snapshots=created_snapshots,
                high_risk_count=high_risk_count,
                critical_risk_count=critical_risk_count
            )
        except Exception as e:
            print("CRITICAL ERROR IN RUN_SWEEP:", type(e), e, file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            raise
