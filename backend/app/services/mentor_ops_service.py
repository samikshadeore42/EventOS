# File: backend/app/services/mentor_ops_service.py
# Admin-facing operations: risk scoring, skill-gap suggestions,
# daily reminders, AI summary payloads.

from uuid import UUID
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.mentor import Mentor, MentorAssignment, MentorSession, MentorFeedback
from app.models.participant import Participant, Team
from app.schemas.mentor_schemas import (
    MentorOpsSummary, TeamRiskOut,
    MentorSuggestionOut, MentorSuggestionCandidate,
    DailyReminderResult,
)


class MentorOpsService:
    """Admin-level mentor operations: dashboards, risk, suggestions."""

    # ── Summary ────────────────────────────────────────────────────────

    @staticmethod
    def get_ops_summary(db: Session) -> MentorOpsSummary:
        total_mentors = db.query(Mentor).count()
        active_mentors = db.query(Mentor).filter(Mentor.is_active == True).count()
        total_assignments = db.query(MentorAssignment).filter(
            MentorAssignment.is_active == True
        ).count()

        # Approved teams
        approved_teams = db.query(Team).filter(Team.is_approved == True).all()
        approved_ids = {t.id for t in approved_teams}

        # Teams with active mentor
        assigned_team_ids = set()
        for a in db.query(MentorAssignment).filter(MentorAssignment.is_active == True).all():
            assigned_team_ids.add(a.team_id)

        teams_without_mentor = len(approved_ids - assigned_team_ids)

        # Teams without upcoming meeting
        now = datetime.now(timezone.utc)
        teams_with_meeting = set()
        for s in db.query(MentorSession).filter(
            MentorSession.status == "scheduled",
            MentorSession.scheduled_at >= now,
        ).all():
            teams_with_meeting.add(s.team_id)
        teams_without_meeting = len(assigned_team_ids - teams_with_meeting)

        # Teams missing daily update (last 24 hours)
        yesterday = now - timedelta(hours=24)
        teams_with_update = set()
        for fb in db.query(MentorFeedback).filter(
            MentorFeedback.created_at >= yesterday,
            MentorFeedback.participant_id == None,
        ).all():
            teams_with_update.add(fb.team_id)
        teams_missing_daily = len(assigned_team_ids - teams_with_update)

        # Low progress teams (latest progress_score < 5)
        low_progress = 0
        for tid in assigned_team_ids:
            latest = db.query(MentorFeedback).filter(
                MentorFeedback.team_id == tid,
                MentorFeedback.participant_id == None,
                MentorFeedback.progress_score != None,
            ).order_by(MentorFeedback.created_at.desc()).first()
            if latest and latest.progress_score is not None and latest.progress_score < 5:
                low_progress += 1

        return MentorOpsSummary(
            total_mentors=total_mentors,
            active_mentors=active_mentors,
            total_assignments=total_assignments,
            teams_without_mentor=teams_without_mentor,
            teams_without_meeting=teams_without_meeting,
            teams_missing_daily_update=teams_missing_daily,
            low_progress_teams=low_progress,
        )

    # ── Teams without mentor ───────────────────────────────────────────

    @staticmethod
    def get_teams_without_mentor(db: Session) -> list[dict]:
        approved_teams = db.query(Team).filter(Team.is_approved == True).all()
        assigned_team_ids = {
            a.team_id for a in db.query(MentorAssignment).filter(
                MentorAssignment.is_active == True
            ).all()
        }
        return [
            {"team_id": str(t.id), "team_name": t.team_name}
            for t in approved_teams if t.id not in assigned_team_ids
        ]

    # ── Teams without meeting ──────────────────────────────────────────

    @staticmethod
    def get_teams_without_meeting(db: Session) -> list[dict]:
        now = datetime.now(timezone.utc)
        assigned = db.query(MentorAssignment).filter(MentorAssignment.is_active == True).all()
        teams_with_meeting = {
            s.team_id for s in db.query(MentorSession).filter(
                MentorSession.status == "scheduled",
                MentorSession.scheduled_at >= now,
            ).all()
        }
        results = []
        for a in assigned:
            if a.team_id not in teams_with_meeting:
                team = db.query(Team).filter(Team.id == a.team_id).first()
                if team:
                    results.append({"team_id": str(team.id), "team_name": team.team_name})
        return results

    # ── Teams missing daily update ─────────────────────────────────────

    @staticmethod
    def get_teams_missing_daily_update(db: Session) -> list[dict]:
        now = datetime.now(timezone.utc)
        yesterday = now - timedelta(hours=24)
        assigned = db.query(MentorAssignment).filter(MentorAssignment.is_active == True).all()
        teams_with_update = {
            fb.team_id for fb in db.query(MentorFeedback).filter(
                MentorFeedback.created_at >= yesterday,
                MentorFeedback.participant_id == None,
            ).all()
        }
        results = []
        for a in assigned:
            if a.team_id not in teams_with_update:
                team = db.query(Team).filter(Team.id == a.team_id).first()
                if team:
                    results.append({"team_id": str(team.id), "team_name": team.team_name})
        return results

    # ── Risk scoring ───────────────────────────────────────────────────

    @staticmethod
    def calculate_team_risk_score(db: Session, team_id: UUID) -> TeamRiskOut:
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            return TeamRiskOut(team_id=team_id, team_name="Unknown")

        risk_score = 0
        reasons = []
        now = datetime.now(timezone.utc)
        yesterday = now - timedelta(hours=24)

        # Check mentor assignment
        assignment = db.query(MentorAssignment).filter(
            MentorAssignment.team_id == team_id,
            MentorAssignment.is_active == True,
        ).first()
        mentor_name = None
        if not assignment:
            risk_score += 35
            reasons.append("No active mentor assigned")
        else:
            mentor = db.query(Mentor).filter(Mentor.id == assignment.mentor_id).first()
            mentor_name = f"{mentor.first_name} {mentor.last_name}" if mentor else None

        # Check upcoming meeting
        has_meeting = db.query(MentorSession).filter(
            MentorSession.team_id == team_id,
            MentorSession.status == "scheduled",
            MentorSession.scheduled_at >= now,
        ).first()
        if not has_meeting:
            risk_score += 20
            reasons.append("No upcoming meeting scheduled")

        # Check recent team-level feedback
        latest_fb = db.query(MentorFeedback).filter(
            MentorFeedback.team_id == team_id,
            MentorFeedback.participant_id == None,
        ).order_by(MentorFeedback.created_at.desc()).first()

        latest_progress = None
        latest_feedback_at = None

        if not latest_fb or latest_fb.created_at.replace(tzinfo=timezone.utc if latest_fb.created_at.tzinfo is None else latest_fb.created_at.tzinfo) < yesterday:
            risk_score += 25
            reasons.append("No team-level feedback in last 24 hours")

        if latest_fb:
            latest_feedback_at = latest_fb.created_at
            latest_progress = latest_fb.progress_score

            if latest_fb.progress_score is not None and latest_fb.progress_score < 5:
                risk_score += 15
                reasons.append(f"Low progress score: {latest_fb.progress_score}")

            if latest_fb.collaboration_score is not None and latest_fb.collaboration_score < 5:
                risk_score += 10
                reasons.append(f"Low collaboration score: {latest_fb.collaboration_score}")

            if latest_fb.blockers:
                risk_score += 10
                reasons.append("Active blockers reported")

        risk_score = min(risk_score, 100)

        if risk_score >= 80:
            risk_level = "critical"
        elif risk_score >= 60:
            risk_level = "high"
        elif risk_score >= 30:
            risk_level = "medium"
        else:
            risk_level = "low"

        return TeamRiskOut(
            team_id=team_id,
            team_name=team.team_name,
            mentor_name=mentor_name,
            risk_score=risk_score,
            risk_level=risk_level,
            reasons=reasons,
            latest_progress_score=latest_progress,
            latest_feedback_at=latest_feedback_at,
        )

    @staticmethod
    def get_risk_teams(db: Session) -> list[TeamRiskOut]:
        """Risk scores for all approved teams, sorted worst-first."""
        approved_teams = db.query(Team).filter(Team.is_approved == True).all()
        results = [
            MentorOpsService.calculate_team_risk_score(db, t.id)
            for t in approved_teams
        ]
        results.sort(key=lambda r: r.risk_score, reverse=True)
        return results

    # ── Skill-gap assignment suggestions ───────────────────────────────

    @staticmethod
    def get_assignment_suggestions_by_skill_gap(db: Session) -> list[MentorSuggestionOut]:
        """For each un-mentored approved team, suggest top 3 mentors by skill match."""
        approved_teams = db.query(Team).filter(Team.is_approved == True).all()
        assigned_ids = {
            a.team_id for a in db.query(MentorAssignment).filter(
                MentorAssignment.is_active == True
            ).all()
        }
        active_mentors = db.query(Mentor).filter(Mentor.is_active == True).all()

        suggestions = []
        for team in approved_teams:
            if team.id in assigned_ids:
                continue

            members = db.query(Participant).filter(Participant.team_id == team.id).all()
            if not members:
                continue

            # Compute average skill vector
            skill_sums: dict[str, float] = {}
            skill_counts: dict[str, int] = {}
            for m in members:
                if m.skill_vector:
                    for skill, val in m.skill_vector.items():
                        skill_sums[skill] = skill_sums.get(skill, 0) + float(val)
                        skill_counts[skill] = skill_counts.get(skill, 0) + 1

            if not skill_sums:
                continue

            avg_skills = {
                skill: skill_sums[skill] / skill_counts[skill]
                for skill in skill_sums
            }

            # Find weakest skills (below 5.0 or bottom 3)
            sorted_skills = sorted(avg_skills.items(), key=lambda x: x[1])
            weak_skills = [s[0] for s in sorted_skills[:3] if s[1] < 7.0]
            if not weak_skills:
                weak_skills = [sorted_skills[0][0]] if sorted_skills else []

            # Score mentors
            candidates = []
            for mentor in active_mentors:
                expertise = [e.lower().strip() for e in (mentor.expertise_areas or [])]
                match_count = sum(
                    1 for ws in weak_skills
                    if any(ws.lower() in exp or exp in ws.lower() for exp in expertise)
                )
                # Current load
                load = db.query(MentorAssignment).filter(
                    MentorAssignment.mentor_id == mentor.id,
                    MentorAssignment.is_active == True,
                ).count()
                # Score: matching skills bonus - load penalty
                score = (match_count * 30) - (load * 5)
                if match_count > 0:
                    candidates.append(MentorSuggestionCandidate(
                        mentor_id=mentor.id,
                        mentor_name=f"{mentor.first_name} {mentor.last_name}",
                        expertise=mentor.expertise_areas or [],
                        current_load=load,
                        match_score=round(score, 1),
                    ))

            candidates.sort(key=lambda c: c.match_score, reverse=True)

            reason = f"Team weak in: {', '.join(weak_skills)}" if weak_skills else "General mentoring"

            suggestions.append(MentorSuggestionOut(
                team_id=team.id,
                team_name=team.team_name,
                weak_skills=weak_skills,
                suggested_mentors=candidates[:3],
                reason=reason,
            ))

        return suggestions

    # ── Daily mentor reminders ─────────────────────────────────────────

    @staticmethod
    def queue_daily_mentor_reminders(db: Session) -> DailyReminderResult:
        """Find mentor-team pairs missing today's update, queue reminder emails."""
        from app.services.email_service import EmailService

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        assignments = db.query(MentorAssignment).filter(
            MentorAssignment.is_active == True
        ).all()

        # Find teams with updates today
        teams_with_update = {
            fb.team_id for fb in db.query(MentorFeedback).filter(
                MentorFeedback.created_at >= today_start,
                MentorFeedback.participant_id == None,
            ).all()
        }

        result = DailyReminderResult(message="Daily mentor reminders processed.")
        affected_teams = []

        for a in assignments:
            if a.team_id in teams_with_update:
                continue

            mentor = db.query(Mentor).filter(Mentor.id == a.mentor_id).first()
            team = db.query(Team).filter(Team.id == a.team_id).first()
            if not mentor or not team:
                continue

            subject = f"Reminder: Daily update needed for {team.team_name}"
            html = f"""
            <h2>Hi {mentor.first_name},</h2>
            <p>This is a reminder to submit your daily progress update for <strong>{team.team_name}</strong>.</p>
            <p>Your daily feedback helps the committee track team progress and provide timely support.</p>
            <p>Please log in to your mentor portal to submit your update.</p>
            <p>— EventOS Operations</p>
            """

            email_result = EmailService.send_email(
                to_email=mentor.email,
                subject=subject,
                html_content=html,
                recipient_name=f"{mentor.first_name} {mentor.last_name}",
                template="mentor_reminder",
                stage="mentoring",
            )

            affected_teams.append(team.team_name)
            if email_result.get("success"):
                if email_result.get("simulated"):
                    result.simulated += 1
                else:
                    result.sent += 1
                result.queued += 1
            else:
                result.failed += 1

        if result.queued == 0:
            result.message = "No reminders sent. There are no assigned mentors missing today's update."
        else:
            result.message = "Daily mentor reminders processed."
            
        result.affected_teams = affected_teams
        return result

    # ── AI summary payload ─────────────────────────────────────────────

    @staticmethod
    def build_ai_summary_payload(db: Session, team_id: UUID) -> dict:
        """Build structured input for AI summary generation."""
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            return {"error": "Team not found"}

        assignment = db.query(MentorAssignment).filter(
            MentorAssignment.team_id == team_id,
            MentorAssignment.is_active == True,
        ).first()
        mentor_name = None
        if assignment:
            mentor = db.query(Mentor).filter(Mentor.id == assignment.mentor_id).first()
            mentor_name = f"{mentor.first_name} {mentor.last_name}" if mentor else None

        latest_fb = db.query(MentorFeedback).filter(
            MentorFeedback.team_id == team_id,
            MentorFeedback.participant_id == None,
        ).order_by(MentorFeedback.created_at.desc()).first()

        risk = MentorOpsService.calculate_team_risk_score(db, team_id)

        return {
            "team_name": team.team_name,
            "team_id": str(team_id),
            "mentor_name": mentor_name,
            "latest_progress_score": latest_fb.progress_score if latest_fb else None,
            "latest_feedback": latest_fb.feedback_text if latest_fb else None,
            "blockers": latest_fb.blockers if latest_fb else None,
            "action_items": latest_fb.action_items if latest_fb else [],
            "risk_score": risk.risk_score,
            "risk_level": risk.risk_level,
            "risk_reasons": risk.reasons,
        }
