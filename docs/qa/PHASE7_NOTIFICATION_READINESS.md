# Phase 7 Notification Readiness

## Scope

Phase 7 adds event-scoped in-app notifications, notification outbox processing, unread counts, frontend notification bell support, and backend notification tests.

## Completed

- Event-scoped notification routes.
- Notification outbox model and service.
- Idempotent enqueue behavior.
- Celery outbox processor.
- In-app notification creation.
- Unread count endpoint.
- Mark-as-read endpoint.
- Frontend notification bell integration.
- Backend regression tests for enqueue, processing, list, unread count, and read status.

## Required Verification

```bash
docker compose config --quiet
docker compose up --build -d
docker compose exec backend alembic heads
docker compose exec backend alembic current
docker compose exec backend alembic upgrade head
docker compose exec backend python -m compileall -q app
docker compose exec backend python -m pytest -q tests

cd frontend_new
npm run test:run
npm run lint
npm run build
```

## Verdict

Phase 7 is ready only after all backend, frontend, Alembic, and Docker checks pass.