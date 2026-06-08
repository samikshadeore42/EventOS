#!/bin/bash

# 1. Run database migrations FIRST
echo "Running database migrations..."
alembic upgrade head

# 2. Start the Celery worker in the background
echo "Starting Celery worker..."
celery -A app.core.celery_app worker --loglevel=info &

# 3. Start the FastAPI web server in the foreground
echo "Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port $PORT