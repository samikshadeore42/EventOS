from dotenv import load_dotenv
load_dotenv()

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.core.auth_deps import RequireOrganizationRole
from app.core.database import engine, Base
from app.services.task_tracker import TaskTracker
from app.core.redis_client import ping_redis
from app.models import participant
from app.models import evaluation
from app.models import event_config
from app.models import communication_log
from app.models import mentor

# Route Imports
from app.api.solver_routes import router as solver_router
from app.api.approval_routes import router as approval_router
from app.api.anomaly_routes import router as anomaly_router
from app.api.portal_routes import router as portal_router
from app.api.evaluation_routes import router as evaluation_router
from app.api.participant_routes import router as participant_router
from app.api.leaderboard_routes import router as leaderboard_router
from app.api.ai_routes import router as ai_router
from app.api.evaluator_routes import router as evaluator_router
from app.api.event_routes import router as event_router
from app.api.comms_routes import router as comms_router
from app.api.mentor_routes import router as mentor_router, portal_router as mentor_portal_router
# admin_router removed as per Phase 1
from app.api.demo_admin_routes import router as demo_admin_router
from app.api.event_state_routes import router as event_state_router
from app.api.submission_routes import router as submission_router
from app.db.seed_templates import seed_templates
from contextlib import asynccontextmanager
from app.api.auth import router as auth_router
from app.api.organization_routes import router as organization_router
from app.api.event_management_routes import router as event_management_router
from app.api.stage_routes import router as stage_router
from app.api.event_lifecycle_routes import router as event_lifecycle_router
from app.api.notification_routes import router as notification_router
from app.api.risk_routes import router as risk_router


legacy_dependency = [Depends(RequireOrganizationRole('owner', 'admin'))]

app = FastAPI(
    title="EventOS API",
    description="Intelligent Event Orchestration System — WiSE@TI",
    version="1.0.0",
)

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.core.rate_limit import limiter

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("Initializing EventOS...")
    redis_ok = ping_redis()

    # Ensure this exact line is present:
    seed_templates()

    print(f"Redis status: {'Connected' if redis_ok else 'Not Connected'}")
    yield
    # Shutdown logic
    print("EventOS shutting down")

app = FastAPI(
    title="EventOS API",
    description="Intelligent Event Orchestration System — WiSE@TI",
    version="1.0.0",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: use explicit origins from env (comma-separated), fallback to dev defaults
import os
_cors_origins_str = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3000")
_cors_origins = [o.strip() for o in _cors_origins_str.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Organization-Id"],
)

DEBUG_ROUTES_ENABLED = os.getenv("ENABLE_DEBUG_ROUTES", "false").lower() == "true"

# Register API routers
app.include_router(auth_router)
app.include_router(organization_router)
app.include_router(event_management_router)
app.include_router(stage_router, dependencies=legacy_dependency)
app.include_router(event_lifecycle_router, dependencies=legacy_dependency)

app.include_router(solver_router, dependencies=legacy_dependency)
app.include_router(approval_router, dependencies=legacy_dependency)
app.include_router(anomaly_router, dependencies=legacy_dependency)
app.include_router(participant_router, dependencies=legacy_dependency)
app.include_router(leaderboard_router, dependencies=legacy_dependency)
app.include_router(evaluator_router, dependencies=legacy_dependency)
app.include_router(event_router, dependencies=legacy_dependency)
app.include_router(comms_router, dependencies=legacy_dependency)

app.include_router(evaluation_router)
app.include_router(submission_router)
app.include_router(portal_router)
app.include_router(mentor_router, dependencies=legacy_dependency)
app.include_router(mentor_portal_router)
app.include_router(ai_router, dependencies=legacy_dependency)
app.include_router(event_state_router, dependencies=legacy_dependency)
app.include_router(demo_admin_router, dependencies=legacy_dependency)
app.include_router(notification_router)
app.include_router(risk_router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "EventOS-api", "redis": ping_redis()}

@app.get("/ready", tags=["System"])
def readiness_check():
    return {"status": "ready"}

@app.get("/tasks/{task_id}/status", tags=["Tasks"])
def get_task_status(task_id: str):
    status = TaskTracker.get_status_with_logs(task_id)
    if not status:
        raise HTTPException(
            status_code=404,
            detail=f"Task '{task_id}' not found."
        )
    return status

@app.post("/debug/run-solver")
def debug_run_solver(membership = Depends(RequireOrganizationRole('owner', 'admin'))):
    if not DEBUG_ROUTES_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    from app.tasks.solver import run_team_formation
    from app.schemas.participant import MOCK_ROSTER

    roster = []
    for i, p in enumerate(MOCK_ROSTER * 2):
        entry = dict(p)
        entry["id"] = f"mock-{i}"
        entry["email"] = f"mock{i}@test.com"

        if i >= len(MOCK_ROSTER):
            entry["first_name"] = f"{entry['first_name']} (Clone)"

        roster.append(entry)

    config = {
        "num_teams": 2,
        "target_size": 4,
        "k_min": 3,
        "k_max": 5,
        "max_per_institution": 1,
    }

    task = run_team_formation.delay(roster, config)

    return {
        "task_id": task.id,
        "status_url": f"/tasks/{task.id}/status"
    }