# File: backend/app/core/redis_async.py
#
# Async counterpart to redis_client.py, used ONLY for the chat WebSocket
# pub/sub fan-out. The sync client (redis_client.py) stays as-is for
# Celery/TaskTracker — this exists because FastAPI's WebSocket handlers are
# async, and blocking the event loop with a sync Redis call would stall every
# other connection on the same worker process.
#
# Why pub/sub at all: each Uvicorn worker process holds its own in-memory set
# of WebSocket connections. If two team members' connections land on
# different worker processes, a naive "broadcast to my local connections"
# would silently drop messages between them. Redis pub/sub fans a published
# message out to every worker's subscriber, so it doesn't matter which
# process holds which socket.

import os
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("RENDER_REDIS_URL") or os.getenv("REDIS_URL", "redis://localhost:6379/0")

_pool_kwargs = {"decode_responses": True}
# Same Upstash/rediss:// SSL accommodation as the sync client.
if REDIS_URL.startswith("rediss://"):
    _pool_kwargs["ssl_cert_reqs"] = None

_async_pool = aioredis.ConnectionPool.from_url(REDIS_URL, **_pool_kwargs)


def get_async_redis() -> aioredis.Redis:
    """Async Redis client using a shared connection pool. Use for chat
    pub/sub publish/subscribe only — everything else keeps using the sync
    client in redis_client.py."""
    return aioredis.Redis(connection_pool=_async_pool)