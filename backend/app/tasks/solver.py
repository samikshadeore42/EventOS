# File: backend/app/tasks/solver.py
#
# This is the Celery task that:
# 1. Initializes a Redis status tracker entry
# 2. Runs the CSP backtracking solver
# 3. Updates tracker progress as solving proceeds
# 4. Writes the final result back to tracker
#
# The API enqueues this task and immediately returns the task_id.
# The frontend polls GET /tasks/{task_id}/status to show live progress.

from app.core.celery_app import celery_app
from app.services.csp_solver import CSPTeamSolver, build_formulation_from_dicts
from app.services.task_tracker import TaskTracker, TaskStatus


@celery_app.task(
    bind=True,
    queue="algorithms",
    name="app.tasks.solver.run_team_formation",
    max_retries=1,
    default_retry_delay=30,
)
def run_team_formation(self, roster: list, config: dict):
    """
    Celery task: runs the CSP team formation solver.

    Args:
        roster : list of participant dicts
                 [{"id": ..., "first_name": ..., "institution": ...,
                   "skill_vector": {...}}, ...]
        config : solver configuration dict
                 {"num_teams": 5, "target_size": 4, "k_min": 3,
                  "k_max": 5, "max_per_institution": 1}

    Returns:
        dict with keys: task_id, teams, evaluation
    """
    task_id = self.request.id

    # ── Step 1: Initialize tracker ────────────────────────────────────
    TaskTracker.initialize(
        task_id=task_id,
        task_type="team_formation",
        total_steps=len(roster),
        metadata={
            "num_participants": len(roster),
            "num_teams":        config.get("num_teams"),
            "target_size":      config.get("target_size"),
        }
    )

    try:
        # ── Step 2: Mark running ──────────────────────────────────────
        TaskTracker.mark_running(
            task_id,
            f"Starting CSP solver for {len(roster)} participants "
            f"→ {config.get('num_teams')} teams"
        )

        # ── Step 3: Build formulation ─────────────────────────────────
        TaskTracker.update(
            task_id, TaskStatus.RUNNING, 1,
            "Building CSP formulation and validating constraints..."
        )

        try:
            formulation = build_formulation_from_dicts(
                roster=roster,
                num_teams=config["num_teams"],
                target_size=config["target_size"],
                k_min=config["k_min"],
                k_max=config["k_max"],
                max_per_institution=config.get("max_per_institution", 1),
                excluded_combinations=[set(ex) for ex in config.get("excluded_combinations", [])]
            )
        except ValueError as e:
            TaskTracker.mark_failed(task_id, str(e))
            raise

        TaskTracker.update(
            task_id, TaskStatus.RUNNING, 2,
            f"Formulation valid. "
            f"{len(roster)} participants, {config['num_teams']} teams. "
            f"Running backtracking search..."
        )

        # ── Step 4: Run solver ────────────────────────────────────────
        solver = CSPTeamSolver(formulation)
        teams, evaluation = solver.solve()

        TaskTracker.update(
            task_id, TaskStatus.RUNNING, len(roster),
            f"Solver complete. "
            f"Quality: {evaluation['quality']} | "
            f"Variance: {evaluation['variance_score']}"
        )

        # ── Step 5: Serialize result ──────────────────────────────────
        # Convert TeamSlot objects to plain dicts for JSON serialization
        teams_result = [
            {
                "team_id":   team.id,
                "team_name": f"Team {chr(65 + team.id)}",   # Team A, Team B, ...
                "members": [
                    {
                        "id":          m.id,
                        "name":        m.name,
                        "institution": m.institution,
                        "skill_vector": m.skill_vector,
                    }
                    for m in team.members
                ],
                "size":                team.size(),
                "average_skill_vector": (
                    team.average_skill_vector().tolist()
                    if team.average_skill_vector() is not None else []
                ),
            }
            for team in teams
        ]

        result = {
            "task_id":    task_id,
            "teams":      teams_result,
            "evaluation": evaluation,
        }

        # ── Step 6: Mark success ──────────────────────────────────────
        TaskTracker.mark_success(
            task_id,
            result=result,
            message=(
                f"Successfully formed {len(teams)} teams. "
                f"Quality: {evaluation['quality']}. "
                f"Nodes visited: {evaluation.get('nodes_visited', 'N/A')}."
            )
        )

        return result

    except Exception as exc:
        # Mark failed in tracker before re-raising
        TaskTracker.mark_failed(task_id, str(exc))
        raise self.retry(exc=exc)