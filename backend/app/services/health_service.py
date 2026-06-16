# backend/app/services/health_service.py
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.daily_update import DailyUpdate
from app.models.evaluation import Evaluation
from app.models.participant import Participant, Team


def _days_since(value) -> int:
    if value is None:
        return 9999
    if isinstance(value, datetime):
        value = value.date()
    return (date.today() - value).days


def compute_team_risk(event_id, team_id, db: Session) -> dict | None:
    team = db.query(Team).filter(
        Team.event_id == event_id,
        Team.id == team_id,
    ).first()

    if not team:
        return None

    members = db.query(Participant).filter(
        Participant.event_id == event_id,
        Participant.team_id == team_id,
    ).all()

    signals = []
    score = 0

    eval_count = db.query(Evaluation).filter(
        Evaluation.event_id == event_id,
        Evaluation.team_id == team_id,
    ).count()

    if eval_count == 0:
        score += 35
        signals.append({
            "label": "No evaluation submitted",
            "severity": "high",
            "detail": "No judge has scored this team yet.",
        })

    if not team.is_approved:
        score += 20
        signals.append({
            "label": "Team not approved",
            "severity": "medium",
            "detail": f"Team status is '{team.approval_status}'.",
        })

    latest_update = db.query(DailyUpdate).filter(
        DailyUpdate.event_id == event_id,
        DailyUpdate.team_id == team_id,
    ).order_by(DailyUpdate.update_date.desc()).first()

    days_since_update = _days_since(latest_update.update_date if latest_update else None)

    if days_since_update >= 2:
        penalty = min(25, days_since_update * 8)
        score += penalty
        signals.append({
            "label": "No updates ever" if latest_update is None else f"No update for {days_since_update} day(s)",
            "severity": "high" if days_since_update >= 3 else "medium",
            "detail": "Teams should submit a daily progress update.",
        })

    if latest_update and latest_update.blockers:
        score += 10
        signals.append({
            "label": "Blocker reported",
            "severity": "medium",
            "detail": f'Latest update mentions: "{latest_update.blockers[:80]}"',
        })

    inactive_members = []
    for member in members:
        member_latest = db.query(DailyUpdate).filter(
            DailyUpdate.event_id == event_id,
            DailyUpdate.participant_id == member.id,
        ).order_by(DailyUpdate.update_date.desc()).first()

        if _days_since(member_latest.update_date if member_latest else None) >= 3:
            inactive_members.append(f"{member.first_name} {member.last_name}")

    if inactive_members:
        score += min(10, len(inactive_members) * 5)
        signals.append({
            "label": f"{len(inactive_members)} inactive member(s)",
            "severity": "medium",
            "detail": f"No update in 3+ days: {', '.join(inactive_members)}",
        })

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
        "team_id": str(team.id),
        "team_name": team.team_name,
        "risk_score": score,
        "risk_level": risk_level,
        "signals": signals,
        "member_count": len(members),
        "last_update": str(latest_update.update_date) if latest_update else None,
    }


def compute_all_teams_risk(event_id, db: Session) -> list[dict]:
    teams = db.query(Team).filter(
        Team.event_id == event_id,
        Team.is_approved == True,
    ).all()

    results = []
    for team in teams:
        risk = compute_team_risk(event_id, team.id, db)
        if risk:
            results.append(risk)

    results.sort(key=lambda item: item["risk_score"], reverse=True)
    return results