# File: backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.models import participant  # noqa: F401

app = FastAPI(
    title="EventOS API",
    description="Intelligent Event Orchestration System — WiSE@TI",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
    print("Database tables created / verified succcesfully")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "EventOS-api"}


@app.get("/ready")
def readiness_check():
    return {"status": "ready"}
