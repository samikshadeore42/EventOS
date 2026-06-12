from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
from app.api.mentor_routes import router as mentor_router
from app.api.admin_routes import router as admin_router
from app.api.demo_admin_routes import router as demo_admin_router
from app.api.event_state_routes import router as event_state_router
from app.api.submission_routes import router as submission_router

from app.api.auth import router as auth_router
from app.api.organization_routes import router as organization_router

app = FastAPI(
    title="EventOS API",
    description="Intelligent Event Orchestration System — WiSE@TI",
    version="1.0.0",
)

# Added ports 5174 and 5175 here to prevent silent CORS blocks!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(auth_router)
app.include_router(organization_router)
app.include_router(solver_router)
app.include_router(approval_router)
app.include_router(anomaly_router)
app.include_router(portal_router)
app.include_router(evaluation_router)
app.include_router(participant_router)
app.include_router(leaderboard_router)
app.include_router(ai_router)
app.include_router(evaluator_router)
app.include_router(event_router)
app.include_router(comms_router)
app.include_router(mentor_router)
app.include_router(admin_router)
app.include_router(demo_admin_router)
app.include_router(event_state_router)
app.include_router(submission_router)

@app.on_event("startup")
async def startup():
    redis_ok = ping_redis()
    print("EventOS API started")
    print(f"{'OK' if redis_ok else 'FAIL'} Redis: {'Connected' if redis_ok else 'Not Connected'}")

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
def debug_run_solver():
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