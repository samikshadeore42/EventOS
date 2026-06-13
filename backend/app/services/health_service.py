# backend/app/services/health_service.py
#
# Calculates a risk score (0-100) for each team.
# No ML. No probabilities. Just honest weighted signals.
# Score = sum of weighted penalty points.
#
# Signals:
#   No evaluation submitted yet          +35
#   Team not approved yet                +20
#   No daily updates in last 2 days      +25
#   Blockers mentioned in last update    +10
#   Team link never opened               +10

from datetime import date, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.participant import Participant, Team
from app.models.evaluation import Evaluation
from app.models.daily_update import DailyUpdate


def _days_since(dt) -> int:
    """How many days ago was this datetime/date."""
    if dt is None:
        return 9999
    if isinstance(dt, datetime):
        dt = dt.date()
    return (date.today() - dt).days


def compute_team_risk(team_id, db: Session) -> dict:
    """
    Compute risk score and signals for one team.
    Returns a dict ready to send to the frontend.
    """
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        return None

    members = db.query(Participant).filter(
        Participant.team_id == team_id
    ).all()

    signals = []
    score   = 0

    # ── Signal 1: No evaluation submitted ───────────────────────────
    eval_count = db.query(Evaluation).filter(
        Evaluation.team_id == team_id
    ).count()
    if eval_count == 0:
        score += 35
        signals.append({
            "label":    "No evaluation submitted",
            "severity": "high",
            "detail":   "No judge has scored this team yet.",
        })

    # ── Signal 2: Team not approved ─────────────────────────────────
    if not team.is_approved:
        score += 20
        signals.append({
            "label":    "Team not approved",
            "severity": "medium",
            "detail":   f"Team status is '{team.approval_status}'.",
        })

    # ── Signal 3: Daily update recency ──────────────────────────────
    latest_update = db.query(DailyUpdate).filter(
        DailyUpdate.team_id == team_id
    ).order_by(DailyUpdate.update_date.desc()).first()

    days_since_update = _days_since(
        latest_update.update_date if latest_update else None
    )

    if days_since_update >= 2:
        penalty = min(25, days_since_update * 8)
        score  += penalty
        label   = (
            "No updates ever" if latest_update is None
            else f"No update for {days_since_update} day(s)"
        )
        signals.append({
            "label":    label,
            "severity": "high" if days_since_update >= 3 else "medium",
            "detail":   "Teams should submit a daily progress update.",
        })

    # ── Signal 4: Active blockers ────────────────────────────────────
    if latest_update and latest_update.blockers:
        score += 10
        signals.append({
            "label":    "Blocker reported",
            "severity": "medium",
            "detail":   f"Latest update mentions: \"{latest_update.blockers[:80]}\"",
        })

    # ── Signal 5: Inactive members (no update in 3+ days) ───────────
    inactive_members = []
    for member in members:
        member_latest = db.query(DailyUpdate).filter(
            DailyUpdate.participant_id == member.id
        ).order_by(DailyUpdate.update_date.desc()).first()

        days = _days_since(
            member_latest.update_date if member_latest else None
        )
        if days >= 3:
            inactive_members.append(
                f"{member.first_name} {member.last_name}"
            )

    if inactive_members:
        score += min(10, len(inactive_members) * 5)
        signals.append({
            "label":    f"{len(inactive_members)} inactive member(s)",
            "severity": "medium",
            "detail":   f"No update in 3+ days: {', '.join(inactive_members)}",
        })

    # ── Risk level label ────────────────────────────────────────────
    score = min(score, 100)
    if score >= 70:
        risk_level = "critical"
    elif score >= 45:
        risk_level = "high"
    elif score >= 20:
        risk_level = "medium"
    else:
        risk_level = "low"

    return {
        "team_id":    str(team.id),
        "team_name":  team.team_name,
        "risk_score": score,
        "risk_level": risk_level,
        "signals":    signals,
        "member_count": len(members),
        "last_update":  str(latest_update.update_date) if latest_update else None,
    }


def compute_all_teams_risk(db: Session) -> list:
    """Compute risk for all approved teams. Called by scheduler."""
    teams = db.query(Team).filter(Team.is_approved == True).all()
    results = []
    for team in teams:
        r = compute_team_risk(team.id, db)
        if r:
            results.append(r)
    # Sort by risk_score descending — most at-risk first
    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return results