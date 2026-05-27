# Mentor Operations Layer — System Report

## Overview

The Mentor Operations Layer is a comprehensive extension of the EventOS platform enabling:
- Full mentor lifecycle management (CRUD, assignment, deactivation)
- Secure magic-link portal access for mentors
- Meeting scheduling and session management
- Multi-dimensional feedback (team-level + individual)
- Automated risk scoring with 4-tier classification
- AI-driven skill-gap assignment suggestions
- AI-generated committee summaries
- Daily automated reminder dispatch
- Participant-safe data exposure (only `visible_to_participant=true` feedback shown)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                       │
├──────────────┬────────────────┬────────────────┬─────────────────────┤
│ Admin Dashboard              │ Mentor Portal  │ Participant Portal  │
│ (Mentor Ops Tab)             │ /mentor?token= │ /portal?token=      │
├──────────────┴────────────────┴────────────────┴─────────────────────┤
│                     Frontend API Client (mentorApi)                   │
├──────────────────────────────────────────────────────────────────────┤
│                     Axios Interceptor (JWT injection)                │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                     FastAPI (mentor_routes.py)                        │
│  /mentors, /mentor-assignments, /mentor-ops/*, /mentor-portal/*      │
├──────────────────────────────────────────────────────────────────────┤
│  Services: mentor_service.py │ mentor_ops_service.py │ link_service  │
├──────────────────────────────────────────────────────────────────────┤
│  Models: Mentor │ MentorAssignment │ MentorSession │ MentorFeedback │
├──────────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Alembic migration: a2b3c4d5e6f7)                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

| Table | Purpose | Key Fields |
|---|---|---|
| `mentors` | Mentor profiles | first_name, last_name, email, expertise_areas (JSONB), organization |
| `mentor_assignments` | Links mentors ↔ teams | mentor_id (FK), team_id (FK), is_active, stage |
| `mentor_sessions` | Scheduled meetings | title, meeting_url, scheduled_at, status, notes |
| `mentor_feedback` | Progress tracking | progress/collaboration/execution/clarity scores, feedback_text, action_items (JSONB), visible_to_participant |

---

## API Endpoints

### Admin Mentor Management
| Method | Path | Purpose |
|---|---|---|
| GET | `/mentors` | List all mentors |
| POST | `/mentors` | Create mentor |
| PATCH | `/mentors/{id}` | Update mentor |
| DELETE | `/mentors/{id}` | Deactivate mentor |
| POST | `/mentors/{id}/send-access-link` | Send magic link email |

### Assignments
| Method | Path | Purpose |
|---|---|---|
| GET | `/mentor-assignments` | List active assignments |
| POST | `/mentor-assignments` | Assign mentor → team |
| DELETE | `/mentor-assignments/{id}` | Unassign mentor |

### Mentor Portal (JWT-auth)
| Method | Path | Purpose |
|---|---|---|
| GET | `/mentor-portal/me` | Mentor profile + stats |
| GET | `/mentor-portal/teams` | Assigned teams with members |
| POST | `/mentor-portal/sessions` | Schedule meeting |
| PATCH | `/mentor-portal/sessions/{id}` | Update meeting |
| POST | `/mentor-portal/feedback` | Submit daily/individual feedback |
| GET | `/mentor-portal/feedback/team/{id}` | Team feedback history |

### Operations Dashboard
| Method | Path | Purpose |
|---|---|---|
| GET | `/mentor-ops/summary` | Ops metrics summary |
| GET | `/mentor-ops/risk-teams` | Risk scores for all teams |
| GET | `/mentor-ops/assignment-suggestions` | AI skill-gap suggestions |
| GET | `/mentor-ops/teams-without-mentor` | Unmentored teams |
| GET | `/mentor-ops/missing-daily-updates` | Teams missing feedback |
| POST | `/mentor-ops/reminders/daily` | Send daily reminders |
| POST | `/mentor-ops/ai-summary` | Generate AI summary |

### Participant Data
| Method | Path | Purpose |
|---|---|---|
| GET | `/participant-mentor-info` | Safe mentor data for participant |

---

## Risk Scoring Formula

| Condition | Points | Max Score: 100 |
|---|---|---|
| No active mentor | +35 | |
| No upcoming meeting | +20 | |
| No team-level feedback in 24h | +25 | |
| Progress score < 5 | +15 | |
| Collaboration score < 5 | +10 | |
| Active blockers | +10 | |

**Tiers:** low (0-29) → medium (30-59) → high (60-79) → critical (80-100)

---

## Security Model

- **Mentors access their portal** via JWT magic links (same pattern as participants/evaluators)
- **Token structure:** `{sub: mentor_id, role: "mentor", stage: "mentoring"}`
- **Participants see only** feedback where `visible_to_participant = true`
- **Private feedback** (individual reviews, blockers, scores) is visible only to mentors and admins
- **Admin controls everything** — no automatic assignments or risk-driven changes

---

## Frontend Views

### 1. Mentor Portal (`/mentor?token=...`)
- Stats dashboard (assigned teams, meetings, pending updates, today's updates)
- Expandable team cards with member details + skill vectors
- Meeting scheduler form
- Daily progress form with 4 score dimensions
- Individual feedback form with participant selector

### 2. Admin Dashboard → Mentor Ops Tab
- Ops summary cards (active mentors, assignments, at-risk teams)
- Mentor CRUD with send-link buttons
- Assignment manager (assign/unassign with dropdown selectors)
- AI skill-gap suggestions with match scores
- Risk score table (sortable, colour-coded)
- Daily reminder dispatch button
- AI summary generator (select team → generate → view)

### 3. Participant Portal (enhanced)
- Mentor info card (name, organization, expertise)
- Next meeting card with join link
- Visible feedback history
- Action items list

---

## Commit History

```
f65f4f9 feat: add Mentor Ops tab to Admin Dashboard, update tests
f85e195 feat: integrate mentor data into participant portal
b4a6220 feat: build mentor portal workflow
b4a14ed feat: add mentor frontend API client
1cb448b feat: add mentor portal and operations APIs with AI summary
08f0ce2 feat: add mentor magic links and email delivery
d1d1a80 feat: add mentor service layer and risk scoring
e218190 feat: add mentor operations schemas
e4d3456 feat: add mentor operations data models
```

---

## Files Modified/Created

### New Files
- `backend/app/models/mentor.py` — 4 SQLAlchemy models
- `backend/app/schemas/mentor_schemas.py` — 20+ Pydantic schemas
- `backend/app/services/mentor_service.py` — Core CRUD & portal service
- `backend/app/services/mentor_ops_service.py` — Risk, suggestions, reminders
- `backend/app/api/mentor_routes.py` — 25+ API endpoints
- `backend/alembic/versions/a2b3c4d5e6f7_add_mentor_operations.py` — Migration
- `frontend_new/src/views/MentorPortal.jsx` — Full mentor portal UI

### Modified Files
- `backend/app/models/__init__.py` — Model registration
- `backend/app/main.py` — Router registration
- `backend/app/core/security.py` — Added MENTOR token role
- `backend/app/services/link_service.py` — Mentor magic link generation
- `backend/app/services/ai_service.py` — Mentor summary prompt/method
- `backend/alembic/env.py` — Model import for autogenerate
- `backend/tests/conftest.py` — Mentor model registration in test DB
- `frontend_new/src/services/api.js` — mentorApi module + interceptor update
- `frontend_new/src/main.jsx` — /mentor route registration
- `frontend_new/src/context/AuthContext.jsx` — Mentor portal role
- `frontend_new/src/views/AdminDashboard.jsx` — Mentor Ops tab
- `frontend_new/src/views/ParticipantPortal.jsx` — Mentor info display
- `.gitignore` — celerybeat-schedule, *.db exclusions

---

## Deployment Checklist

1. Run Alembic migration: `alembic upgrade head`
2. Verify SendGrid is configured (reuses existing `EMAIL_MODE`)
3. Create mentors via Admin Dashboard → Mentor Ops → Add Mentor
4. Assign mentors to approved teams
5. Send magic links → mentors receive portal access emails
6. Mentors schedule meetings and submit daily updates
7. Admin monitors risk scores and generates AI summaries
