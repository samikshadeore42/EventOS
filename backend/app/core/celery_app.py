# File: backend/app/core/celery_app.py
import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "EventOS_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.tasks.communications",
        "app.tasks.solver",
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
    },

    # Retry policy defaults
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)
