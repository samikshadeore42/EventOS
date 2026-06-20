# File: backend/app/core/celery_app.py
import os
from celery import Celery
from dotenv import load_dotenv
from celery.schedules import crontab

load_dotenv()

REDIS_URL = os.getenv("RENDER_REDIS_URL") or os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "EventOS_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.tasks.communications",
        "app.tasks.solver",
        "app.tasks.anomaly",
        "app.tasks.ai_tasks",
        "app.tasks.scheduler",
        "app.tasks.stages",
        "app.tasks.notifications",
        "app.tasks.risk",
        "app.tasks.mentor_notifications"
    ]
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,

    # Task timeouts
    task_time_limit=300,       # 5 min hard limit (important for LLM tasks)
    task_soft_time_limit=240,  # 4 min soft warning

    # Named queues — keeps algorithm jobs separate from email jobs
    task_routes={
        "app.tasks.communications.*": {"queue": "notifications"},
        "app.tasks.solver.*":         {"queue": "algorithms"},
        "app.tasks.anomaly.*":        {"queue": "algorithms"},
        "app.tasks.ai_tasks.*":       {"queue": "algorithms"},
        "app.tasks.stages.*":         {"queue": "default"},
        "app.tasks.notifications.*":  {"queue": "notifications"},
        "app.tasks.risk.*":           {"queue": "algorithms"},
        "app.tasks.mentor_notifications.*": {"queue": "notifications"},
    },

    # Retry policy defaults
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

celery_app.conf.beat_schedule = {
    # Score consolidation — every hour on the hour
    "hourly-score-consolidation": {
        "task":     "app.tasks.scheduler.consolidate_scores",
        "schedule": crontab(minute=0),
    },

    # Anomaly sweep — every 30 minutes
    "anomaly-sweep": {
        "task":     "app.tasks.scheduler.run_anomaly_sweep",
        "schedule": crontab(minute="*/30"),
    },

    # Daily reminder — every day at 9am UTC
    "daily-eval-reminder": {
        "task":     "app.tasks.scheduler.send_daily_evaluation_reminder",
        "schedule": crontab(hour=9, minute=0),
    },

    # Process scheduled stage actions — every minute
    "process-scheduled-actions": {
        "task":     "app.tasks.stages.process_scheduled_actions",
        "schedule": crontab(minute="*/1"),
    },
    
    # Process the notification outbox — runs every minute
    "process-notification-outbox": {
        "task":     "app.tasks.notifications.process_notification_outbox",
        "schedule": crontab(minute="*/1"),
    },

    # Risk sweep — every 30 minutes
    "risk-sweep": {
        "task":     "app.tasks.risk.process_risk_sweeps",
        "schedule": crontab(minute="*/30"),
    },

    # Mentor portal magic-link notifications — meeting reminders + no-update risks
    "mentor-portal-notifications": {
        "task":     "app.tasks.mentor_notifications.process_mentor_portal_notifications",
        "schedule": crontab(minute="*/1"),
    },

    # Phase 12 — Team Health Dashboard cache refresh + participant daily update reminders
    "health-dashboard-refresh": {
        "task":     "app.tasks.scheduler.refresh_health_dashboard",
        "schedule": crontab(hour="*/1", minute=30),  # every hour at :30 (offset from score consolidation)
    },
}
