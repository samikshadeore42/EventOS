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
| **FS+AI** — Full Stack + Basic AI | Docker infra, Celery, email service, CSP solver | `feature/fsai-` |
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
- **FastAPI backend** — hot-reload via `uvicorn --reload`, mounts source as volume
- **Celery Worker** — consumes `notifications`, `algorithms`, and `default` queues
- **Celery Beat** — periodic task scheduler
- All 5 services wired with `depends_on + condition: service_healthy` — nothing starts before Postgres and Redis pass their health checks

#### 2. Celery Application (`app/core/celery_app.py`)
- Redis as both broker and result backend
- Named queues separated by concern — `notifications` for email, `algorithms` for CSP/ML
- 5-minute hard task timeout, 4-minute soft warning (prevents LLM tasks from hanging)
- `task_acks_late=True` — tasks acknowledged only after successful completion, preventing data loss if a worker crashes mid-execution

#### 3. Participant Input Schemas (`app/schemas/participant.py`)
- `ParticipantBase`, `ParticipantCreate`, `ParticipantUpdate`, `ParticipantResponse`, `ParticipantBulkUpload`
- `skill_vector` field validator enforcing score range `[0.0, 10.0]`
- `MOCK_ROSTER` — 4 sample participants ready for FE and FS local development

#### 4. FastAPI Shell (`app/main.py`)
- CORS configured for Vite dev server at `localhost:5173`
- `/health` and `/ready` endpoints
- Startup hook for auto table creation

#### 5. Task Stubs (`app/tasks/`)
- `send_batch_emails` stub on `notifications` queue
- `run_team_formation` stub on `algorithms` queue
- Both return structured responses so other roles can integrate immediately

#### 6. Project Config
- `backend/Dockerfile` — Python 3.11-slim, system deps, pip install
- `backend/.env.example` — all env vars documented
- `backend/requirements.txt` — all dependencies pinned
- `.gitignore` — Python, Node, Docker, IDE artifacts excluded

### Files Created (Day 1)

