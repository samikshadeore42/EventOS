# File: backend/app/core/redis_client.py
#
# CONCEPT: Redis is an in-memory key-value store.
# We create ONE connection pool and reuse it everywhere.

import os
import redis
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("RENDER_REDIS_URL") or os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Set up our base connection arguments
pool_kwargs = {
    "max_connections": 20,
    "decode_responses": True
}

# CRITICAL FIX FOR UPSTASH: 
# If we are using the secure 'rediss://' protocol, we bypass strict local SSL checks
if REDIS_URL.startswith("rediss://"):
    pool_kwargs["ssl_cert_reqs"] = None

# Connection pool — Redis reuses connections from this pool
_pool = redis.ConnectionPool.from_url(REDIS_URL, **pool_kwargs)


def get_redis() -> redis.Redis:
    """
    Returns a Redis client using the shared connection pool.
    Call this wherever you need Redis — API routes, services, tasks.
    """
    return redis.Redis(connection_pool=_pool)


def ping_redis() -> bool:
    """Health check — returns True if Redis is reachable."""
    try:
        return get_redis().ping()
    except Exception:
        return False