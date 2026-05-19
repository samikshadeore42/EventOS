# File: backend/app/tasks/solver.py
from app.core.celery_app import celery_app

@celery_app.task(bind=True, queue="algorithms", name="app.tasks.solver.run_team_formation")
def run_team_formation(self, roster_ids: list, config: dict):
    """
    Day 3 implementation: CSP team formation solver.
    Stub for Day 1 — registers the task with Celery.
    """
    print(f"[STUB] run_team_formation called with {len(roster_ids)} participants")
    return {"status": "queued"}