```
EventOS/
├── docker-compose.yml                        ← NEW
├── .gitignore                                ← NEW
└── backend/
    ├── Dockerfile                            ← NEW
    ├── requirements.txt                      ← NEW
    ├── .env.example                          ← NEW
    └── app/
        ├── main.py                           ← NEW
        ├── core/
        │   └── celery_app.py                 ← NEW
        ├── schemas/
        │   └── participant.py                ← NEW
        └── tasks/
            ├── communications.py             ← NEW (stub)
            └── solver.py                     ← NEW (stub)
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
- SQLAlchemy `create_engine` with `pool_pre_ping=True` — checks connection liveness before each use
- Connection pool: `pool_size=10`, `max_overflow=20` — handles Celery worker burst traffic without exhausting Postgres connections
- `SessionLocal` factory — each API request gets its own isolated session, closed automatically via `finally` block
- `Base` declarative class — all SQLAlchemy models inherit from this
- `get_db()` dependency — FastAPI dependency injection pattern for clean session lifecycle per request

#### 2. SQLAlchemy Database Models (`app/models/participant.py`)

**`Participant` table:**
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | Auto-generated, more secure than auto-increment |
| `first_name` | VARCHAR(50) | |
| `last_name` | VARCHAR(50) | |
| `email` | VARCHAR(255) | Unique, B-Tree indexed for fast auth lookups |
| `institution` | VARCHAR(100) | |
| `skill_vector` | JSONB | `{"python": 8.5, "ml": 7.0}` — indexed, queryable |
| `team_id` | UUID (FK, nullable) | B-Tree indexed for fast team grouping queries |
| `email_verified` | BOOLEAN | Tracks SendGrid validation state |
| `welcome_email_sent` | BOOLEAN | Prevents duplicate welcome emails |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | Auto-updated on record change |

**`Team` table:**
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `team_name` | VARCHAR(100) | |
| `rationale` | TEXT | LLM-generated team composition explanation |
| `is_approved` | BOOLEAN | B-Tree indexed for dashboard approval filtering |
| `created_at` | TIMESTAMP | |

- `Team.members` relationship — `team.members` returns all assigned participants
- Tables auto-created on FastAPI startup via `Base.metadata.create_all()`

#### 3. SendGrid Email Service (`app/services/email_service.py`)
- `EmailService` class — single point of contact for all email sending in the codebase
- Jinja2 template rendering — HTML templates loaded from `app/templates/emails/`
- `send_registration_confirmation()` — confirmation email on participant registration
- `send_team_assignment()` — team notification with member list and LLM rationale block
- `_send_email()` — core SendGrid API call, all other methods funnel through here
- **Dev mode fallback** — if `SENDGRID_API_KEY` is blank, emails are logged to console instead of sending. App never crashes due to missing key.
- `validate_sendgrid_connection()` — startup validator to catch misconfigured keys early

#### 4. HTML Email Templates (`app/templates/emails/`)

**`registration.html`** — Registration confirmation email:
- EventOS branded header with purple gradient
- Personalised greeting with participant name
- 3-step "what happens next" timeline card
- Support email contact footer
- Fully inline CSS (required for Gmail compatibility)

**`team_assignment.html`** — Team assignment notification:
- Green gradient header (visually distinct from registration)
- Team name hero display
- Dynamic member list rendered via Jinja2 `{% for %}` loop — scales to any team size
- Conditional LLM rationale block — only renders if rationale string is non-empty
- Member avatar initials auto-generated from first character of name

Both templates use Jinja2 `{{ variable }}` interpolation and `autoescape=True` to prevent XSS from user-supplied data.

#### 5. Email Pydantic Schemas (`app/schemas/email_schemas.py`)
- `EmailSendRequest` — single manual email trigger (admin use)
- `BulkEmailRequest` — batch email trigger routed to Celery
- `EmailSendResult` — structured response with `success`, `message_id`, `error`, `dev` flag

#### 6. Real Celery Email Tasks (`app/tasks/communications.py`)
Upgraded from Day 1 stub to production-ready async tasks:

- `EmailTask` base class — shared `on_failure`, `on_retry`, `on_success` hooks for all email tasks
- `send_registration_email` task:
  - `max_retries=3`, `default_retry_delay=60s`
  - Exponential backoff on retry: `60 × (attempt + 1)` seconds
  - Raises `self.retry(exc=exc)` on SendGrid failure — re-queues to Redis automatically
- `send_batch_emails` task:
  - Iterates recipient list, calls correct template per `template` param
  - Returns `{sent, failed, errors[]}` — partial failure is tracked, not swallowed
  - `max_retries=2` on the overall batch task

#### 7. CSP Math Model Skeleton (`app/services/csp_solver.py`)
Mathematical foundation for the team formation algorithm. Day 3 adds the recursive backtracking search on top of this.

**Data structures:**
- `ParticipantNode` — solver's internal representation of a participant. Decoupled from SQLAlchemy. Exposes `skill_array` as `np.ndarray` for math operations.
- `TeamSlot` — represents a team being assembled. Tracks members, exposes `institution_set()` and `average_skill_vector()`.
- `CSPFormulation` — complete problem definition: participants, `num_teams`, `k_min`, `k_max`, `max_per_institution`. Validates feasibility in `__post_init__`.

**Constraint checkers (`ConstraintChecker`):**
- `check_size_limit()` — team must not exceed `k_max`
- `check_institutional_diversity()` — max N members from same institution per team
- `check_all_constraints()` — runs all checks, returns `(bool, reason_string)` for solver decision logging

**Objective function (`ObjectiveFunction`):**
Implements the minimisation formula from the project specification:

```
min Σ_j Σ_d ( Σ_i x_{i,j} · S_{i,d} − μ_d )²
```

- `compute_target_averages()` — calculates ideal per-skill average across balanced teams (μ_d)
- `skill_variance_score()` — squared distance of each team's average from target, summed across all skill dimensions. Lower = more balanced.
- `evaluate_assignment()` — full evaluation report: variance score, team sizes, per-team skill averages, quality label (`excellent / good / fair`)

**Solver (`CSPTeamSolver`):**
- Day 2 implementation uses a greedy heuristic: places the most skill-specialised participants first, picks the team where adding them most reduces variance
- Fallback: if all constraints block placement, relaxes institutional diversity and places in the smallest team with a logged warning
- Interface is stable — Day 3 replaces only the `_greedy_place` method with recursive backtracking, nothing else changes

### Files Created / Updated (Day 2)

```
EventOS/
└── backend/
    ├── requirements.txt                      ← UPDATED (sendgrid, jinja2 added)
    └── app/
        ├── main.py                           ← UPDATED (imports models, table creation)
        ├── core/
        │   └── database.py                   ← NEW
        ├── models/
        │   └── participant.py                ← NEW (Participant + Team tables)
        ├── schemas/
        │   └── email_schemas.py              ← NEW
        ├── services/
        │   ├── email_service.py              ← NEW
        │   └── csp_solver.py                 ← NEW
        ├── tasks/
        │   └── communications.py             ← UPDATED (stub → real tasks)
        └── templates/
            └── emails/
                ├── registration.html         ← NEW
                └── team_assignment.html      ← NEW
