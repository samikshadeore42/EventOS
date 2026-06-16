# File: backend/app/tasks/scheduler.py

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.services.score_service import ScoreService
from app.services.email_service import EmailService
from app.models.event import Event  # <-- Added Event import

@celery_app.task(
    name="app.tasks.scheduler.consolidate_scores",
    queue="algorithms",
)
def consolidate_scores():
    """
    Scheduled task: runs every hour.
    Loops through all events, aggregates all evaluation scores, 
    re-runs anomaly detection, and builds a fresh leaderboard snapshot.
    """
    db = SessionLocal()
    try:
        events = db.query(Event).all()
        total_processed, total_flagged, total_ready = 0, 0, 0
        
        for event in events:
            # Pass the event.id down into the ScoreService
            result = ScoreService.consolidate_all_teams(event.id, db)
            total_processed += result.get('teams_processed', 0)
            total_flagged += result.get('flagged_count', 0)
            total_ready += result.get('leaderboard_ready', 0)
            
        db.commit()
        print(
            f"[SCHEDULER] Score consolidation complete across {len(events)} events: "
            f"{total_processed} teams, {total_flagged} flagged, {total_ready} ready."
        )
        return {"events_processed": len(events), "teams": total_processed}
    except Exception as e:
        db.rollback()
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
    all their scorecards yet, grouped by event.
    """
    db = SessionLocal()
    try:
        from app.models.evaluation import Evaluator, Evaluation
        from app.models.participant import Team

        events = db.query(Event).all()
        reminders_sent = 0
        
        for event in events:
            # 1. Scope the approved teams to the specific event
            approved_count = db.query(Team).filter(
                Team.event_id == event.id, 
                Team.is_approved == True
            ).count() 
            
            if approved_count == 0:
                continue

            # 2. Scope the evaluators to the specific event
            active_evaluators = db.query(Evaluator).filter(
                Evaluator.event_id == event.id, 
                Evaluator.is_active == True
            ).all() 

            for evaluator in active_evaluators:
                submitted_count = db.query(Evaluation).filter(
                    Evaluation.evaluator_id == str(evaluator.id),
                    Evaluation.event_id == event.id # Ensure evaluation matches event
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
                   for <strong>{event.name}</strong>.</p>
                <p>You have submitted {submitted_count} of {approved_count} scorecards.</p>
                <p style="color:#6b7280;font-size:13px">
                  Please log in via your portal link to complete your evaluations.
                </p>
                </body></html>
                """
                
                # 3. Pass event.id to the EmailService!
                result = EmailService.send_email(
                    event_id=event.id,
                    to_email=evaluator.email,
                    subject=f"⏰ Reminder: You have pending evaluations — {event.name}",
                    html_content=html,
                    event_name=event.name
                )
                if result.get("success"):
                    reminders_sent += 1

        print(f"[SCHEDULER] Daily reminder: sent {reminders_sent} reminder emails across {len(events)} events.")
        return {"reminders_sent": reminders_sent}

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
    Re-runs anomaly detection across the FULL panel of submissions
    for every active event.
    """
    db = SessionLocal()
    try:
        events = db.query(Event).all()
        total_anomalies = 0
        
        for event in events:
            # Pass the event.id into the anomaly sweep
            result = ScoreService.run_full_panel_anomaly_sweep(event.id, db)
            total_anomalies += result.get('anomalies_detected', 0)
            
        db.commit()
        print(f"[SCHEDULER] Anomaly sweep complete. Detected {total_anomalies} flags across {len(events)} events.")
        return {"events_processed": len(events), "anomalies": total_anomalies}

    except Exception as e:
        db.rollback()
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
    Also sends reminder emails to participants who haven't submitted today's update,
    scoped per event (required by main's EmailService.send_email signature).
    """
    from app.services.health_service import compute_all_teams_risk
    from app.models.daily_update import DailyUpdate
    from app.models.participant import Participant, Team
    from app.core.redis_client import get_redis
    from datetime import date
    import json

    db = SessionLocal()
    try:
        # ── Refresh risk cache ───────────────────────────────────────
        results = compute_all_teams_risk(db)
        r = get_redis()
        r.set("health:all_teams", json.dumps(results), ex=60 * 60)

        critical_count = sum(1 for t in results if t["risk_level"] == "critical")
        print(
            f"[HEALTH] Refreshed {len(results)} teams. "
            f"{critical_count} critical."
        )

        # ── Send reminders to participants missing today's update ────
        # Scoped per event so EmailService gets the required event_id
        today = date.today()
        events = db.query(Event).all()
        reminders_sent = 0

        for event in events:
            approved_teams = db.query(Team).filter(
                Team.event_id == event.id,
                Team.is_approved == True,
            ).all()

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
                        <p>You haven't submitted your daily progress update for
                           <strong>{event.name}</strong> today yet.</p>
                        <p>Log in to your participant portal and let your team and mentors know
                           what you've built today.</p>
                        <p style="color:#6b7280;font-size:13px">
                          Consistent updates help mentors support your team. Missing updates
                          will flag your team as at-risk on the organiser dashboard.
                        </p>
                        </body></html>
                        """
                        result = EmailService.send_email(
                            event_id=event.id,
                            to_email=member.email,
                            subject=f"📋 Daily update reminder — {event.name}",
                            html_content=html,
                            event_name=event.name,
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
