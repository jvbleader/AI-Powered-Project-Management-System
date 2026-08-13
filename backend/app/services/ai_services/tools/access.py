from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Annotated, Any, Iterator

from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import InjectedToolArg
from sqlalchemy.orm import Session, joinedload

from app.core.connection import SessionLocal
from app.models.user_model import User
from app.utils.project_helpers import (
    list_accessible_project_ids,
    list_managed_project_ids,
    user_can_manage_project,
    user_can_manage_sprints,
)

# Runtime inject từ AgentExecutor — không để LLM tự truyền
ToolConfig = Annotated[RunnableConfig, InjectedToolArg]

# AgentExecutor chạy tool trong thread pool — KHÔNG dùng chung 1 Session SQLAlchemy.
# ContextVar chỉ giữ user_id; mỗi tool tự mở SessionLocal riêng.
_tool_runtime: ContextVar[dict[str, Any] | None] = ContextVar("ai_tool_runtime", default=None)


def push_tool_runtime(*, current_user_id: int) -> Token:
    return _tool_runtime.set({"current_user_id": current_user_id})


def reset_tool_runtime(token: Token) -> None:
    _tool_runtime.reset(token)


def _runtime() -> dict[str, Any]:
    return _tool_runtime.get() or {}


def resolve_user_id(config: RunnableConfig | None = None) -> int | None:
    if config:
        user = config.get("configurable", {}).get("current_user")
        if user is not None and getattr(user, "id", None) is not None:
            return int(user.id)
        uid = config.get("configurable", {}).get("current_user_id")
        if uid is not None:
            return int(uid)
    uid = _runtime().get("current_user_id")
    return int(uid) if uid is not None else None


@contextmanager
def tool_db_session() -> Iterator[Session]:
    """Session ngắn hạn cho 1 lần gọi tool (an toàn với thread pool)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def load_current_user(db: Session, config: RunnableConfig | None = None) -> User | None:
    user_id = resolve_user_id(config)
    if user_id is None:
        return None
    return (
        db.query(User)
        .options(joinedload(User.role_ref), joinedload(User.department))
        .filter(User.id == user_id)
        .first()
    )


def accessible_project_ids(db: Session, user: User | None) -> list[int]:
    if not user:
        return []
    return list_accessible_project_ids(db, user)


def managed_project_ids(db: Session, user: User | None) -> list[int]:
    if not user:
        return []
    return list_managed_project_ids(db, user)


def deny_if_project_inaccessible(
    db: Session, user: User | None, project_id: int
) -> dict[str, Any] | None:
    if not user:
        return {"error": "Không xác định được người dùng hiện tại."}
    if project_id not in accessible_project_ids(db, user):
        return {"error": f"Bạn không có quyền truy cập dự án ID {project_id}."}
    return None


def deny_if_cannot_manage_project(
    db: Session, user: User | None, project_id: int
) -> dict[str, Any] | None:
    if not user:
        return {"error": "Không xác định được người dùng hiện tại."}
    if not user_can_manage_project(db, project_id, user):
        return {"error": f"Bạn không có quyền quản lý dự án ID {project_id}."}
    return None


def deny_if_cannot_manage_sprints(
    db: Session, user: User | None, project_id: int
) -> dict[str, Any] | None:
    if not user:
        return {"error": "Không xác định được người dùng hiện tại."}
    if not user_can_manage_sprints(db, project_id, user):
        return {
            "error": (
                "Chỉ PM/PO/GM hoặc Leader của dự án này mới được tạo hoặc cập nhật sprint."
            )
        }
    return None
