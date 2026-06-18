# File: backend/app/services/chat_connection_manager.py
"""
Manages live WebSocket connections for chat and fans messages out via Redis
pub/sub so connections on different worker processes all receive every
message in their conversation, not just ones on the same process.

One Redis channel per conversation: f"chat:{conversation_id}".

Flow for an incoming message:
  1. Client sends over their WebSocket.
  2. Route handler persists it to Postgres (source of truth).
  3. Route handler publishes the saved message (as JSON) to the conversation's
     Redis channel.
  4. EVERY worker process subscribed to that channel (one subscriber task per
     conversation that has at least one local connection) receives it and
     relays it to its own locally-held WebSocket connections.

This means a message is only ever "sent" once messages are confirmed
persisted — chat history and live delivery can never disagree.
"""
import asyncio
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import WebSocket

from app.core.redis_async import get_async_redis

logger = logging.getLogger(__name__)


class ChatConnectionManager:
    def __init__(self):
        # conversation_id -> set of live WebSocket connections on THIS process
        self._connections: dict[str, set[WebSocket]] = {}
        # conversation_id -> the asyncio task running this process's Redis
        # subscriber loop for that conversation (one per conversation, shared
        # across however many local connections are in it)
        self._subscriber_tasks: dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    async def connect(self, conversation_id: UUID, websocket: WebSocket) -> None:
        key = str(conversation_id)
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(key, set()).add(websocket)
            if key not in self._subscriber_tasks:
                self._subscriber_tasks[key] = asyncio.create_task(self._subscribe_loop(key))

    async def disconnect(self, conversation_id: UUID, websocket: WebSocket) -> None:
        key = str(conversation_id)
        async with self._lock:
            conns = self._connections.get(key)
            if conns and websocket in conns:
                conns.discard(websocket)
            if conns is not None and not conns:
                # No local connections left for this conversation — stop
                # subscribing on this process, no point holding the channel open.
                self._connections.pop(key, None)
                task = self._subscriber_tasks.pop(key, None)
                if task:
                    task.cancel()

    async def publish(self, conversation_id: UUID, payload: dict) -> None:
        """Publish a message to every process subscribed to this
        conversation's channel (including this one)."""
        redis = get_async_redis()
        await redis.publish(f"chat:{conversation_id}", json.dumps(payload, default=str))

    async def _subscribe_loop(self, conversation_key: str) -> None:
        """Runs for as long as this process has >=1 local connection for this
        conversation. Relays every message published on the Redis channel to
        all locally-held sockets for that conversation."""
        redis = get_async_redis()
        pubsub = redis.pubsub()
        channel = f"chat:{conversation_key}"
        try:
            await pubsub.subscribe(channel)
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = message["data"]
                except KeyError:
                    continue
                await self._broadcast_local(conversation_key, data)
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001 — never let one conversation's
            # subscriber crash silently kill chat for everyone else
            logger.error("Chat subscriber loop error for %s: %s", channel, exc)
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except Exception:  # noqa: BLE001
                pass

    async def _broadcast_local(self, conversation_key: str, raw_json: str) -> None:
        conns = list(self._connections.get(conversation_key, set()))
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(raw_json)
            except Exception:  # noqa: BLE001 — connection dropped mid-send
                dead.append(ws)
        if dead:
            async with self._lock:
                live = self._connections.get(conversation_key)
                if live:
                    for ws in dead:
                        live.discard(ws)


# One manager per process, imported wherever chat routes need it.
chat_manager = ChatConnectionManager()