from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable, Sequence

from app.models.logworks import LogWork
from app.models.task_model import Task


def decimal_to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0

    return float(value)


def normalize_task_status(status: str | None) -> str:
    normalized = (status or "todo").strip().lower()

    if normalized == "done":
        return "done"

    if normalized in {"in_progress", "inprogress", "review", "blocked"}:
        return "in_progress"

    return "todo"


def list_leaf_tasks(tasks: Sequence[Task]) -> list[Task]:
    parent_ids = {task.parent_task_id for task in tasks if task.parent_task_id is not None}
    return [task for task in tasks if task.id not in parent_ids]


def build_task_progress_map(logworks: Iterable[LogWork]) -> dict[int, float]:
    latest_progress_by_task: dict[int, tuple[datetime, float]] = {}

    for entry in logworks:
        timestamp = getattr(entry, "updated_at", None) or getattr(entry, "created_at", None)
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)

        current_progress = float(max(0.0, min(100.0, decimal_to_float(entry.progress_percent))))
        existing = latest_progress_by_task.get(entry.task_id)

        if existing is None or timestamp >= existing[0]:
            latest_progress_by_task[entry.task_id] = (timestamp, current_progress)

    return {
        task_id: progress
        for task_id, (_, progress) in latest_progress_by_task.items()
    }


def resolve_task_progress_percent(task: Task, task_progress_map: dict[int, float] | None = None) -> float:
    # Progress is effort-based: only completed leaf tasks contribute.
    del task_progress_map
    normalized_status = normalize_task_status(task.status)
    if normalized_status == "done":
        return 100.0

    return 0.0


def calculate_progress_percent(
    tasks: Sequence[Task],
    task_progress_map: dict[int, float] | None = None,
) -> int:
    leaf_tasks = list_leaf_tasks(tasks)
    if not leaf_tasks:
        return 0

    total_weight = 0.0
    weighted_progress = 0.0

    for task in leaf_tasks:
        weight = decimal_to_float(getattr(task, "estimated_hours", None))
        if weight <= 0:
            continue

        progress = resolve_task_progress_percent(task, task_progress_map)
        total_weight += weight
        weighted_progress += weight * (progress / 100.0)

    if total_weight <= 0:
        return 0

    return round((weighted_progress / total_weight) * 100)


def count_task_statuses(tasks: Sequence[Task]) -> dict[str, int]:
    counts = {"todo": 0, "in_progress": 0, "done": 0}

    for task in list_leaf_tasks(tasks):
        counts[normalize_task_status(task.status)] += 1

    return counts


def count_overdue_tasks(
    tasks: Sequence[Task],
    today: date | None = None,
    include_parent_tasks: bool = False,
) -> int:
    return len(list_overdue_tasks(tasks, today, include_parent_tasks))


def list_overdue_tasks(
    tasks: Sequence[Task],
    today: date | None = None,
    include_parent_tasks: bool = False,
) -> list[Task]:
    current_day = today or datetime.now(timezone.utc).date()
    task_list = tasks if include_parent_tasks else list_leaf_tasks(tasks)

    return [
        task
        for task in task_list
        if task.deadline and task.deadline < current_day and normalize_task_status(task.status) != "done"
    ]


def sum_estimated_hours(tasks: Sequence[Task]) -> float:
    return round(
        sum(decimal_to_float(getattr(task, "estimated_hours", None)) for task in list_leaf_tasks(tasks)),
        1,
    )


def build_task_estimate_rollup(tasks: Sequence[Task]) -> dict[int, float]:
    task_by_id = {task.id: task for task in tasks}
    children_by_parent_id: dict[int, list[Task]] = defaultdict(list)

    for task in tasks:
        if task.parent_task_id is not None and task.parent_task_id in task_by_id:
            children_by_parent_id[task.parent_task_id].append(task)

    resolved: dict[int, float] = {}
    active_stack: set[int] = set()

    def resolve(task_id: int) -> float:
        if task_id in resolved:
            return resolved[task_id]

        if task_id in active_stack:
            return 0.0

        active_stack.add(task_id)
        task = task_by_id[task_id]
        children = children_by_parent_id.get(task_id, [])

        if not children:
            total = decimal_to_float(getattr(task, "estimated_hours", None))
        else:
            total = sum(resolve(child.id) for child in children)

        active_stack.remove(task_id)
        resolved[task_id] = round(total, 1)
        return resolved[task_id]

    for task_id in task_by_id:
        resolve(task_id)

    return resolved


def sum_logged_hours(logworks: Iterable[LogWork]) -> float:
    return round(sum(decimal_to_float(entry.hours_spent) for entry in logworks), 1)


def calculate_elapsed_progress(
    start_date: date | None,
    end_date: date | None,
    today: date | None = None,
) -> int:
    if not start_date or not end_date:
        return 0

    if end_date < start_date:
        return 0

    current_day = today or datetime.now(timezone.utc).date()
    if current_day <= start_date:
        return 0

    total_days = max(1, (end_date - start_date).days + 1)
    elapsed_days = min(total_days, max(0, (current_day - start_date).days + 1))
    return round((elapsed_days / total_days) * 100)


def resolve_health_tone(actual_progress: int, planned_progress: int, status: str | None = None) -> str:
    normalized_status = (status or "").strip().lower()
    if normalized_status in {"closed", "completed", "done"}:
        return "on-track"

    delta = actual_progress - planned_progress
    if delta >= -8:
        return "on-track"
    if delta >= -20:
        return "watch"
    return "critical"


def calculate_logwork_coverage(
    member_user_ids: Sequence[int],
    logworks: Iterable[LogWork],
    today: date | None = None,
) -> int:
    if not member_user_ids:
        return 0

    current_day = today or datetime.now(timezone.utc).date()
    logged_users = {
        getattr(entry, "user_id")
        for entry in logworks
        if getattr(entry, "user_id", None) is not None and entry.work_date == current_day
    }

    covered = sum(1 for user_id in member_user_ids if user_id in logged_users)
    return round((covered / len(member_user_ids)) * 100) if member_user_ids else 0