```

### What Other Roles Get From Day 2

| Role | What you can do now |
|---|---|
| **FE** | `Team` model exists — you can build team assignment UI. Email templates show exactly what participants will see. |
| **FS** | `get_db()` dependency ready to inject into your route handlers. `Participant` and `Team` models ready for CRUD endpoints. Import `send_registration_email.delay()` to trigger emails from your routes. |
| **AI/ML** | `CSPFormulation`, `ParticipantNode`, `ConstraintChecker`, `ObjectiveFunction` all ready. Day 3 you only need to implement the backtracking search inside `CSPTeamSolver`. |

### ⚠️ Pending Verification (SendGrid)

SendGrid is fully integrated and configured. End-to-end email delivery needs to be verified once the `SENDGRID_API_KEY` is confirmed in `.env` and the sender email is authenticated in the SendGrid dashboard.

Until then, the service runs in **dev mode** — emails are logged to the Celery worker console instead of being sent. No crashes, no blocking issues for other roles.

**To verify SendGrid when ready:**
```bash
# Check the celery worker logs after triggering an email task
docker compose logs celery_worker --follow

# Look for either:
# [DEV MODE] Would send email to ...   ← key not configured
# ✅ Email task ... succeeded           ← SendGrid working
```

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
│       ├── components/             # Reusable UI elements
│       ├── pages/                  # Dashboard, Participant, Judge views
│       └── openapi-client/         # Auto-generated — DO NOT hand-edit
│
└── backend/                        # Backend territory
    ├── Dockerfile
    ├── requirements.txt
    ├── .env.example                 # Template — copy to .env, never commit .env
    ├── alembic/                     # DB migrations (FS responsibility)
    │   └── versions/
    └── app/
        ├── main.py                  # FastAPI entry point
        ├── api/                     # Route handlers (FS)
        ├── models/
        │   └── participant.py       # Participant + Team tables ✅ Day 2
        ├── schemas/
        │   ├── participant.py       # Participant schemas ✅ Day 1
        │   └── email_schemas.py     # Email schemas ✅ Day 2
        ├── services/
        │   ├── email_service.py     # SendGrid service ✅ Day 2
        │   └── csp_solver.py        # CSP math model ✅ Day 2
        ├── core/
        │   ├── celery_app.py        # Celery config ✅ Day 1
        │   └── database.py          # DB engine + session ✅ Day 2
        ├── tasks/
        │   ├── communications.py    # Email tasks ✅ Day 2
        │   └── solver.py            # Solver tasks ✅ Day 1 stub
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

For local development, the defaults work for Postgres and Redis. Fill in `SENDGRID_API_KEY` when verifying email, and `GEMINI_API_KEY` on Day 5.

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
| `eventos_redis` | Redis 7 broker + pub/sub | `6379` |
| `eventos_backend` | FastAPI API server | `8000` |
| `eventos_celery_worker` | Background task processor | — |
| `eventos_celery_beat` | Periodic scheduler | — |

> First build takes ~2–3 minutes. Subsequent starts are fast.

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

### Stop and wipe database (full reset)

```bash
docker compose down -v
```

---

## Verifying Everything Works

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

**Swagger UI**

Open `http://localhost:8000/docs` in your browser.

**Database tables created**
```bash
docker compose exec postgres psql -U eventflow -d eventflow_db -c "\dt"
# → participants, teams (created automatically on startup)
```

**Celery queues active**
```bash
docker compose logs celery_worker | grep -E "queues|ready|connected"
# → consuming from: notifications, algorithms, default
```

**Redis responding**
```bash
docker compose exec redis redis-cli ping
# → PONG
```

