# File: backend/app/services/task_tracker.py
#
# CONCEPT: This service is the single source of truth for
# "what is a background task currently doing?"
#
# Every Celery task writes updates here as it runs.
# The API reads from here to serve a status endpoint.
# The frontend polls that endpoint to show a live progress bar.
#
# Redis key structure:
#   task:{task_id}:status   → JSON blob with full status
#   task:{task_id}:log      → Redis List of log message strings
#
# Both keys auto-expire after TTL_SECONDS so Redis doesn't
# fill up with stale task data.

import json
from datetime import datetime, timezone
from typing import Optional
from app.core.redis_client import get_redis

# Keys expire 2 hours after last update
TTL_SECONDS = 60 * 60 * 2

# Maximum log lines stored per task
MAX_LOG_LINES = 50


class TaskStatus:
    """String constants for task status values."""
    PENDING   = "pending"
    RUNNING   = "running"
    SUCCESS   = "success"
    FAILED    = "failed"
    RETRYING  = "retrying"


class TaskTracker:
    """
    Writes and reads task progress data in Redis.
    Used by Celery tasks to report their own progress,
    and by API routes to serve that progress to the frontend.
    """

    # ── Key helpers ───────────────────────────────────────────────────

    @staticmethod
    def _status_key(task_id: str) -> str:
        return f"task:{task_id}:status"

    @staticmethod
    def _log_key(task_id: str) -> str:
        return f"task:{task_id}:log"

    # ── Write methods (called by Celery tasks) ────────────────────────

    @classmethod
    def initialize(
        cls,
        task_id:    str,
        task_type:  str,
        total_steps: int,
        metadata:   Optional[dict] = None
    ) -> None:
        """
        Called at the very start of a Celery task.
        Sets up the initial status record in Redis.

        task_type   : human-readable label e.g. "team_formation", "batch_email"
        total_steps : total units of work (e.g. number of participants to place)
        metadata    : any extra context to store (event name, config params, etc.)
        """
        r = get_redis()

        status_data = {
            "task_id":      task_id,
            "task_type":    task_type,
            "status":       TaskStatus.PENDING,
            "progress":     0,
            "total_steps":  total_steps,
            "message":      "Initializing...",
            "result":       None,
            "error":        None,
            "metadata":     metadata or {},
            "started_at":   datetime.now(timezone.utc).isoformat(),
            "updated_at":   datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
        }

        # Store status as a JSON string
        r.set(cls._status_key(task_id), json.dumps(status_data), ex=TTL_SECONDS)
        # Clear any previous logs for this task_id
        r.delete(cls._log_key(task_id))

    @classmethod
    def update(
        cls,
        task_id:  str,
        status:   str,
        progress: int,
        message:  str,
        result:   Optional[dict] = None,
        error:    Optional[str]  = None
    ) -> None:
        """
        Called mid-task to report progress.
        Overwrites only the fields that change — preserves the rest.

        progress : current step number (e.g. 5 out of total_steps=20)
        message  : human-readable description of what's happening right now
        """
        r   = get_redis()
        key = cls._status_key(task_id)

        # Load existing record
        raw = r.get(key)
        if not raw:
            # Task was never initialized — create a minimal record
            existing = {}
        else:
            existing = json.loads(raw)

        existing.update({
            "status":     status,
            "progress":   progress,
            "message":    message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

        if result is not None:
            existing["result"] = result
        if error is not None:
            existing["error"] = error
        if status in (TaskStatus.SUCCESS, TaskStatus.FAILED):
            existing["completed_at"] = datetime.now(timezone.utc).isoformat()

        # Write back with refreshed TTL
        r.set(key, json.dumps(existing), ex=TTL_SECONDS)

        # Append to log list (capped at MAX_LOG_LINES)
        log_key = cls._log_key(task_id)
        timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        r.rpush(log_key, f"[{timestamp}] [{status.upper()}] {message}")
        r.ltrim(log_key, -MAX_LOG_LINES, -1)   # keep only last N entries
        r.expire(log_key, TTL_SECONDS)

    @classmethod
    def mark_running(cls, task_id: str, message: str = "Task started") -> None:
        """Convenience wrapper — marks task as running at step 0."""
        cls.update(task_id, TaskStatus.RUNNING, 0, message)

    @classmethod
    def mark_success(cls, task_id: str, result: dict, message: str = "Completed successfully") -> None:
        """Convenience wrapper — marks task as succeeded with a result payload."""
        # Get total_steps to set progress = 100%
        r   = get_redis()
        raw = r.get(cls._status_key(task_id))
        total = json.loads(raw).get("total_steps", 1) if raw else 1
        cls.update(task_id, TaskStatus.SUCCESS, total, message, result=result)

    @classmethod
    def mark_failed(cls, task_id: str, error: str) -> None:
        """Convenience wrapper — marks task as failed with error message."""
        r   = get_redis()
        raw = r.get(cls._status_key(task_id))
        progress = json.loads(raw).get("progress", 0) if raw else 0
        cls.update(task_id, TaskStatus.FAILED, progress, f"Failed: {error}", error=error)

    # ── Read methods (called by API routes) ───────────────────────────

    @classmethod
    def get_status(cls, task_id: str) -> Optional[dict]:
        """
        Returns the full status dict for a task, or None if not found.
        This is what the API endpoint returns to the frontend.
        """
        r   = get_redis()
        raw = r.get(cls._status_key(task_id))
        if not raw:
            return None
        return json.loads(raw)

    @classmethod
    def get_logs(cls, task_id: str) -> list[str]:
        """
        Returns the log lines for a task (last MAX_LOG_LINES entries).
        Useful for a debug log panel in the frontend.
        """
        r = get_redis()
        return r.lrange(cls._log_key(task_id), 0, -1)

    @classmethod
    def get_status_with_logs(cls, task_id: str) -> Optional[dict]:
        """
        Combined status + logs in one call.
        Use this for the API endpoint to avoid two round trips to Redis.
        """
        status = cls.get_status(task_id)
        if not status:
            return None
        status["logs"] = cls.get_logs(task_id)
        return status



