# File: backend/app/tasks/scheduler.py

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.services.score_service import ScoreService
from app.services.email_service import EmailService


@celery_app.task(
    name="app.tasks.scheduler.consolidate_scores",
    queue="algorithms",
)
def consolidate_scores():
    """
    Scheduled task: runs every hour.
    Aggregates all evaluation scores, re-runs anomaly detection,
    and builds a fresh leaderboard snapshot.
    This ensures the leaderboard is always up to date even if
    the score submission endpoint didn't explicitly trigger consolidation.
    """
    db = SessionLocal()
    try:
        result = ScoreService.consolidate_all_teams(db)
        print(
            f"[SCHEDULER] Score consolidation complete: "
            f"{result['teams_processed']} teams, "
            f"{result['flagged_count']} flagged, "
            f"{result['leaderboard_ready']} ready."
        )
        return result
    except Exception as e:
        print(f"[SCHEDULER] Score consolidation failed: {e}")
        raise
    finally:
        db.close()


@celery_app.task(
    name="app.tasks.scheduler.send_daily_evaluation_reminder",
    queue="notifications",
)
def send_daily_evaluation_reminder():
    """
    Scheduled task: runs every day at 9am UTC.
    Sends a reminder email to evaluators who haven't submitted
    all their scorecards yet.
    """
    db = SessionLocal()
    try:
        from app.models.evaluation import Evaluator, Evaluation
        from app.models.participant import Team

        approved_count = db.query(Team).filter(Team.is_approved == True).count() 
        if approved_count == 0:
            print("[SCHEDULER] No approved teams yet — skipping reminder.")
            return {"skipped": True, "reason": "No approved teams"}

        active_evaluators = db.query(Evaluator).filter(Evaluator.is_active == True).all() 

        reminders_sent = 0
        for evaluator in active_evaluators:
            submitted_count = db.query(Evaluation).filter(
                Evaluation.evaluator_id == str(evaluator.id)
            ).count()

            remaining = approved_count - submitted_count
            if remaining <= 0:
                continue 

            # Send reminder
            html = f"""
            <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:24px">
            <h2 style="color:#059669">EventOS — Evaluation Reminder</h2>
            <p>Hello {evaluator.first_name},</p>
            <p>You have <strong>{remaining} team(s)</strong> still awaiting your evaluation
               for the <strong>WiSE@TI Hackathon</strong>.</p>
            <p>You have submitted {submitted_count} of {approved_count} scorecards.</p>
            <p style="color:#6b7280;font-size:13px">
              Please log in via your portal link to complete your evaluations.
            </p>
            </body></html>
            """
            result = EmailService._send_email(
                to_email=evaluator.email,
                subject="⏰ Reminder: You have pending evaluations — WiSE@TI",
                html_content=html
            )
            if result.get("success"):
                reminders_sent += 1

        print(f"[SCHEDULER] Daily reminder: sent {reminders_sent} reminder emails.")
        return {"reminders_sent": reminders_sent, "total_evaluators": len(active_evaluators)}

    except Exception as e:
        print(f"[SCHEDULER] Daily reminder failed: {e}")
        raise
    finally:
        db.close()


@celery_app.task(
    name="app.tasks.scheduler.run_anomaly_sweep",
    queue="algorithms",
)
def run_anomaly_sweep():
    """
    Scheduled task: runs every 30 minutes.
    Re-runs anomaly detection across the FULL panel of submissions.

    Previously iterated team-by-team, which couldn't see judge-level
    patterns (no-differentiation, halo/horns) that only emerge when
    you look across all teams a judge has rated. Now delegates to
    ScoreService.run_full_panel_anomaly_sweep, which activates the
    intra-rater consistency detector in addition to z-score, weighted
    Euclidean divergence, and conflict-of-interest.
    """
    db = SessionLocal()
    try:
        result = ScoreService.run_full_panel_anomaly_sweep(db)
        print(f"[SCHEDULER] {result['message']}")
        return result

    except Exception as e:
        print(f"[SCHEDULER] Anomaly sweep failed: {e}")
        raise
    finally:
        db.close()

@celery_app.task(
    name="app.tasks.scheduler.refresh_health_dashboard",
    queue="algorithms",
)
def refresh_health_dashboard():
    """
    Scheduled task: runs every hour.
    Recomputes team risk scores and writes to Redis cache.
    Also sends reminder emails to participants missing updates.
    """
    from app.services.health_service import compute_all_teams_risk
    from app.models.daily_update import DailyUpdate
    from app.models.participant import Participant, Team
    from app.core.redis_client import get_redis
    from app.services.email_service import EmailService
    from datetime import date
    import json

    db = SessionLocal()
    try:
        # Refresh risk cache
        results = compute_all_teams_risk(db)
        r = get_redis()
        r.set("health:all_teams", json.dumps(results), ex=60 * 60)

        critical_count = sum(
            1 for t in results if t["risk_level"] == "critical"
        )
        print(
            f"[HEALTH] Refreshed {len(results)} teams. "
            f"{critical_count} critical."
        )

        # Send reminders to participants who missed today's update
        today = date.today()
        approved_teams = db.query(Team).filter(Team.is_approved == True).all()
        reminders_sent = 0

        for team in approved_teams:
            members = db.query(Participant).filter(
                Participant.team_id == team.id
            ).all()
            for member in members:
                already_submitted = db.query(DailyUpdate).filter(
                    DailyUpdate.participant_id == member.id,
                    DailyUpdate.update_date == today,
                ).first()
                if not already_submitted:
                    html = f"""
                    <!DOCTYPE html><html><body style="font-family:Arial;max-width:600px;margin:40px auto;padding:24px">
                    <h2 style="color:#2563eb">EventOS — Daily Update Reminder</h2>
                    <p>Hi {member.first_name},</p>
                    <p>You haven't submitted your daily progress update today yet.</p>
                    <p>Log in to your participant portal and let your team and mentors know
                       what you've built today.</p>
                    <p style="color:#6b7280;font-size:13px">
                      Consistent updates help mentors support your team. Missing updates
                      will flag your team as at-risk on the organizer dashboard.
                    </p>
                    </body></html>
                    """
                    result = EmailService.send_email(
                        to_email=member.email,
                        subject="📋 Daily update reminder — EventOS",
                        html_content=html,
                    )
                    if result.get("success"):
                        reminders_sent += 1

        print(f"[HEALTH] Sent {reminders_sent} daily update reminders.")
        return {
            "teams_processed": len(results),
            "critical_count":  critical_count,
            "reminders_sent":  reminders_sent,
        }

    except Exception as e:
        print(f"[HEALTH] refresh_health_dashboard failed: {e}")
        raise
    finally:
        db.close()

