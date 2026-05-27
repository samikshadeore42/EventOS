# EventOS - Architectural Audit & System Analysis Report

## 1. Executive Summary

This report presents a comprehensive architectural audit of the **EventOS** platform (also known as EventFlow AI), assessing its system design, production readiness, and operational stability. 

EventOS is an orchestration engine designed for competitive environments (such as the WiSE@TI Hackathon). The system explicitly rejects "autonomous AI" in favor of a **deterministic, human-in-the-loop orchestration architecture**. The core business logic (team formation, score aggregation, anomaly detection) relies on robust constraint satisfaction and statistical models, while AI (LLMs) is strictly relegated to stateless prose generation (drafting emails, rationales, and rubrics).

---

## 2. Technical Stack & Architectural Patterns

### 2.1 Technical Stack
- **Backend Framework:** FastAPI (v0.111), strictly typed with Pydantic v2.
- **Database:** PostgreSQL (accessed via SQLAlchemy 2.0 with async readiness).
- **Asynchronous Task Queue:** Celery 5.4 backed by Redis 7 (used as both message broker and state backend).
- **Frontend:** React 19, React Router DOM, TanStack Query (React Query) for state management, TailwindCSS for styling. Built with Vite.
- **AI Integration:** Google Gemini (via LangChain), isolated in stateless task workers.

### 2.2 Architectural Patterns
- **Asynchronous Event-Driven Flow:** Computationally heavy tasks (Solver, AI generation, Anomaly sweeps, bulk communications) are offloaded to Celery workers.
- **Polling & Task Tracking:** The frontend employs a `POST` (enqueue) → `Poll` (status) → `GET` (result) pattern. This is mediated by `backend/app/services/task_tracker.py` and React Query's `refetchInterval` (e.g., in `frontend_new/src/views/AdminDashboard.jsx`).
- **Deterministic Core + AI Augmentation:** System state is never mutated by the LLM. The LLM only generates supplementary data (e.g., team rationale strings, email drafts) based on deterministic inputs.

---

## 3. Core Services & Workflows

### 3.1 Participant Management & Roster Ingestion
- **Implementation:** `backend/app/services/participant_service.py` & `backend/app/api/participant_routes.py`
- **Features:** Supports CRUD operations and robust bulk CSV uploads. Skill vectors are dynamically stored as `JSONB` in the PostgreSQL `Participant` model (`backend/app/models/participant.py`), allowing flexible skill criteria per event.

### 3.2 Algorithmic Team Formation (CSP Solver)
- **Implementation:** `backend/app/services/csp_solver.py`
- **Mechanism:** Formulates team creation as a Constraint Satisfaction Problem. It uses a recursive backtracking search with **Minimum Remaining Values (MRV)** and **Forward Checking** heuristics. 
- **Resilience:** Includes a time-bound greedy fallback if the exact CSP solver reaches the iteration limit (`MAX_ITERATIONS = 50000`), ensuring the system does not hang indefinitely.

### 3.3 Human-in-the-Loop Approvals
- **Implementation:** `backend/app/api/approval_routes.py` & `frontend_new/src/views/AdminDashboard.jsx` (ApprovalsTab).
- **Mechanism:** The solver produces "Draft" lineups (`backend/app/schemas/solver_schemas.py: DraftTeamOut`). These are committed to a pending queue where committee admins must explicitly approve or reject them. Rejections require notes, fostering an audit trail.

### 3.4 Multi-Method Anomaly Detection
- **Implementation:** `backend/app/services/anomaly_detector.py` & `backend/app/services/score_service.py`
- **Mechanism:** Implements four distinct anomaly detection methods for evaluation scorecards:
  1. **Z-Score Outliers:** Identifies scores significantly diverging from the per-criterion mean.
  2. **Divergence (Weighted Euclidean):** Flags scorecards with large distances from the panel centroid.
  3. **Intra-rater Consistency:** Detects if a judge is uniformly scoring without differentiation.
  4. **Conflict of Interest (COI):** Flags positive bias when a judge evaluates a team containing members from their own institution.

### 3.5 Stateless AI Services
- **Implementation:** `backend/app/services/ai_service.py`
- **Mechanism:** Utilizes LangChain and Google Gemini to generate:
  - Natural language team rationales based on solver output.
  - Evaluation rubrics from structured JSON criteria.
  - Plain English explanations of detected anomalies.
  - Context-aware email drafts.

---

