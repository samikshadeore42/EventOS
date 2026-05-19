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
- [Day 1 — What's Been Built (FS + Basic AI)](#day-1--whats-been-built-fs--basic-ai)
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

EventOS is a distributed, AI-assisted orchestration platform designed to manage the complex operational lifecycle of large-scale competitive events (hackathons, case competitions, engineering evaluations).

**Core capabilities being built:**
- Automated participant registration intake and CSV parsing
- Multi-constraint team formation using a CSP solver
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
       │ SQLAlchemy            │ Redis Broker
       ▼                       ▼
┌─────────────┐       ┌───────────────┐     ┌─────────────┐
│  PostgreSQL │       │     Redis     │     │  Gemini /   │
│  (State DB) │       │   (Broker)    │     │  Claude LLM │  ← AI (AI/ML)
└─────────────┘       └──────┬────────┘     └─────────────┘
                             │ Consumer
                             ▼
                  ┌──────────────────────┐
                  │    Celery Workers    │  ← FS + Basic AI
                  │  (Async Task Queue)  │
                  └──────────┬───────────┘
                             │ SMTP
                             ▼
                  ┌──────────────────────┐
                  │   SendGrid Gateway   │
                  │  (Transactional Mail)│
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
| AI/LLM | LangChain, Google Gemini API |
| Email | SendGrid, Jinja2 HTML templates |
| Auth | JWT (HMAC-SHA256), python-jose |
| Infrastructure | Docker, Docker Compose |

---

## Team Roles

| Role | Responsibility | Branch Prefix |
|---|---|---|
| **FE** — Frontend Developer | React SPA, dashboards, portals, UI components | `feature/fe-` |
| **FS** — Full Stack Developer | FastAPI routes, DB models, CRUD endpoints, CSV parsing | `feature/fs-` |
| **FS+AI** — Full Stack + Basic AI | Docker infra, Celery setup, email service, CSP solver | `feature/fsai-` |
| **AI/ML** — AI/ML Developer | CSP optimization, anomaly detection, LLM pipelines | `feature/ai-` |

> **Contract-first rule:** Backend defines Pydantic schemas before writing endpoint logic. Frontend uses auto-generated OpenAPI client bindings. Never call backend endpoints that aren't schema-defined first.

---

## Day 1 — What's Been Built (FS + Basic AI)

**Branch:** `feature/fsai-day1-scaffold`

This PR sets up the entire infrastructure foundation that every other team member builds on top of. Nothing else can run without this.

### ✅ Completed Tasks

#### 1. Docker Compose Orchestration (`docker-compose.yml`)
- **PostgreSQL 16** container with persistent volume and health checks
- **Redis 7** container — dual role: Celery broker + pub/sub backbone
- **FastAPI backend** container with hot-reload via `uvicorn --reload`
- **Celery Worker** container consuming `notifications` and `algorithms` queues
- **Celery Beat** container for periodic scheduled tasks
- All services wired via health-check dependencies — nothing starts before Postgres/Redis are healthy

#### 2. Celery Application (`app/core/celery_app.py`)
- Celery app configured with Redis as both broker and result backend
- **Named queues** separated by concern:
  - `notifications` → email and communication tasks
  - `algorithms` → CSP solver and ML tasks
  - `default` → general tasks
- Task timeouts: 5 min hard limit, 4 min soft warning (critical for LLM tasks)
- `task_acks_late=True` — tasks only acknowledged after successful execution, preventing data loss if a worker dies mid-task
- Retry policy: late acknowledgement + reject on worker lost

#### 3. Participant Input Schemas (`app/schemas/participant.py`)
- `ParticipantBase` — core fields with Pydantic v2 validation
- `ParticipantCreate` — registration input model
- `ParticipantUpdate` — partial update model (all fields optional)
- `ParticipantResponse` — API response model including DB-assigned UUID and team_id
- `ParticipantBulkUpload` — wraps a list for the CSV import endpoint
- `skill_vector` field validator — enforces all scores are in range `[0.0, 10.0]`
- `MOCK_ROSTER` — 4 sample participants available for immediate FE and FS local development

#### 4. FastAPI Application Shell (`app/main.py`)
- CORS configured for Vite dev server (`localhost:5173`)
- `/health` and `/ready` endpoints operational
- Startup event hook (auto-creates DB tables on boot)

#### 5. Task Stubs (`app/tasks/`)
- `communications.py` — `send_batch_emails` stub registered on `notifications` queue
- `solver.py` — `run_team_formation` stub registered on `algorithms` queue
- Both return structured stub responses so other roles can integrate immediately

#### 6. Project Configuration
- `backend/Dockerfile` — Python 3.11-slim base, system deps, pip install
- `backend/.env.example` — all required env vars documented (never commit `.env`)
- `backend/requirements.txt` — all Python dependencies pinned to exact versions
- `.gitignore` — Python, Node, Docker, and IDE artifacts excluded

### 📁 Files Created

```
EventOS/
├── docker-compose.yml                    ← NEW
├── .gitignore                            ← NEW
├── backend/
│   ├── Dockerfile                        ← NEW
│   ├── requirements.txt                  ← NEW
│   ├── .env.example                      ← NEW  (copy to .env, never commit .env)
│   └── app/
│       ├── main.py                       ← NEW
│       ├── core/
│       │   └── celery_app.py             ← NEW
│       ├── schemas/
│       │   └── participant.py            ← NEW
│       └── tasks/
│           ├── communications.py         ← NEW (stub — real impl Day 2)
│           └── solver.py                 ← NEW (stub — real impl Day 3)
```

### 🔌 What Other Roles Get From This

| Role | What Day 1 gives you |
|---|---|
| **FE** | `MOCK_ROSTER` in `schemas/participant.py` to build UI against. API running at `localhost:8000`. Swagger docs at `localhost:8000/docs`. |
| **FS** | Postgres + Redis running locally. `celery_app` importable for your tasks. Participant schema to write CRUD endpoints against. |
| **AI/ML** | `algorithms` Celery queue ready to consume. `run_team_formation` stub to replace with your real solver on Day 3. |

---

## Folder Structure

```
EventOS/
├── docker-compose.yml          # All services: Postgres, Redis, API, Celery
├── .gitignore
├── README.md
│
├── frontend/                   # FE Developer territory
│   └── src/
│       ├── components/         # Reusable UI elements
│       ├── pages/              # Dashboard, Participant, Judge views
│       └── openapi-client/     # Auto-generated API client — DO NOT hand-edit
│
└── backend/                    # Backend territory
    ├── Dockerfile
    ├── requirements.txt
    ├── .env.example            # Template — copy to .env and fill in your values
    ├── alembic/                # DB migrations (FS responsibility)
    │   └── versions/
    └── app/
        ├── main.py             # FastAPI app entry point
        ├── api/                # Route endpoints by context (FS)
        ├── models/             # SQLAlchemy DB table definitions (FS)
        ├── schemas/            # Pydantic request/response shapes (FS+AI) ✅ Day 1
        ├── services/           # Business logic + algorithms (FS+AI, AI/ML)
        ├── core/
        │   ├── celery_app.py   # Celery configuration (FS+AI) ✅ Day 1
        │   └── database.py     # DB engine + session (FS+AI) — Day 2
        └── tasks/
            ├── communications.py  # Email async tasks (FS+AI) ✅ Day 1 stub
            └── solver.py          # Algorithm async tasks (AI/ML) ✅ Day 1 stub
```

---

## Prerequisites

Confirm all of these are installed before running the project.

| Tool | Required Version | Check Command |
|---|---|---|
| Python | 3.11+ | `python3 --version` |
| Node.js | 20+ | `node --version` |
| Docker Desktop | 20+ | `docker --version` |
| Docker Compose | v2 (no hyphen) | `docker compose version` |
| Git | Any recent | `git --version` |

> **Windows users (WSL2):** Docker Desktop must be open on the Windows side, and WSL Integration must be enabled for your distro.
> Docker Desktop → Settings → Resources → WSL Integration → toggle ON your Ubuntu distro → Apply & Restart

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
nano backend/.env    # fill in your values
```

At minimum for Day 1, you only need the defaults. Fill in `SENDGRID_API_KEY` when you reach Day 2, and `GEMINI_API_KEY` when you reach Day 5.

### 3. (Frontend only) Install Node dependencies

```bash
cd frontend
npm install
cd ..
```

### 4. Verify Docker is running

```bash
docker ps
# Should return a table header without errors
```

---

## Running the Project

### Start all backend services

```bash
docker compose up --build
```

This starts 5 containers simultaneously:

| Container | Role | Port |
|---|---|---|
| `eventos_postgres` | PostgreSQL 16 database | `5432` |
| `eventos_redis` | Redis 7 broker + pub/sub | `6379` |
| `eventos_backend` | FastAPI API server | `8000` |
| `eventos_celery_worker` | Background task processor | — |
| `eventos_celery_beat` | Periodic task scheduler | — |

> First build takes 2–3 minutes. Subsequent starts are fast.

### Start the frontend dev server (separate terminal)

```bash
cd frontend
npm run dev
# Runs at http://localhost:5173
```

### Stop all services

```bash
docker compose down
```

### Stop and wipe database volume (full reset)

```bash
docker compose down -v
```

---

## Verifying Everything Works

Run these after `docker compose up --build` finishes.

**API health check**
```bash
curl http://localhost:8000/health
# → {"status":"ok","service":"eventos-api"}
```

**API readiness check**
```bash
curl http://localhost:8000/ready
# → {"status":"ready"}
```

**Interactive API docs**

Open in browser: `http://localhost:8000/docs`

**Celery worker connected to queues**
```bash
docker compose logs celery_worker | grep -E "queues|ready|connected"
# → celery@... ready, consuming from: notifications, algorithms, default
```

**Postgres accessible**
```bash
docker compose exec postgres psql -U eventflow -d eventflow_db -c "\dt"
# → list of tables (participants, teams after Day 2 migrations run)
```

**Redis responding**
```bash
docker compose exec redis redis-cli ping
# → PONG
```

---

## Environment Variables

Full reference for `backend/.env`:

```env
# ── Database ─────────────────────────────────────────────────────────
POSTGRES_USER=eventflow
POSTGRES_PASSWORD=eventflow_secret
POSTGRES_DB=eventflow_db
DATABASE_URL=postgresql://eventflow:eventflow_secret@postgres:5432/eventflow_db

# ── Redis ─────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── Application ───────────────────────────────────────────────────────
# Generate a strong key: python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# ── Email / SendGrid (Day 2) ──────────────────────────────────────────
# Free API key at https://sendgrid.com (100 emails/day on free tier)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=your-verified-sender@gmail.com
SENDGRID_FROM_NAME=EventOS WiSE@TI

# ── AI / LLM (Day 5) ─────────────────────────────────────────────────
# Free key at https://aistudio.google.com
GEMINI_API_KEY=
```

> **Security rule:** Never commit `.env` to git. It is in `.gitignore`. Share credentials with teammates over a private channel — not in PRs, not in Slack, not in commit messages.

---

## Git Workflow

### Branch naming convention

```
feature/<role>-<short-description>

feature/fsai-day1-scaffold
feature/fs-participant-crud
feature/fe-dashboard-layout
feature/ai-csp-solver
```

### Daily workflow

```bash
# Always start from latest develop
git checkout develop
git pull origin develop

# Create your branch
git checkout -b feature/fsai-day2-email-service

# Work and commit with clear messages
git add .
git commit -m "feat(email): add SendGrid service and Jinja2 templates"

# Push and open PR → develop (never directly to main)
git push origin feature/fsai-day2-email-service
```

### Branch rules

| Branch | Purpose | Who merges |
|---|---|---|
| `main` | Production-ready, tagged releases only | Lead after full review |
| `develop` | Integration branch — all feature PRs target here | Anyone after peer review |
| `feature/*` | Individual task branches | Merged via PR |

### PR checklist before requesting review

- [ ] Branch is up to date with `develop`
- [ ] All containers start without errors (`docker compose up`)
- [ ] Health check passes (`curl localhost:8000/health`)
- [ ] PR description lists: what was built, what it depends on, how to test it

### Auto-generating the frontend API client

After any backend schema change, run this to keep FE in sync:

```bash
# From project root
OPENAPI_OUTPUT_FILE=openapi.json python -m app.commands.generate_schema
npx openapi-ts --input ./openapi.json --output ./frontend/src/openapi-client
```

> Never hand-edit files inside `frontend/src/openapi-client/` — they are always overwritten.

---

## Day-by-Day Roadmap

Full 8-day plan for the FS+AI role:

| Day | Tasks | Status |
|---|---|---|
| **Day 1** | Docker Compose · Celery framework · Named queues · Participant schemas · Task stubs | ✅ Done |
| **Day 2** | DB session · SendGrid service · HTML email templates · CSP math model skeleton | 🔄 In Progress |
| **Day 3** | CSP recursive backtracking solver · Redis task status tracker | ⏳ Upcoming |
| **Day 4** | Team solver API endpoints · Manual approval endpoints | ⏳ Upcoming |
| **Day 5** | JWT secure link generator · Auth middleware · Celery task handlers for signed links | ⏳ Upcoming |
| **Day 6** | Score consolidation tasks · Daily notification scheduler | ⏳ Upcoming |
| **Day 7** | LLM drafting engine integration · Milestone email automation | ⏳ Upcoming |
| **Day 8** | System-wide load tests · Email delivery pipeline verification under traffic | ⏳ Upcoming |

---

## Troubleshooting

### `docker: command not found` in WSL2
Docker Desktop is not running or WSL2 integration is off.
Open Docker Desktop on Windows → Settings → Resources → WSL Integration → enable your distro → Apply & Restart.

### `port 5432 already in use`
A local Postgres instance is running outside Docker.
```bash
sudo service postgresql stop
docker compose up
```

### `port 8000 already in use`
```bash
lsof -ti:8000 | xargs kill -9
docker compose up
```

### Celery worker shows `No module named 'app'`
Always run Celery through `docker compose` — never run it directly on the host. The `WORKDIR /app` in the Dockerfile is required for imports to resolve.

### New package not found after adding to requirements.txt
```bash
docker compose down
docker compose up --build    # rebuilds the image with new dependencies
```

### Database tables not created on startup
Make sure all model files are imported in `main.py` before `create_all` is called:
```python
from app.models import participant  # must exist before this line
Base.metadata.create_all(bind=engine)
```

### SendGrid emails not sending (Day 2+)
1. Confirm `SENDGRID_API_KEY` in `.env` starts with `SG.`
2. Confirm the sender email is verified in SendGrid dashboard under Settings → Sender Authentication
3. Check Celery worker logs: `docker compose logs celery_worker`
4. If `SENDGRID_API_KEY` is blank, the service runs in dev mode — emails are logged to console, not sent

---

*EventOS — Built for WiSE@TI Hackathon, Texas Instruments India*
*FS+AI Role — Day 1 infrastructure scaffold*
