from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    ai,
    auth,
    dashboard,
    logworks,
    notifications,
    projects,
    roles,
    sprints,
    tasks,
    users,
)
from app.core.config import get_settings
from app.services.websocket_manager import manager

settings = get_settings()
cors_origin_regex = (
    r"^https?://[^/]+(?::\d+)?$" if settings.environment.strip().lower() == "development" else None
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await manager.start()
    try:
        yield
    finally:
        await manager.stop()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(roles.router)
app.include_router(projects.router)
app.include_router(dashboard.router)
app.include_router(ai.router)
app.include_router(tasks.router)
app.include_router(tasks.router_root)
app.include_router(sprints.router)
app.include_router(sprints.router_root)
app.include_router(logworks.router)
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
