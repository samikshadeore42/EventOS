# EventOS - Quick Brief

## Overview
**EventOS** (EventFlow AI) is a deterministic, human-in-the-loop orchestration platform designed to manage competitive events like hackathons (e.g., WiSE@TI Hackathon). 
It automates team formation, evaluation aggregation, and anomaly detection while leveraging AI solely for generating prose (emails, rationales, rubrics) without granting it agency over the system state.

## Core Tech Stack
- **Backend:** FastAPI (Python 3.11), SQLAlchemy (PostgreSQL), Pydantic v2.
- **Asynchronous Engine:** Celery (workers for heavy lifting) & Redis (Broker/Backend).
- **Frontend:** React 19 (Vite), React Router, TanStack Query, TailwindCSS.
- **AI Integration:** Google Gemini via LangChain.
- **Infrastructure:** Docker & Docker Compose (for local/demo deployment).

## Key Workflows
1. **Participant Registration:** Admins upload CSVs of participants with their skills.
2. **Team Formation (CSP Solver):** The algorithmic solver uses Backtracking with Forward Checking to group participants into balanced teams based on skills and constraints.
3. **Approvals:** Admins review AI-explained draft teams and approve them in the dashboard.
4. **Evaluations:** Judges receive magic JWT links to their portals and submit scores.
5. **Anomaly Detection:** Background sweeps flag suspicious grading patterns (Z-score, Halo effect, conflicts of interest).
6. **Results & Comms:** Leaderboard consolidation and AI-drafted email dispatches.

## Directory Structure
- `/backend/app/api/`: FastAPI route definitions.
- `/backend/app/services/`: Core business logic (Solver, AI, Anomaly Detector).
- `/backend/app/tasks/`: Celery asynchronous task definitions.
- `/backend/app/models/` & `/schemas/`: SQLAlchemy database models and Pydantic validation contracts.
- `/frontend_new/src/views/`: Main React views (`AdminDashboard`, `JudgePortal`, `ParticipantPortal`).
- `/frontend_new/src/services/api.js`: Unified Axios HTTP client connecting React to FastAPI.

## Running the Project (Local Demo)
1. **Backend & Infra:** `docker-compose up --build -d` (Spins up Postgres, Redis, FastAPI, Celery worker, and Celery beat).
2. **Frontend:** `cd frontend_new && npm install && npm run dev`
3. **Environment:** Requires `.env` file with `GOOGLE_API_KEY`, `GEMINI_MODEL`, and database/Redis URIs.

## Current Status & Next Steps
The platform is in a "demo-hardened" prototype state.
**Next Priorities:**
- Implement Distributed Tracing (OpenTelemetry) for deep celery observability.
- Add Redis caching for high-traffic read APIs (like the leaderboard).
- Write unit and integration tests (Pytest/Vitest).
- Prepare for Kubernetes (KEDA) deployment for production scale.
