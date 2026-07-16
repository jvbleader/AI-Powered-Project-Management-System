from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from app.models.task_model import Task
from app.utils.dashboard_helpers import normalize_task_status

BUSINESS_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
STALL_DAYS = 2
STALL_NEAR_DEADLINE_DAYS = 5
NEAR_DUE_DAYS = 3
OVERLOADED_OPEN_TASKS = 4
OVERLOADED_HIGH_PRIORITY_TASKS = 2
TOP_PRIORITY_ITEMS = 3
TOP_STALLED_ITEMS = 5
TOP_OVERDUE_ITEMS = 5
TOP_FOLLOW_UP_MEMBERS = 5


def ensure_aware_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def get_business_now() -> datetime:
    return datetime.now(BUSINESS_TIMEZONE)


def get_business_today() -> date:
    return get_business_now().date()


def normalize_priority(priority: str | None) -> str:
    normalized = (priority or "medium").strip().lower()
    if normalized in {"critical", "high", "medium", "low"}:
        return normalized
    return "medium"


def is_high_priority(priority: str | None) -> bool:
    return normalize_priority(priority) in {"high", "critical"}


def is_open_task(task: Task) -> bool:
    return normalize_task_status(task.status) != "done"


def is_overdue(task: Task, today: date) -> bool:
    return bool(task.deadline and task.deadline < today and is_open_task(task))


def is_near_due(task: Task, today: date, window_days: int = NEAR_DUE_DAYS) -> bool:
    if not task.deadline or not is_open_task(task):
        return False

    return today <= task.deadline <= (today + timedelta(days=window_days))


def days_overdue(task: Task, today: date) -> int:
    if not task.deadline or task.deadline >= today:
        return 0
    return (today - task.deadline).days


def days_until_deadline(task: Task, today: date) -> Optional[int]:
    if not task.deadline:
        return None
    return (task.deadline - today).days


def resolve_last_signal(
    task_updated_at: Optional[datetime],
    logwork_updated_at: Optional[datetime] = None,
    logwork_created_at: Optional[datetime] = None,
) -> Optional[datetime]:
    candidates = [
        ensure_aware_datetime(task_updated_at),
        ensure_aware_datetime(logwork_updated_at),
        ensure_aware_datetime(logwork_created_at),
    ]
    values = [candidate for candidate in candidates if candidate is not None]
    return max(values) if values else None


def days_since_signal(last_signal: Optional[datetime], now: datetime) -> Optional[int]:
    if last_signal is None:
        return None

    normalized_now = ensure_aware_datetime(now)
    normalized_signal = ensure_aware_datetime(last_signal)
    if normalized_now is None or normalized_signal is None:
        return None

    return max(0, (normalized_now - normalized_signal).days)


def is_task_stalled(
    task: Task,
    last_signal: Optional[datetime],
    today: date,
    now: datetime,
) -> bool:
    if not is_open_task(task):
        return False

    inactive_days = days_since_signal(last_signal, now)
    if inactive_days is None or inactive_days < STALL_DAYS:
        return False

    if is_overdue(task, today):
        return True

    deadline_distance = days_until_deadline(task, today)
    if deadline_distance is not None and deadline_distance <= STALL_NEAR_DEADLINE_DAYS:
        return True

    return is_high_priority(task.priority)


def is_member_overloaded(open_task_count: int, high_priority_task_count: int) -> bool:
    return (
        open_task_count >= OVERLOADED_OPEN_TASKS
        or high_priority_task_count >= OVERLOADED_HIGH_PRIORITY_TASKS
    )
