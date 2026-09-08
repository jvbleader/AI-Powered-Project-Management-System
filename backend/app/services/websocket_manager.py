import asyncio
import json
import logging
from contextlib import suppress
from typing import Dict, List

from fastapi import WebSocket
from redis import asyncio as async_redis
from redis.exceptions import RedisError

from app.core.config import get_settings

logger = logging.getLogger("notification_bus")
settings = get_settings()

NOTIFICATION_CHANNEL = "flowpilot:notifications"


class ConnectionManager:
    def __init__(self):
        # WebSocket objects must remain process-local. Cross-worker delivery is
        # handled by Redis Pub/Sub; every worker subscribes to the same channel
        # and forwards each event only to the sockets it owns.
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self._redis: async_redis.Redis | None = None
        self._pubsub: async_redis.client.PubSub | None = None
        self._listener_task: asyncio.Task[None] | None = None
        self._stopping = False

    async def start(self) -> None:
        """Start this worker's Redis subscriber before accepting traffic."""
        if self._listener_task and not self._listener_task.done():
            return

        self._stopping = False
        self._redis = async_redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
        await self._redis.ping()
        await self._subscribe()
        self._listener_task = asyncio.create_task(
            self._listen_forever(),
            name="flowpilot-notification-subscriber",
        )
        logger.info("Notification subscriber started on %s", NOTIFICATION_CHANNEL)

    async def stop(self) -> None:
        """Stop the subscriber and close Redis resources for this worker."""
        self._stopping = True

        if self._listener_task:
            self._listener_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._listener_task
            self._listener_task = None

        await self._close_pubsub()

        if self._redis:
            await self._redis.aclose()
            self._redis = None

        self.active_connections.clear()
        logger.info("Notification subscriber stopped")

    async def _subscribe(self) -> None:
        if not self._redis:
            raise RuntimeError("Redis notification client is not initialized")

        pubsub = self._redis.pubsub()
        await pubsub.subscribe(NOTIFICATION_CHANNEL)
        self._pubsub = pubsub

    async def _close_pubsub(self) -> None:
        if not self._pubsub:
            return

        pubsub = self._pubsub
        self._pubsub = None
        with suppress(Exception):
            await pubsub.unsubscribe(NOTIFICATION_CHANNEL)
        with suppress(Exception):
            await pubsub.aclose()

    async def _listen_forever(self) -> None:
        """Consume Redis messages and reconnect after transient failures."""
        reconnect_delay = 1

        while not self._stopping:
            try:
                if not self._pubsub:
                    await self._subscribe()

                pubsub = self._pubsub
                if not pubsub:
                    continue

                async for event in pubsub.listen():
                    if self._stopping:
                        return
                    if event.get("type") != "message":
                        continue

                    payload = json.loads(event["data"])
                    user_id = int(payload["user_id"])
                    message = payload["message"]
                    if not isinstance(message, dict):
                        raise ValueError("Notification message must be a JSON object")

                    await self._send_local(message, user_id)

                if not self._stopping:
                    raise ConnectionError("Redis notification subscription ended")
            except asyncio.CancelledError:
                raise
            except (RedisError, ConnectionError, ValueError, TypeError, json.JSONDecodeError):
                logger.exception(
                    "Notification subscriber failed; reconnecting in %ss",
                    reconnect_delay,
                )
                await self._close_pubsub()
                await asyncio.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, 10)
            else:
                reconnect_delay = 1

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.debug("WebSocket connected for user %s", user_id)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.debug("WebSocket disconnected for user %s", user_id)

    async def send_personal_message(self, message: dict, user_id: int):
        """Publish once so every worker can deliver to its local sockets."""
        if not self._redis:
            logger.warning(
                "Notification bus is unavailable; using process-local delivery for user %s",
                user_id,
            )
            await self._send_local(message, user_id)
            return

        payload = json.dumps(
            {"user_id": user_id, "message": message},
            ensure_ascii=False,
            default=str,
        )

        try:
            subscriber_count = await self._redis.publish(NOTIFICATION_CHANNEL, payload)
        except RedisError:
            logger.exception(
                "Failed to publish notification; using process-local delivery for user %s",
                user_id,
            )
            await self._send_local(message, user_id)
            return

        if subscriber_count == 0:
            logger.warning(
                "No notification subscribers were available; using process-local delivery for user %s",
                user_id,
            )
            await self._send_local(message, user_id)

    async def _send_local(self, message: dict, user_id: int) -> None:
        """Deliver only to WebSockets owned by the current worker."""
        connections = list(self.active_connections.get(user_id, []))
        dead_connections: list[WebSocket] = []

        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                logger.exception("Failed to send WebSocket notification to user %s", user_id)
                dead_connections.append(connection)

        for connection in dead_connections:
            self.disconnect(connection, user_id)


manager = ConnectionManager()