**SendGrid dev mode (before API key is set)**
```bash
docker compose logs celery_worker | grep "DEV MODE"
# → [DEV MODE] Would send email to ...
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
# Sender email must be verified under Settings → Sender Authentication
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=your-verified-sender@gmail.com
SENDGRID_FROM_NAME=EventOS WiSE@TI

# ── AI / LLM (Day 5) ─────────────────────────────────────────────────
# Free key at https://aistudio.google.com
GEMINI_API_KEY=
```

> **Never commit `.env` to git.** It is in `.gitignore`. Share values with teammates over a private channel only.

---

## Git Workflow

### Branch naming

```
feature/<role>-<short-description>

Examples:
  feature/fsai-day1-scaffold
  feature/fsai-day2-db-email-csp
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
git checkout -b feature/fsai-day2-db-email-csp

# Commit with clear messages
git add .
git commit -m "feat(db): add SQLAlchemy models for Participant and Team"
git commit -m "feat(email): add SendGrid service and Jinja2 templates"
git commit -m "feat(csp): add CSP math model, constraints and objective function"

# Push and open PR → develop
git push origin feature/fsai-day2-db-email-csp
```

### Branch rules

| Branch | Purpose |
|---|---|
| `main` | Production-ready, tagged releases only — never push directly |
| `develop` | Integration — all feature PRs target here |
| `feature/*` | Individual task branches, merged via PR after peer review |

### Auto-generating the frontend API client

After any backend schema change:

```bash
OPENAPI_OUTPUT_FILE=openapi.json python -m app.commands.generate_schema
npx openapi-ts --input ./openapi.json --output ./frontend/src/openapi-client
```

> Never hand-edit `frontend/src/openapi-client/` — always overwritten on next generation.

---

## Day-by-Day Roadmap

| Day | FS+AI Tasks | Status |
|---|---|---|
| **Day 1** | Docker Compose · Celery framework · Named queues · Participant schemas · Task stubs | ✅ Done |
| **Day 2** | DB engine + session · SQLAlchemy models · SendGrid service · HTML email templates · Real Celery email tasks · CSP math model skeleton | ✅ Done |
| **Day 3** | CSP recursive backtracking solver · Redis task status tracker | 🔄 Next |
| **Day 4** | Team solver API endpoints · Manual approval endpoints | ⏳ Upcoming |
| **Day 5** | JWT secure link generator · Auth middleware · Celery task handlers for signed links | ⏳ Upcoming |
| **Day 6** | Score consolidation tasks · Daily notification scheduler | ⏳ Upcoming |
| **Day 7** | LLM drafting engine integration · Milestone email automation | ⏳ Upcoming |
| **Day 8** | System-wide load tests · Email delivery pipeline verification | ⏳ Upcoming |

---

## Troubleshooting

### `docker: command not found` in WSL2
Docker Desktop is not running or WSL integration is off.
Open Docker Desktop → Settings → Resources → WSL Integration → enable your distro → Apply & Restart.

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

### Database tables not created on startup
Confirm all model files are imported in `main.py` before `create_all`:
```python
from app.models import participant  # required before this line
Base.metadata.create_all(bind=engine)
```

### New package not found after adding to `requirements.txt`
```bash
docker compose down
docker compose up --build
```

### Celery worker shows `No module named 'app'`
Always run Celery via `docker compose` — never directly on the host. The `WORKDIR /app` in the Dockerfile is what makes `app.*` imports resolve.

### SendGrid not sending emails
1. Confirm `SENDGRID_API_KEY` in `.env` starts with `SG.`
2. Confirm sender email is verified in SendGrid → Settings → Sender Authentication
3. Check Celery logs: `docker compose logs celery_worker`
4. If the key is blank, app runs in dev mode — emails log to console, no errors thrown

### SQLAlchemy `QueuePool limit exceeded` error
This means too many concurrent DB connections. The pool is set to `size=10, max_overflow=20`. If this fires in development, reduce the number of Celery worker concurrency:
```bash
# In docker-compose.yml, change the celery_worker command to:
command: celery -A app.core.celery_app worker --loglevel=info --concurrency=2
```

---

*EventOS — Built for WiSE@TI Hackathon, Texas Instruments India*
*FS+AI Role — Days 1 & 2 by [Your Name]*
