from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, dashboard, logworks, notifications, projects, sprints, tasks, users
from app.core.config import get_settings

settings = get_settings()
cors_origin_regex = (
    r"^https?://[^/]+(?::\d+)?$" if settings.environment.strip().lower() == "development" else None
)

app = FastAPI()

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
app.include_router(projects.router)
app.include_router(dashboard.router)
app.include_router(tasks.router)
app.include_router(tasks.router_root)
app.include_router(sprints.router)
app.include_router(sprints.router_root)
app.include_router(logworks.router)
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
