#!/bin/bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting Celery worker inside free Render web service..."
celery -A app.core.celery_app worker --concurrency=1 --loglevel=info &

echo "Starting Celery beat inside free Render web service..."
celery -A app.core.celery_app beat --loglevel=info &

echo "Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
