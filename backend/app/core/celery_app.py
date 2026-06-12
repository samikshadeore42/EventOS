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
}

