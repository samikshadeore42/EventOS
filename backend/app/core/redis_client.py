# File: backend/app/core/redis_client.py
#
# CONCEPT: Redis is an in-memory key-value store.
# Think of it as a giant Python dict that:
#   - Persists across requests
#   - Is accessible by ALL containers (API + Celery workers)
#   - Supports automatic key expiry (TTL)
#   - Is microsecond-fast for reads and writes
#
# We create ONE connection pool and reuse it everywhere.
# Creating a new connection per request would be wasteful.

import os
import redis
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Connection pool — Redis reuses connections from this pool
# instead of opening a new TCP connection per command
_pool = redis.ConnectionPool.from_url(
    REDIS_URL,
    max_connections=20,
    decode_responses=True   # always return strings, not bytes
)


def get_redis() -> redis.Redis:
    """
    Returns a Redis client using the shared connection pool.
    Call this wherever you need Redis — API routes, services, tasks.

    Usage:
        r = get_redis()
        r.set("key", "value")
        r.get("key")
    """
    return redis.Redis(connection_pool=_pool)


def ping_redis() -> bool:
    """Health check — returns True if Redis is reachable."""
    try:
        return get_redis().ping()
    except Exception:
        return False
