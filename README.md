# EventOS — Intelligent Event Orchestration System
### WiSE@TI Hackathon · Texas Instruments India

> **Automated lifecycle orchestration for competitive engineering challenges.**
> EventOS replaces spreadsheet chaos with deterministic, AI-assisted workflow automation — handling participant intake, multi-constraint team formation, secure evaluator routing, and anomaly detection.

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Team Roles](#team-roles)
- [Day 1 — Infrastructure Scaffold (FS+AI)](#day-1--infrastructure-scaffold-fsai)
- [Day 2 — Database, Email Service & CSP Model (FS+AI)](#day-2--database-email-service--csp-model-fsai)
- [Day 3 — Backtracking Solver & Redis Task Tracker (FS+AI)](#day-3--backtracking-solver--redis-task-tracker-fsai)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Running the Project](#running-the-project)
- [Verifying Everything Works](#verifying-everything-works)
- [Environment Variables](#environment-variables)
- [Git Workflow](#git-workflow)
- [Day-by-Day Roadmap](#day-by-day-roadmap)
- [Troubleshooting](#troubleshooting)

---

## Project Overview

EventOS is a distributed, AI-assisted orchestration platform designed to manage the complex operational lifecycle of large-scale competitive events — hackathons, case competitions, and engineering evaluations.

**Core capabilities being built:**
- Automated participant registration intake and CSV parsing
- Multi-constraint team formation using a CSP (Constraint Satisfaction Problem) solver
- Secure evaluator routing via JWT-signed access links
- Statistical grading anomaly detection
- Human-in-the-loop approval gates for critical decisions
- Real-time operational dashboard with WebSocket live updates
- LLM-assisted workflow generation and email drafting

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              React SPA (Vite + Tailwind)         │  ← Frontend (FE)
│         shadcn/ui · Zustand · React Query        │
└────────────────────┬────────────────────────────┘
                     │ HTTPS / JWT
                     ▼
┌─────────────────────────────────────────────────┐
│              FastAPI Engine                      │  ← Backend (FS)
│         REST Endpoints · Pydantic Schemas        │
└──────┬───────────────────────┬──────────────────┘
       │ SQLAlchemy            │ Redis
       ▼                       ▼
┌─────────────┐       ┌────────────────────┐     ┌─────────────┐
│  PostgreSQL │       │       Redis         │     │  Gemini /   │
│  (State DB) │       │  Broker · Tracker  │     │  Claude LLM │  ← AI (AI/ML)
└─────────────┘       └────────┬───────────┘     └─────────────┘
                               │ Consumer
                               ▼
                  ┌────────────────────────┐
                  │     Celery Workers     │  ← FS + Basic AI
                  │  CSP Solver · Emails  │
                  └──────────┬─────────────┘
                             │ SMTP
                             ▼
                  ┌──────────────────────┐
                  │   SendGrid Gateway   │
                  └──────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui, Zustand, React Query |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Task Queue | Celery 5.4, Redis 7 |
| Task Tracking | Redis key-value store with TTL (in-memory, 2hr expiry) |
| AI / LLM | LangChain, Google Gemini API |
| Email | SendGrid API, Jinja2 HTML templates |
| Auth | JWT (HMAC-SHA256), python-jose |
| Infrastructure | Docker, Docker Compose |

---

## Team Roles

| Role | Responsibility | Branch Prefix |
|---|---|---|
| **FE** — Frontend Developer | React SPA, dashboards, portals, UI components | `feature/fe-` |
| **FS** — Full Stack Developer | FastAPI routes, DB models, CRUD endpoints, CSV parsing | `feature/fs-` |
| **FS+AI** — Full Stack + Basic AI | Docker infra, Celery, email service, CSP solver, task tracker | `feature/fsai-` |
| **AI/ML** — AI/ML Developer | CSP optimization, anomaly detection, LLM pipelines | `feature/ai-` |

> **Contract-first rule:** Backend defines Pydantic schemas before writing any endpoint logic. Frontend uses auto-generated OpenAPI client bindings. Never call endpoints that are not schema-defined first.

---

## Day 1 — Infrastructure Scaffold (FS+AI)

**Branch:** `feature/fsai-day1-scaffold`
**Status:** ✅ Complete — all containers verified green

This PR establishes the entire infrastructure foundation. No other role can run their work locally without this being merged first.

### What Was Built

#### 1. Docker Compose Orchestration (`docker-compose.yml`)
- **PostgreSQL 16** — persistent volume, health checks before dependent services start
- **Redis 7** — dual role: Celery task broker + pub/sub backbone for WebSockets
- **FastAPI backend** — hot-reload via `uvicorn --reload`, source mounted as volume
- **Celery Worker** — consumes `notifications`, `algorithms`, and `default` queues
- **Celery Beat** — periodic task scheduler
- All 5 services wired with `depends_on + condition: service_healthy`

#### 2. Celery Application (`app/core/celery_app.py`)
- Redis as both broker and result backend
- Named queues — `notifications` for email, `algorithms` for CSP/ML
- 5-minute hard task timeout, 4-minute soft warning
- `task_acks_late=True` — tasks acknowledged only after successful completion

#### 3. Participant Input Schemas (`app/schemas/participant.py`)
- `ParticipantBase`, `ParticipantCreate`, `ParticipantUpdate`, `ParticipantResponse`, `ParticipantBulkUpload`
- `skill_vector` field validator enforcing score range `[0.0, 10.0]`
- `MOCK_ROSTER` — 4 sample participants for immediate FE/FS local development

#### 4. FastAPI Shell (`app/main.py`)
- CORS configured for Vite dev server at `localhost:5173`
- `/health` and `/ready` endpoints
- Startup hook for auto table creation

#### 5. Task Stubs (`app/tasks/`)
- `send_batch_emails` stub on `notifications` queue
- `run_team_formation` stub on `algorithms` queue

#### 6. Project Config
- `backend/Dockerfile`, `requirements.txt`, `.env.example`, `.gitignore`

### Files Created (Day 1)

```
EventOS/
├── docker-compose.yml
├── .gitignore
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── .env.example
    └── app/
        ├── main.py
        ├── core/
        │   └── celery_app.py
        ├── schemas/
        │   └── participant.py
        └── tasks/
            ├── communications.py       (stub)
            └── solver.py               (stub)
```

### What Other Roles Get From Day 1

| Role | What you can do now |
|---|---|
| **FE** | `MOCK_ROSTER` to build UI against. API at `localhost:8000`. Swagger at `localhost:8000/docs`. |
| **FS** | Postgres + Redis running. `celery_app` importable. Participant schema to write CRUD against. |
| **AI/ML** | `algorithms` queue ready. `run_team_formation` stub to replace with your solver on Day 3. |

---

## Day 2 — Database, Email Service & CSP Model (FS+AI)

**Branch:** `feature/fsai-day2-db-email-csp`
**Status:** ✅ Complete — all containers verified green. SendGrid configured, end-to-end delivery pending API key verification.

This PR connects the application to PostgreSQL, builds the full async email pipeline, and lays the mathematical foundation for the CSP team formation solver.

### What Was Built

#### 1. Database Engine & Session Factory (`app/core/database.py`)
- SQLAlchemy `create_engine` with `pool_pre_ping=True`
- Connection pool: `pool_size=10`, `max_overflow=20`
- `SessionLocal` factory with `finally` block cleanup
- `Base` declarative class all models inherit from
- `get_db()` FastAPI dependency for clean session lifecycle per request

#### 2. SQLAlchemy Database Models (`app/models/participant.py`)

**`Participant` table:**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `first_name` | VARCHAR(50) | |
| `last_name` | VARCHAR(50) | |
| `email` | VARCHAR(255) | Unique, B-Tree indexed |
| `institution` | VARCHAR(100) | |
| `skill_vector` | JSONB | `{"python": 8.5, "ml": 7.0}` |
| `team_id` | UUID (FK, nullable) | B-Tree indexed |
| `email_verified` | BOOLEAN | |
| `welcome_email_sent` | BOOLEAN | Prevents duplicate emails |
| `created_at` / `updated_at` | TIMESTAMP | |

**`Team` table:**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `team_name` | VARCHAR(100) | |
| `rationale` | TEXT | LLM-generated explanation |
| `is_approved` | BOOLEAN | B-Tree indexed |
| `created_at` | TIMESTAMP | |

#### 3. SendGrid Email Service (`app/services/email_service.py`)
- `EmailService` class — single contact point for all email sending
- Jinja2 template rendering from `app/templates/emails/`
- `send_registration_confirmation()` and `send_team_assignment()`
- Dev mode fallback — if `SENDGRID_API_KEY` is blank, emails log to console, app never crashes

#### 4. HTML Email Templates (`app/templates/emails/`)
- `registration.html` — purple gradient header, 3-step next-steps timeline, fully inline CSS for Gmail compatibility
- `team_assignment.html` — green gradient header, dynamic member list via Jinja2 `{% for %}` loop, conditional LLM rationale block

#### 5. Email Pydantic Schemas (`app/schemas/email_schemas.py`)
- `EmailSendRequest`, `BulkEmailRequest`, `EmailSendResult`

#### 6. Real Celery Email Tasks (`app/tasks/communications.py`)
- `EmailTask` base class with `on_failure`, `on_retry`, `on_success` hooks
- `send_registration_email` — `max_retries=3`, exponential backoff `60 × (attempt+1)s`
- `send_batch_emails` — iterates recipient list, tracks `{sent, failed, errors[]}`

#### 7. CSP Math Model Skeleton (`app/services/csp_solver.py`)
- `ParticipantNode`, `TeamSlot`, `CSPFormulation` data structures
- `ConstraintChecker` — size limit + institutional diversity validators
- `ObjectiveFunction` — implements `min Σ_j Σ_d (Σ_i x_{i,j}·S_{i,d} − μ_d)²`
- Day 2 solver: greedy heuristic placeholder (replaced by backtracking on Day 3)

### Files Created / Updated (Day 2)

```
backend/
├── requirements.txt                    (updated — sendgrid, jinja2 added)
└── app/
    ├── main.py                         (updated — model imports, table creation)
    ├── core/
    │   └── database.py                 (new)
    ├── models/
    │   └── participant.py              (new — Participant + Team tables)
    ├── schemas/
    │   └── email_schemas.py            (new)
    ├── services/
    │   ├── email_service.py            (new)
    │   └── csp_solver.py               (new — math model + greedy solver)
    ├── tasks/
    │   └── communications.py           (updated — stub → real tasks)
    └── templates/
        └── emails/
            ├── registration.html       (new)
            └── team_assignment.html    (new)
```

### What Other Roles Get From Day 2

| Role | What you can do now |
|---|---|
| **FE** | `Team` model exists — build team assignment UI. Email templates show exactly what participants will see. |
| **FS** | `get_db()` ready to inject into route handlers. `Participant` + `Team` models ready for CRUD. Call `send_registration_email.delay()` from your routes. |
| **AI/ML** | `CSPFormulation`, `ParticipantNode`, `ConstraintChecker`, `ObjectiveFunction` all importable. Day 3 replaces only the solver internals. |

### ⚠️ Pending Verification (SendGrid)

SendGrid is fully integrated. End-to-end delivery needs verifying once `SENDGRID_API_KEY` is set and sender email is authenticated in the SendGrid dashboard. Until then the service runs in dev mode — emails log to Celery worker console.

---

## Day 3 — Backtracking Solver & Redis Task Tracker (FS+AI)

**Branch:** `feature/fsai-day3-solver-tracker`
**Status:** ✅ Complete — solver verified via `/debug/run-solver`, task status verified via `GET /tasks/{task_id}/status`

This PR replaces the Day 2 greedy solver with a production-grade recursive backtracking algorithm, and introduces a Redis-backed real-time task progress tracker that the frontend can poll for live status updates.

### What Was Built

#### 1. Full Backtracking CSP Solver (`app/services/csp_solver.py`)

Complete replacement of the Day 2 greedy solver. All Day 2 data structures (`ParticipantNode`, `TeamSlot`, `CSPFormulation`, `ConstraintChecker`, `ObjectiveFunction`) are preserved unchanged. Only `CSPTeamSolver` was replaced.

**Algorithm:**

```
1. Sort all participants by MRV (Most Remaining Values)
   → Most constrained participants (fewest valid teams) placed first
   → Reduces backtracking by catching dead-ends early

2. For each participant, rank teams by LCV (Least Constraining Value)
   → Try the team where adding this participant most improves skill balance
   → Objective: minimize skill variance across teams

3. After each placement, run Forward Checking
   → Check every remaining participant still has ≥ 1 valid team
   → If any participant is now stuck → prune this branch immediately

4. On reaching a complete assignment (all participants placed)
   → Score with ObjectiveFunction.skill_variance_score()
   → If better than current best → snapshot with deepcopy()
   → Continue searching for an even better solution

5. On dead end → undo last placement (backtrack) → try next team

6. If TIME_LIMIT_SECONDS (10s) exceeded → fall back to greedy solver
```

**Key methods added to `CSPTeamSolver`:**

| Method | Role |
|---|---|
| `solve()` | Public entry point. Returns `(teams, evaluation_report)`. |
| `_backtrack(remaining, teams, depth)` | Core recursive function. Tries every valid team for the current participant, recurses, then undoes (backtracks). |
| `_forward_check(remaining, teams)` | After each placement, verifies every unplaced participant still has at least one valid team. Returns `False` to prune. |
| `_order_by_mrv(participants, teams)` | Sorts participants by number of valid teams ascending — most constrained first. |
| `_order_teams_by_lcv(candidate, teams)` | Sorts teams by post-placement skill variance ascending — best balance first. |
| `_greedy_fallback(participants)` | Day 2 greedy — only used if backtracking hits the 10s time limit. |

**Evaluation report fields returned by `solve()`:**

```json
{
  "variance_score": 3.21,
  "num_teams": 2,
  "team_sizes": [4, 4],
  "quality": "excellent",
  "nodes_visited": 12,
  "elapsed_seconds": 0.04,
  "timed_out": false,
  "algorithm": "backtracking"
}
```

**Helper added:** `build_formulation_from_dicts(roster, ...)` — converts raw participant dicts from DB or mock data into a `CSPFormulation` ready for the solver. Used by the Celery task.

#### 2. Redis Client Singleton (`app/core/redis_client.py`)
- Single `ConnectionPool` shared across all containers — no redundant TCP connections
- `decode_responses=True` — all Redis values returned as strings, never raw bytes
- `get_redis()` — returns a client from the shared pool. Import this everywhere Redis is needed.
- `ping_redis()` — health check used by `/health` endpoint

**Why a singleton?** Without it, every API request and every Celery task would open a new TCP connection to Redis. Under load this exhausts the connection limit and causes timeouts.

#### 3. Redis Task Status Tracker (`app/services/task_tracker.py`)

Provides real-time visibility into what a background Celery task is currently doing. Celery tasks write progress to Redis; the API reads from Redis; the frontend polls the API.

**Redis key schema:**

```
task:{task_id}:status  →  JSON string (full status blob)
task:{task_id}:log     →  Redis List of timestamped log lines (capped at 50)
```

Both keys auto-expire after **2 hours** via Redis TTL — no manual cleanup needed.

**`TaskStatus` constants:** `pending · running · success · failed · retrying`

**Write methods (called inside Celery tasks):**

| Method | When to call |
|---|---|
| `TaskTracker.initialize(task_id, task_type, total_steps, metadata)` | Very first line of every Celery task |
| `TaskTracker.mark_running(task_id, message)` | After initialization, before heavy work starts |
| `TaskTracker.update(task_id, status, progress, message)` | Mid-task progress updates |
| `TaskTracker.mark_success(task_id, result, message)` | On successful completion |
| `TaskTracker.mark_failed(task_id, error)` | In the except block before re-raising |

**Read methods (called by API routes):**

| Method | Returns |
|---|---|
| `TaskTracker.get_status(task_id)` | Full status dict or `None` |
| `TaskTracker.get_logs(task_id)` | List of log line strings |
| `TaskTracker.get_status_with_logs(task_id)` | Status dict with `logs` key appended — use this for the API endpoint |

**Status blob shape:**

```json
{
  "task_id": "abc-123",
  "task_type": "team_formation",
  "status": "success",
  "progress": 8,
  "total_steps": 8,
  "message": "Successfully formed 2 teams. Quality: excellent.",
  "result": { "teams": [...], "evaluation": {...} },
  "error": null,
  "metadata": { "num_participants": 8, "num_teams": 2 },
  "started_at": "2025-05-20T10:00:00Z",
  "updated_at": "2025-05-20T10:00:00Z",
  "completed_at": "2025-05-20T10:00:04Z",
  "logs": [
    "[10:00:00] [RUNNING] Starting CSP solver for 8 participants → 2 teams",
    "[10:00:00] [RUNNING] Building CSP formulation and validating constraints...",
    "[10:00:04] [SUCCESS] Successfully formed 2 teams. Quality: excellent."
  ]
}
```

#### 4. Real Celery Solver Task (`app/tasks/solver.py`)

Upgraded from Day 1 stub to a full production task with tracker integration.

**Task lifecycle inside `run_team_formation`:**

```
Step 1 → TaskTracker.initialize()       writes pending status to Redis
Step 2 → TaskTracker.mark_running()     status → running
Step 3 → build_formulation_from_dicts() validates roster and config
Step 4 → CSPTeamSolver(formulation).solve()   runs backtracking
Step 5 → serialize TeamSlot objects to plain dicts
Step 6 → TaskTracker.mark_success()     status → success, result stored
       → on any exception: TaskTracker.mark_failed() then self.retry()
```

Team names are auto-assigned alphabetically: Team A, Team B, Team C...

#### 5. New API Endpoints (`app/main.py`)

**`GET /tasks/{task_id}/status`**
- Reads from Redis via `TaskTracker.get_status_with_logs()`
- Returns full status blob including log lines
- Returns `404` if task not found or expired (2hr TTL)
- Frontend polls this every 1–2 seconds to drive progress bars

**`POST /debug/run-solver`** *(debug only — remove before production)*
- Triggers a test solver run using `MOCK_ROSTER × 2` (8 participants, 2 teams)
- Returns `{ task_id, status_url }` immediately
- Use the returned `status_url` to poll progress

**`GET /health`** updated — now includes `"redis": true/false` field

### Files Created / Updated (Day 3)

```
backend/
└── app/
    ├── main.py                         (updated — status endpoint, debug endpoint, redis health)
    ├── core/
    │   └── redis_client.py             (new — connection pool singleton)
    ├── services/
    │   ├── csp_solver.py               (updated — greedy replaced by full backtracking)
    │   └── task_tracker.py             (new — Redis task progress tracker)
    └── tasks/
        └── solver.py                   (updated — stub → real task with tracker)
```

### Verified End-to-End (Day 3)

```bash
# 1. Trigger solver task
curl -X POST http://localhost:8000/debug/run-solver
# → {"task_id": "abc-123", "status_url": "/tasks/abc-123/status"}

# 2. Poll status (run immediately)
curl http://localhost:8000/tasks/abc-123/status
# → {"status": "running", "progress": 2, "message": "Running backtracking search..."}

# 3. Poll again after ~1 second
curl http://localhost:8000/tasks/abc-123/status
# → {"status": "success", "result": {"teams": [...], "evaluation": {"quality": "excellent"}}}

# 4. Celery worker logs
docker compose logs celery_worker
# → [CSP] Starting backtracking search: 8 participants → 2 teams
# → [CSP]   New best solution at depth 8: variance=3.2100
# → [CSP] Solved in 0.04s | nodes=12 | variance=3.21 | quality=excellent
```

### What Other Roles Get From Day 3

| Role | What you can do now |
|---|---|
| **FE** | Poll `GET /tasks/{task_id}/status` to build live progress bars and solver result views. The `logs[]` array can drive a live log panel. |
| **FS** | Call `run_team_formation.delay(roster, config)` from your team formation endpoint and return `task_id` to the frontend. Import `TaskTracker.get_status()` for any route that needs to read task state. |
| **AI/ML** | Full solver interface is stable. `CSPFormulation`, `ConstraintChecker`, `ObjectiveFunction` unchanged — safe to extend with weighted scoring or custom constraints. |

---

## Folder Structure

```
EventOS/
├── docker-compose.yml              # All services: Postgres, Redis, API, Celery
├── .gitignore
├── README.md
│
├── frontend/                       # FE Developer territory
│   └── src/
│       ├── components/
│       ├── pages/
│       └── openapi-client/         # Auto-generated — DO NOT hand-edit
│
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── .env.example
    ├── alembic/
    │   └── versions/
    └── app/
        ├── main.py
        ├── api/                     # Route handlers (FS)
        ├── models/
        │   └── participant.py       # Participant + Team ✅ Day 2
        ├── schemas/
        │   ├── participant.py       # Participant schemas ✅ Day 1
        │   └── email_schemas.py     # Email schemas ✅ Day 2
        ├── services/
        │   ├── email_service.py     # SendGrid service ✅ Day 2
        │   ├── csp_solver.py        # Backtracking solver ✅ Day 3
        │   └── task_tracker.py      # Redis task tracker ✅ Day 3
        ├── core/
        │   ├── celery_app.py        # Celery config ✅ Day 1
        │   ├── database.py          # DB engine + session ✅ Day 2
        │   └── redis_client.py      # Redis connection pool ✅ Day 3
        ├── tasks/
        │   ├── communications.py    # Email tasks ✅ Day 2
        │   └── solver.py            # Solver task ✅ Day 3
        └── templates/
            └── emails/
                ├── registration.html       ✅ Day 2
                └── team_assignment.html    ✅ Day 2
```

---

## Prerequisites

| Tool | Required Version | Check Command |
|---|---|---|
| Python | 3.11+ | `python3 --version` |
| Node.js | 20+ | `node --version` |
| Docker Desktop | 20+ | `docker --version` |
| Docker Compose | v2 (no hyphen) | `docker compose version` |
| Git | Any recent | `git --version` |

> **Windows users (WSL2):** Docker Desktop must be open on the Windows side with WSL Integration enabled for your distro.
> Docker Desktop → Settings → Resources → WSL Integration → enable your distro → Apply & Restart

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/EventOS.git
cd EventOS
```

### 2. Set up environment variables

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Postgres and Redis defaults work out of the box for local development. Fill in `SENDGRID_API_KEY` when verifying email, `GEMINI_API_KEY` on Day 5.

### 3. (Frontend only) Install Node dependencies

```bash
cd frontend
npm install
cd ..
```

### 4. Verify Docker is running

```bash
docker ps
```

---

## Running the Project

### Start all backend services

```bash
docker compose up --build
```

| Container | Role | Port |
|---|---|---|
| `eventos_postgres` | PostgreSQL 16 | `5432` |
| `eventos_redis` | Redis 7 — broker + task tracker | `6379` |
| `eventos_backend` | FastAPI API server | `8000` |
| `eventos_celery_worker` | Background task processor | — |
| `eventos_celery_beat` | Periodic scheduler | — |

> First build takes 2–3 minutes. Subsequent starts are fast.

### Start the frontend dev server (separate terminal)

```bash
cd frontend
npm run dev
# → http://localhost:5173
```

### Stop all services

```bash
docker compose down
```

### Stop and wipe database (full reset)

```bash
docker compose down -v
```

---

## Verifying Everything Works

**API health check (now includes Redis status)**
```bash
curl http://localhost:8000/health
# → {"status":"ok","service":"eventos-api","redis":true}
```

**Swagger UI**
```
http://localhost:8000/docs
```

**Database tables**
```bash
docker compose exec postgres psql -U eventflow -d eventflow_db -c "\dt"
# → participants, teams
```

**Celery queues**
```bash
docker compose logs celery_worker | grep -E "queues|ready"
# → consuming from: notifications, algorithms, default
```

**Redis**
```bash
docker compose exec redis redis-cli ping
# → PONG
```

**CSP solver end-to-end test**
```bash
# Trigger
curl -X POST http://localhost:8000/debug/run-solver
# → {"task_id":"abc-123","status_url":"/tasks/abc-123/status"}

# Poll (replace with your task_id)
curl http://localhost:8000/tasks/abc-123/status
# → {"status":"success","result":{"teams":[...],"evaluation":{"quality":"excellent"}}}
```

---

## Environment Variables

```env
# ── Database ──────────────────────────────────────────────────────────
POSTGRES_USER=eventflow
POSTGRES_PASSWORD=eventflow_secret
POSTGRES_DB=eventflow_db
DATABASE_URL=postgresql://eventflow:eventflow_secret@postgres:5432/eventflow_db

# ── Redis ─────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── Application ───────────────────────────────────────────────────────
# Generate: python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# ── Email / SendGrid (Day 2) ──────────────────────────────────────────
# Free key at https://sendgrid.com — 100 emails/day on free tier
# Sender must be verified: SendGrid → Settings → Sender Authentication
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=your-verified-sender@gmail.com
SENDGRID_FROM_NAME=EventOS WiSE@TI

# ── AI / LLM (Day 5) ─────────────────────────────────────────────────
# Free key at https://aistudio.google.com
GEMINI_API_KEY=
```

> **Never commit `.env` to git.** Share values with teammates over a private channel only.

---

## Git Workflow

### Branch naming

```
feature/<role>-<short-description>

feature/fsai-day1-scaffold
feature/fsai-day2-db-email-csp
feature/fsai-day3-solver-tracker
feature/fs-participant-crud
feature/fe-dashboard-layout
feature/ai-csp-solver
```

### Daily workflow

```bash
git checkout develop
git pull origin develop
git checkout -b feature/fsai-day3-solver-tracker

git add .
git commit -m "feat(solver): replace greedy with backtracking + MRV/LCV/FC heuristics"
git commit -m "feat(tracker): add Redis task status tracker with TTL and log lines"
git commit -m "feat(api): add GET /tasks/{task_id}/status and POST /debug/run-solver"

git push origin feature/fsai-day3-solver-tracker
```

### Branch rules

| Branch | Purpose |
|---|---|
| `main` | Production-ready tagged releases — never push directly |
| `develop` | Integration — all feature PRs target here |
| `feature/*` | Individual task branches, merged via PR after peer review |

### Auto-generating the frontend API client

```bash
OPENAPI_OUTPUT_FILE=openapi.json python -m app.commands.generate_schema
npx openapi-ts --input ./openapi.json --output ./frontend/src/openapi-client
```

---

## Day-by-Day Roadmap

| Day | FS+AI Tasks | Status |
|---|---|---|
| **Day 1** | Docker Compose · Celery framework · Named queues · Participant schemas · Task stubs | ✅ Done |
| **Day 2** | DB engine + session · SQLAlchemy models · SendGrid service · HTML email templates · Real Celery email tasks · CSP math model skeleton | ✅ Done |
| **Day 3** | Backtracking solver (MRV + LCV + FC) · Redis client singleton · Redis task status tracker · Real solver Celery task · Task status API endpoint | ✅ Done |
| **Day 4** | Team solver API endpoints · Manual approval endpoints | 🔄 Next |
| **Day 5** | JWT secure link generator · Auth middleware · Celery task handlers for signed links | ⏳ Upcoming |
| **Day 6** | Score consolidation tasks · Daily notification scheduler | ⏳ Upcoming |
| **Day 7** | LLM drafting engine integration · Milestone email automation | ⏳ Upcoming |
| **Day 8** | System-wide load tests · Email delivery pipeline verification | ⏳ Upcoming |

---

## Troubleshooting

### `docker: command not found` in WSL2
Docker Desktop not running or WSL integration off.
Open Docker Desktop → Settings → Resources → WSL Integration → enable distro → Apply & Restart.

### `port 5432 already in use`
```bash
sudo service postgresql stop && docker compose up
```

### `port 8000 already in use`
```bash
lsof -ti:8000 | xargs kill -9 && docker compose up
```

### New package not found after adding to `requirements.txt`
```bash
docker compose down && docker compose up --build
```

### Celery worker shows `No module named 'app'`
Always run Celery via `docker compose` — the `WORKDIR /app` in the Dockerfile is required for imports to resolve.

### `GET /tasks/{task_id}/status` returns 404
Either the task_id is wrong, or the 2-hour Redis TTL has expired. Re-trigger via `/debug/run-solver` to get a fresh task_id.

### Solver returns `"algorithm": "greedy_fallback"` instead of `"backtracking"`
The 10-second time limit was hit. This happens with very large rosters or highly conflicting institution constraints. For the WiSE@TI scale (≤100 participants) this should not occur with the current mock data.

### Database tables not created on startup
Confirm all model files are imported in `main.py` before `create_all`:
```python
from app.models import participant  # must be before this line
Base.metadata.create_all(bind=engine)
```

### SendGrid not sending emails
1. Confirm `SENDGRID_API_KEY` starts with `SG.`
2. Verify sender email in SendGrid → Settings → Sender Authentication
3. Check logs: `docker compose logs celery_worker`
4. Blank key = dev mode, emails log to console

### SQLAlchemy `QueuePool limit exceeded`
Reduce Celery worker concurrency in `docker-compose.yml`:
```yaml
command: celery -A app.core.celery_app worker --loglevel=info --concurrency=2
```

---

*EventOS — Built for WiSE@TI Hackathon, Texas Instruments India*
*FS+AI Role — Days 1, 2 & 3 complete*