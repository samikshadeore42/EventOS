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
    Re-runs anomaly detection on all teams with 3+ submissions.
    Catches cases where a late submission changes the consensus
    and should flag/unflag existing scorecards.
    """
    db = SessionLocal()
    try:
        from app.models.participant import Team
        from app.models.evaluation import Evaluation

        approved_teams = db.query(Team).filter(Team.is_approved == True).all()  # noqa: E712

        total_flagged = 0
        for team in approved_teams:
            count = db.query(Evaluation).filter(Evaluation.team_id == team.id).count()
            if count >= 3:
                flagged = ScoreService.run_anomaly_detection_for_team(team.id, db)
                total_flagged += len(flagged)

        print(f"[SCHEDULER] Anomaly sweep complete. Total flagged: {total_flagged}")
        return {"teams_checked": len(approved_teams), "total_flagged": total_flagged}

    except Exception as e:
        print(f"[SCHEDULER] Anomaly sweep failed: {e}")
        raise
    finally:
        db.close()