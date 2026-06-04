# EventOS — Intelligent Event Orchestration System
### WiSE@TI Hackathon · Texas Instruments India

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io)
[![Celery](https://img.shields.io/badge/Celery-5.4-green)](https://celeryq.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue)](https://docker.com)

---

## Overview

EventOS is a **production-grade, distributed event orchestration platform** built for managing the complete operational lifecycle of large-scale competitive engineering events — from participant intake through team formation, secure evaluation routing, anomaly-protected grading, and live leaderboard publication.

The platform replaces fragmented manual workflows (spreadsheets, email chains, manual judgement) with a deterministic, AI-assisted automation engine governed by strict **human-in-the-loop approval gates**. No action with real-world consequences executes without admin confirmation.

### Core Design Philosophy

> **Deterministic execution over autonomous AI.** The LLM drafts, suggests, and explains. Humans decide and approve. The system executes.

---

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│                     Client Layer                                  │
│         React SPA (Vite · Zustand · React Query · Tailwind)      │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTPS / JWT
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                             │
│         FastAPI · Pydantic v2 · SQLAlchemy 2.0                   │
│  /participants  /solver  /approvals  /portal  /evaluations        │
│  /leaderboard   /ai     /tasks      /health                     │
└──────┬───────────────────────────┬───────────────────────────────┘
       │ SQLAlchemy ORM            │ Redis Enqueue
       ▼                           ▼
┌─────────────┐          ┌─────────────────────────────────────────┐
│ PostgreSQL  │          │              Redis 7                     │
│     16      │          │   Celery Broker · Task Result Backend    │
│             │          │   Status Tracker · Pub/Sub              │
│ participants│          └──────────────────┬──────────────────────┘
│ teams       │                             │ Task Dispatch
│ evaluators  │                             ▼
│ evaluations │          ┌─────────────────────────────────────────┐
└─────────────┘          │           Celery Worker Pool             │
       ▲                 │  Queue: notifications · algorithms       │
       │ Write           │                                         │
       └─────────────────┤  Tasks:                                 │
                         │  · run_team_formation (CSP Backtracking) │
                         │  · send_batch_emails (SendGrid)          │
                         │  · send_access_links (JWT Dispatch)      │
                         │  · consolidate_scores (Aggregation)      │
                         │  · run_anomaly_sweep (Detection)         │
                         └────────────────────────────────────────┘
                                        ▲
                         ┌──────────────┴──────────────────────────┐
                         │          Celery Beat Daemon              │
                         │  · Hourly score consolidation           │
                         │  · 30-min anomaly sweep                 │
                         │  · Daily evaluation reminders @ 09:00   │
                         └─────────────────────────────────────────┘
```

---

## Technical Stack

| Layer | Technology | Version | Role |
|---|---|---|---|
| **API Framework** | FastAPI | 0.111 | Async HTTP gateway, OpenAPI generation |
| **Data Validation** | Pydantic | v2.7 | Request/response schemas, field-level validation |
| **ORM** | SQLAlchemy | 2.0 | Async-compatible DB access, relationship management |
| **Database** | PostgreSQL | 16 | Primary persistence, JSONB skill vectors, audit trail |
| **Migrations** | Alembic | 1.13 | Versioned schema migrations |
| **Task Queue** | Celery | 5.4 | Distributed async worker pool |
| **Scheduler** | Celery Beat | 5.4 | Cron-like periodic task dispatcher |
| **Message Broker** | Redis | 7 | Celery broker + result backend + status cache |
| **Email** | SendGrid | 6.11 | Transactional email delivery |
| **Templates** | Jinja2 | 3.1 | HTML email rendering |
| **Auth** | python-jose | 3.3 | HMAC-SHA256 JWT generation and validation |
| **AI / LLM** | Google Gemini | 1.5-flash | Email drafting, team rationale, config generation |
| **LLM Framework** | LangChain | 0.2 | LLM chain orchestration |
| **Math / ML** | NumPy | 1.26 | Anomaly detection (weighted Euclidean distance) |
| **Solver** | Custom CSP | — | Backtracking + MRV/LCV/FC heuristics |
| **Runtime** | Python | 3.11 | — |
| **Containerisation** | Docker Compose | v2 | Multi-service orchestration |

---

## Repository Structure

```
EventOS/
├── docker-compose.yml              # Service definitions (5 containers)
├── .gitignore
├── README.md
│
├── frontend/                       # React SPA (separate development)
│   └── src/
│       ├── components/
│       ├── pages/
│       └── openapi-client/         # Auto-generated — never hand-edit
│
└── backend/
    ├── Dockerfile                  # Python 3.11-slim image
    ├── requirements.txt            # Pinned dependencies
    ├── alembic.ini                 # Migration configuration
    ├── .env.example                # Environment variable template
    │
    ├── alembic/
    │   ├── env.py                  # Migration environment (imports all models)
    │   └── versions/               # Versioned migration files
    │
    ├── scripts/
    │   └── healthcheck_all.sh      # Full system verification script
    │
    └── app/
        ├── main.py                 # FastAPI application + router registration
        │
        ├── core/
        │   ├── celery_app.py       # Celery config, named queues, beat schedule
        │   ├── database.py         # SQLAlchemy engine, session factory, Base
        │   ├── redis_client.py     # Connection pool singleton
        │   └── security.py         # JWT creation and validation
        │
        ├── models/
        │   ├── participant.py      # Participant + Team tables
        │   └── evaluation.py       # Evaluator + Evaluation tables
        │
        ├── schemas/
        │   ├── participant.py              # Solver input shapes + MOCK_ROSTER
        │   ├── participant_crud_schemas.py # CRUD, CSV upload, pagination
        │   ├── solver_schemas.py           # Solver request/response
        │   ├── approval_schemas.py         # Approval decision shapes
        │   ├── auth_schemas.py             # JWT payload shapes
        │   ├── portal_schemas.py           # Participant + evaluator portal views
        │   ├── evaluation_schemas.py       # Score submission shapes
        │   └── llm_schemas.py              # LLM draft request/response
        │
        ├── services/
        │   ├── participant_service.py  # CRUD, CSV parsing, roster summary
        │   ├── approval_service.py     # Team approval business logic
        │   ├── link_service.py         # JWT link generation + portal resolution
        │   ├── csp_solver.py           # Backtracking CSP solver + heuristics
        │   ├── score_service.py        # Score submission + anomaly detection
        │   ├── email_service.py        # SendGrid integration + dev mode
        │   └── llm_service.py          # Gemini drafting engine + fallbacks
        │
        ├── api/
        │   ├── participant_routes.py   # /participants — CRUD + CSV upload
        │   ├── solver_routes.py        # /solver — run + status + drafts
        │   ├── approval_routes.py      # /approvals — approve/reject teams
        │   ├── portal_routes.py        # /portal — JWT access + link dispatch
        │   ├── evaluation_routes.py    # /evaluations — score submission + flags
        │   ├── leaderboard_routes.py   # /leaderboard — rankings + anomaly overrides
        │   └── ai_routes.py           # /ai — draft generation + rationales
        │
        ├── tasks/
        │   ├── communications.py   # Email Celery tasks (registration, batch, links)
        │   ├── solver.py           # Team formation Celery task + tracker
        │   └── scheduler.py        # Celery Beat periodic tasks
        │
        └── templates/
            └── emails/
                ├── registration.html       # Participant registration confirmation
                └── team_assignment.html    # Team assignment notification
```

---

## API Endpoint Directory

### System
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health + Redis connectivity |
| `GET` | `/ready` | Readiness probe |
| `GET` | `/docs` | Swagger interactive API documentation |
| `GET` | `/tasks/{task_id}/status` | Live task progress from Redis |

### Participants
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/participants` | Paginated list with filtering and search |
| `POST` | `/participants` | Register a single participant |
| `GET` | `/participants/roster/summary` | Dashboard stats (counts, skill averages, institutions) |
| `GET` | `/participants/csv-template` | Download blank CSV template |
| `POST` | `/participants/upload` | Bulk CSV roster import |
| `GET` | `/participants/{id}` | Single participant detail |
| `PATCH` | `/participants/{id}` | Partial update |
| `DELETE` | `/participants/{id}` | Remove from roster |

### Team Formation Solver
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/solver/run` | Enqueue CSP solver task → returns `task_id` |
| `GET` | `/solver/status/{task_id}` | Solver task progress |
| `GET` | `/solver/drafts/{task_id}` | Draft lineups from completed run |

### Approvals
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/approvals/pending` | Teams awaiting admin decision |
| `GET` | `/approvals/teams` | All teams with approval status |
| `GET` | `/approvals/teams/{id}` | Full team detail with members |
| `POST` | `/approvals/{id}/decision` | Approve or reject one team |
| `POST` | `/approvals/bulk-decision` | Approve or reject all pending teams |

### Portal (JWT Magic Links)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/portal/access` | Resolve JWT token → personalised portal view |
| `POST` | `/portal/generate-links` | Generate + dispatch access links to all participants/evaluators |

### Evaluations
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/evaluations` | Submit scorecard (JWT-authenticated, anomaly check runs) |
| `PATCH` | `/evaluations/{id}` | Update existing scorecard |
| `GET` | `/evaluations/team/{team_id}` | All scorecards for a team |
| `GET` | `/evaluations/flagged` | Anomaly-flagged scorecards |
| `POST` | `/evaluations/flags/{id}/clear` | Admin clears a flag |
| `GET` | `/evaluations/leaderboard` | Consolidated score leaderboard |

### Leaderboard & Anomaly Management
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/leaderboard` | Ranked leaderboard (unflagged teams only) |
| `GET` | `/leaderboard/anomalies` | All flagged scorecards pending review |
| `POST` | `/leaderboard/anomalies/{id}/override` | Admin overrides a single flag |
| `POST` | `/leaderboard/anomalies/override-all` | Bulk clear all flags |

### LLM Drafting Engine
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ai/draft` | Generate single email draft (never auto-sent) |
| `POST` | `/ai/draft/bulk` | Generate drafts for multiple recipients |
| `POST` | `/ai/team-rationale` | Generate + save team formation rationale |
| `POST` | `/ai/team-rationale/bulk` | Generate rationales for all teams |
| `GET` | `/ai/health` | LLM API connectivity check |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before running.

```env
# ── Database ──────────────────────────────────────────────────────────────────
POSTGRES_USER=eventflow
POSTGRES_PASSWORD=eventflow_secret            # Change in production
POSTGRES_DB=eventflow_db
DATABASE_URL=postgresql://eventflow:eventflow_secret@postgres:5432/eventflow_db

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── Application Security ──────────────────────────────────────────────────────
# Generate a strong key: python3 -c "import secrets; print(secrets.token_hex(64))"
SECRET_KEY=your-64-char-hex-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080             # 7 days

# Public-facing base URL — used in generated portal links
BASE_URL=http://localhost:8000                # Change to your domain in production

# ── Email / SendGrid ──────────────────────────────────────────────────────────
# Free tier: 100 emails/day — https://sendgrid.com
# Sender must be verified: SendGrid → Settings → Sender Authentication
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx  # Leave blank for dev mode (logs to console)
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=EventOS WiSE@TI

# ── AI / LLM ─────────────────────────────────────────────────────────────────
# Free key: https://aistudio.google.com — Leave blank to use fallback templates
GEMINI_API_KEY=your-gemini-api-key
LLM_MODEL=gemini-1.5-flash
LLM_MAX_TOKENS=1000
LLM_TEMPERATURE=0.7

# ── Environment ───────────────────────────────────────────────────────────────
ENVIRONMENT=development                       # Set to "production" to disable debug endpoints
DEBUG=true
```

> **Security rule:** Never commit `.env` to git. It is in `.gitignore`. Use a password manager or encrypted channel to share credentials with teammates.

---

## Prerequisites

| Tool | Required Version | Install Guide |
|---|---|---|
| Docker Desktop | 20+ | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| Docker Compose | v2 (no hyphen) | Bundled with Docker Desktop |
| Git | Any recent | [git-scm.com](https://git-scm.com) |

> **Windows (WSL2):** Docker Desktop must be running on Windows with WSL Integration enabled for your Ubuntu distro.
> Docker Desktop → Settings → Resources → WSL Integration → enable your distro → Apply & Restart

---

## Deployment — Step by Step

### 1. Clone

```bash
git clone https://github.com/samikshadeore42/EventOS
cd EventOS
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
nano backend/.env   # fill in your values
```

### 3. Build and start all services

```bash
docker compose up --build -d
```

This starts five containers:

| Container | Role | Port |
|---|---|---|
| `eventos_postgres` | PostgreSQL 16 database | `5432` |
| `eventos_redis` | Redis 7 — broker + task tracker | `6379` |
| `eventos_backend` | FastAPI API server | `8000` |
| `eventos_celery_worker` | Background task processor | — |
| `eventos_celery_beat` | Periodic task scheduler | — |

> First build takes 2–3 minutes. Subsequent starts are fast.

### 4. Run database migrations

```bash
docker compose exec backend alembic upgrade head
```

You should see:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 001, initial schema
INFO  [alembic.runtime.migration] Running upgrade  001 -> 002, add composite indexes
```

### 5. Verify the system is healthy

```bash
# API health check
curl http://localhost:8000/health
# → {"status":"ok","service":"eventos-api","redis":true}

# Run full system health script
bash backend/scripts/healthcheck_all.sh
# → All 14 checks should show ✅
```

### 6. Open interactive API documentation

Navigate to: `http://localhost:8000/docs`

---

## Common Operations

### Import a participant roster

```bash
# Download the template
curl -o roster.csv http://localhost:8000/participants/csv-template

# Fill in the CSV, then upload
curl -X POST "http://localhost:8000/participants/upload?upsert=false" \
  -F "file=@roster.csv"
```

### Run the team formation solver

```bash
# Trigger solver
curl -X POST http://localhost:8000/solver/run \
  -H "Content-Type: application/json" \
  -d '{"config":{"num_teams":5,"target_size":4,"k_min":3,"k_max":5}}'

# → {"task_id": "abc-123", "status_url": "/tasks/abc-123/status"}

# Poll until status = "success"
curl http://localhost:8000/tasks/abc-123/status

# Fetch draft lineups
curl http://localhost:8000/solver/drafts/abc-123
```

### Approve teams and dispatch notifications

```bash
# Approve all pending teams at once
curl -X POST http://localhost:8000/approvals/bulk-decision \
  -H "Content-Type: application/json" \
  -d '{"decision":"approve"}'

# Dispatch portal access links to all participants
curl -X POST "http://localhost:8000/portal/generate-links?role=participant&stage=evaluation&send_emails=true"
```

### Generate LLM email draft

```bash
curl -X POST http://localhost:8000/ai/draft \
  -H "Content-Type: application/json" \
  -d '{
    "draft_type": "progression_invite",
    "context": {
      "participant_name": "Priya Sharma",
      "team_name": "Team Alpha",
      "next_stage": "Grand Finale — Bangalore",
      "event_name": "WiSE@TI Hackathon"
    },
    "tone": "professional",
    "max_words": 200
  }'
```

---

## Running Tests

### Integration tests

```bash
docker compose exec backend pytest tests/test_integration.py -v
```

### Load tests (Locust)

```bash
# Install Locust locally
pip install locust

# Run against local stack (20 concurrent users, 2 minutes)
locust -f backend/tests/test_load.py \
       --host=http://localhost:8000 \
       --users=20 --spawn-rate=5 \
       --run-time=2m --headless
```

---

## Stopping and Resetting

```bash
# Stop all services
docker compose down

# Stop and wipe all data (full reset)
docker compose down -v

# Rebuild from scratch
docker compose down -v && docker compose up --build
docker compose exec backend alembic upgrade head
```

### Reset Admin Login

To reset demo admin login:

```bash
docker compose exec backend alembic upgrade head
docker compose exec -e ADMIN_PASSWORD="<set-a-local-password>" backend python bootstrap_admin.py
```

---

## Generating Frontend API Client

After any backend schema change, regenerate the frontend client bindings:

```bash
OPENAPI_OUTPUT_FILE=openapi.json python -m app.commands.generate_schema
npx openapi-ts --input ./openapi.json --output ./frontend/src/openapi-client
```

> Never hand-edit anything inside `frontend/src/openapi-client/`.

---

## Git Workflow

### Branch naming

```
feature/<role>-<description>

feature/fsai-day1-scaffold
feature/fsai-day3-solver-tracker
feature/fs-participant-crud
feature/fe-dashboard-layout
```

### Daily workflow

```bash
git checkout develop && git pull origin develop
git checkout -b feature/fsai-day8-db-optimisation
git add . && git commit -m "feat(db): add composite indexes for leaderboard queries"
git push origin feature/fsai-day8-db-optimisation
# Open PR → develop
```

### Branch rules

| Branch | Rule |
|---|---|
| `main` | Production-ready tagged releases — never push directly |
| `develop` | Integration target — all PRs merge here |
| `feature/*` | Daily work branches — merged via PR after peer review |

---

## Known Limitations (Pre-Production)

| Limitation | Impact | Mitigation Path |
|---|---|---|
| Single Redis node (broker + tracker) | Bottleneck under extreme load | Partition into separate clusters |
| `docker-compose` worker provisioning | No autoscaling | Migrate to Kubernetes + KEDA |
| Audit logs in PostgreSQL | Performance degrades at scale | Migrate to ClickHouse or Elasticsearch |
| No distributed tracing | Hard to debug cross-service failures | Add OpenTelemetry + Datadog |
| LLM fallback templates only | No AI when Gemini key missing | Expected behaviour for hackathon scope |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker: command not found` in WSL2 | Docker Desktop not running or WSL integration off | Enable in Docker Desktop → Settings → WSL Integration |
| `port 5432 already in use` | Local Postgres running | `sudo service postgresql stop` |
| `port 8000 already in use` | Another process | `lsof -ti:8000 \| xargs kill -9` |
| Celery `No module named 'app'` | Running Celery outside Docker | Always use `docker compose` |
| New package not found | Added to `requirements.txt` but image not rebuilt | `docker compose down && docker compose up --build` |
| `GET /tasks/{id}/status` returns 404 | 2-hour Redis TTL expired, or wrong ID | Re-trigger the task |
| Solver returns `"algorithm": "greedy_fallback"` | 10s time limit hit | Normal for large rosters; result is still valid |
| SendGrid not sending | API key missing or sender not verified | Check `.env` and SendGrid → Sender Authentication |
| Alembic `Target database is not up to date` | Migrations not run | `docker compose exec backend alembic upgrade head` |

---

## Celery Beat Schedule Reference

| Task | Schedule | Queue | Purpose |
|---|---|---|---|
| `consolidate_scores` | Every hour on the hour | `algorithms` | Rebuild leaderboard snapshot |
| `run_anomaly_sweep` | Every 30 minutes | `algorithms` | Re-run anomaly detection as new scores arrive |
| `send_daily_evaluation_reminder` | Daily at 09:00 UTC | `notifications` | Email evaluators with incomplete scorecards |

---

*EventOS — Built for WiSE@TI Hackathon, Texas Instruments India*
*Full stack developed by FS+AI role across 8-day sprint*
