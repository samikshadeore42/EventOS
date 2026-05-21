# File: backend/app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.services.task_tracker import TaskTracker
from app.core.redis_client import ping_redis
from app.models import participant
from app.models import evaluation
from app.api.solver_routes import router as solver_router
from app.api.approval_routes import router as approval_router
from app.api.anomaly_routes import router as anomaly_router
from app.api.portal_routes import router as portal_router
from app.api.evaluation_routes import router as evaluation_router



app = FastAPI(
    title="EventOS API",
    description="Intelligent Event Orchestration System — WiSE@TI",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(solver_router)
app.include_router(approval_router)
app.include_router(anomaly_router)
app.include_router(portal_router)
app.include_router(evaluation_router)

@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
    redis_ok = ping_redis()
    print("Database tables created / verified succcesfully")
    print(f"{'✅' if redis_ok else '❌'} Redis connection: {'OK' if redis_ok else 'FAILED'}")

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
    for i, p in enumerate(roster):
        p = dict(p)
        p["id"] = f"mock-{i}"
        p["email"] = f"mock{i}@test.com"
        if i >= 4:
            p["first_name"] = f"{p['first_name']} (Clone)"
        roster[i] = p

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