## 4. API Landscape & Data Models

The API is strictly modularized under `backend/app/api/`, mapping directly to the frontend's unified API service (`frontend_new/src/services/api.js`).

### Key Pydantic Schemas (`backend/app/schemas/`):
- **`ParticipantCreateRequest` / `ParticipantResponse`:** Strongly types the `skill_vector` dictionary ensuring values are between `0.0` and `10.0`.
- **`SolverConfig`:** Governs solver constraints (`num_teams`, `target_size`, `k_min`, `k_max`, `max_per_institution`).
- **`AnomalyDetectionConfig`:** Exposes tunable thresholds for the anomaly engine (`z_score_threshold`, `divergence_threshold`, `halo_threshold`, etc.).
- **`ScoreSubmissionRequest`:** Enforces boundary checks on judge submissions.

---

## 5. Security & Authentication

- **Architecture:** The platform eschews traditional user passwords for portals. Instead, it uses **Time-bound Magic Links (JWTs)**.
- **Implementation:**
  - `backend/app/services/link_service.py` generates signed JWTs encoding user roles (`participant`, `evaluator`) and stage bounds.
  - `frontend_new/src/context/AuthContext.jsx` intercepts the `?token=` query parameter, decodes it, verifies expiration, and stores it in `sessionStorage`.
  - API requests are secured via an Axios request interceptor (`frontend_new/src/services/api.js`) that injects the token as a Bearer header.

---

## 6. Performance Risks & Areas for Improvement

### 6.1 Observability & Tracing (Risk: Medium)
- **Current State:** The system uses standard Python logging and Celery's default task states. 
- **Gap:** Missing distributed tracing (e.g., OpenTelemetry, Datadog). Tracing a request from the FastAPI endpoint through Redis into a specific Celery worker's execution path is currently difficult.

### 6.2 Redis Bottlenecks (Risk: Low-Medium)
- **Current State:** A single Redis instance is used for the Celery message broker, Celery result backend, and the custom `TaskTracker`.
- **Gap:** At high scale, this can cause blocking. Best practice dictates partitioning Redis (one for brokering, one for transient state tracking).

### 6.3 Solver Exponential Scaling (Risk: High)
- **Current State:** Backtracking search complexity scales exponentially. The fallback greedy mechanism mitigates outright failure.
- **Gap:** If the participant pool exceeds ~500 participants, the strict constraints might consistently force the solver into the greedy fallback. 
- **Recommendation:** Implement a pre-clustering or partitioning step before feeding participants to the solver.

### 6.4 Missing Caching Layer (Risk: Low)
- **Current State:** Endpoints like `/leaderboard` perform dynamic aggregation across all scorecards upon request.
- **Gap:** During the final hours of an event, the leaderboard will be heavily polled. 
- **Recommendation:** Implement Redis-based caching for `/leaderboard` with invalidation hooks inside the `score_service` upon new score submissions.

---

## 7. Pending Work & Code Smells

- **Frontend Error Handling:** `frontend_new/src/views/AdminDashboard.jsx` handles upload errors gracefully, but participant deletion uses `window.confirm()`. A centralized Toast/Snackbar system is needed for consistent UX.
- **Static Configurations:** In `frontend_new/src/views/ParticipantPortal.jsx`, the `KeyDatesCard` contains hardcoded placeholder dates ("Day 1", "Day 2"). This should be driven by the dynamic event config endpoint.
- **Missing Tests:** The repository lacks unit and integration tests (no `tests/` directory found in the backend or frontend source). This is critical before production rollout.

---

## 8. Strategic Roadmap for Enterprise Scaling

To scale EventOS from a robust demo to a mission-critical platform:

1. **Infrastructure Upgrade:** Migrate from Docker Compose to **Kubernetes**. Utilize KEDA (Kubernetes Event-driven Autoscaling) to auto-scale Celery workers based on Redis queue length.
2. **Observability Rollout:** Integrate OpenTelemetry. Inject Trace IDs at the FastAPI gateway and propagate them through the Celery broker into the worker logs.
3. **Database Tuning:** As evaluations grow, add appropriate indices on the `evaluations` table (specifically composite indices on `team_id` and `evaluator_id`).
4. **Test Coverage:** Implement Pytest for the backend (mocking Celery and Gemini) and Vitest/React Testing Library for the frontend.

---
*Report generated via thorough inspection of the EventOS source tree, configuration files, schema definitions, and React component hierarchies.*
