from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from types import SimpleNamespace

from sqlalchemy.orm import Session

from app.models.logworks import LogWork
from app.models.project_model import Project
from app.models.task_model import Task
from app.models.user_model import User
from app.repositories import project_repository, task_repository
from app.services import project_service
from app.utils.ai_rules import (
    get_business_now,
    get_business_today,
    is_high_priority,
    is_member_overloaded,
    is_open_task,
    is_overdue,
    is_task_stalled,
    resolve_last_signal,
)
from app.utils.dashboard_helpers import (
    build_task_progress_map,
    calculate_logwork_coverage,
    calculate_progress_percent,
    list_leaf_tasks,
)


@dataclass(frozen=True)
class AssigneeSnapshot:
    user_id: int
    name: str
    email: str


@dataclass(frozen=True)
class ProjectMemberSnapshot:
    member_id: int
    user_id: int
    name: str
    email: str
    role_name: str


@dataclass
class QuickResponseContext:
    projects: list[Project]
    today: date
    now: datetime
    all_tasks: list[Task]
    leaf_tasks: list[Task]
    task_by_id: dict[int, Task]
    assignees_by_task_id: dict[int, list[AssigneeSnapshot]]
    primary_assignee_by_task_id: dict[int, AssigneeSnapshot | None]
    latest_logwork_by_task_id: dict[int, LogWork]
    last_signal_by_task_id: dict[int, datetime | None]
    task_progress_map: dict[int, float]
    project_members: list[ProjectMemberSnapshot]
    member_by_user_id: dict[int, ProjectMemberSnapshot]
    missing_logwork_user_ids: set[int]
    open_tasks_by_user_id: dict[int, list[Task]]
    high_priority_open_task_count_by_user_id: dict[int, int]
    stalled_task_ids: set[int]
    overdue_task_ids: set[int]
    project_progress: int
    logwork_coverage: int
    recent_logwork_rows: list[tuple]

    def get_assignees(self, task_id: int) -> list[AssigneeSnapshot]:
        return self.assignees_by_task_id.get(task_id, [])

    def get_primary_assignee(self, task_id: int) -> AssigneeSnapshot | None:
        return self.primary_assignee_by_task_id.get(task_id)

    def is_member_overloaded(self, user_id: int) -> bool:
        return is_member_overloaded(
            len(self.open_tasks_by_user_id.get(user_id, [])),
            self.high_priority_open_task_count_by_user_id.get(user_id, 0),
        )


def load_quick_response_context(
    db: Session,
    current_user: User,
    project_id: int | None,
) -> QuickResponseContext:
    if project_id is not None:
        project = project_service.require_project_access(db, project_id, current_user)
        projects = [project]
    else:
        projects, _, _ = project_service.list_projects(
            db, current_user, status="ACTIVE", page_size=10
        )
        if not projects:
            raise ValueError("Người dùng chưa tham gia dự án nào đang mở.")

    today = get_business_today()
    now = get_business_now()

    project_ids = [p.id for p in projects]
    all_tasks = task_repository.list_tasks(db, project_ids=project_ids)
    leaf_tasks = list_leaf_tasks(all_tasks)
    task_by_id = {task.id: task for task in all_tasks}

    assignee_rows = task_repository.list_task_assignee_users(db, [task.id for task in all_tasks])
    assignees_by_task_id: dict[int, list[AssigneeSnapshot]] = defaultdict(list)
    primary_assignee_by_task_id: dict[int, AssigneeSnapshot | None] = {
        task.id: None for task in all_tasks
    }
    for task_id, user_id, full_name, email in assignee_rows:
        snapshot = AssigneeSnapshot(
            user_id=user_id,
            name=(full_name or email).strip(),
            email=email,
        )
        assignees_by_task_id[task_id].append(snapshot)
        if primary_assignee_by_task_id.get(task_id) is None:
            primary_assignee_by_task_id[task_id] = snapshot

    member_rows = []
    for pid in project_ids:
        member_rows.extend(project_repository.list_project_members(db, pid))
        
    project_members: list[ProjectMemberSnapshot] = []
    member_by_user_id: dict[int, ProjectMemberSnapshot] = {}
    for pm, user, role in member_rows:
        if pm.user_id not in member_by_user_id:
            snapshot = ProjectMemberSnapshot(
                member_id=pm.id,
                user_id=user.id,
                name=(user.full_name or user.email).strip(),
                email=user.email,
                role_name=role.name,
            )
            project_members.append(snapshot)
            member_by_user_id[user.id] = snapshot

    recent_logwork_rows = task_repository.list_project_logworks_with_context(db, project_ids=project_ids)
    latest_logwork_by_task_id: dict[int, LogWork] = {}
    member_logwork_today = set()
    coverage_logworks = []
    for logwork, task, _, user in recent_logwork_rows:
        if task.id not in latest_logwork_by_task_id:
            latest_logwork_by_task_id[task.id] = logwork
        if logwork.work_date == today:
            member_logwork_today.add(user.id)
        coverage_logworks.append(SimpleNamespace(user_id=user.id, work_date=logwork.work_date))

    missing_logwork_user_ids = {
        member.user_id for member in project_members if member.user_id not in member_logwork_today
    }

    task_progress_map = build_task_progress_map([row[0] for row in recent_logwork_rows])
    
    logwork_coverage = 0
    project_progress = 0
    if projects:
        project_progress = calculate_progress_percent(all_tasks, task_progress_map)
        logwork_coverage = calculate_logwork_coverage(
            [member.user_id for member in project_members],
            coverage_logworks,
            today=today,
        )

    last_signal_by_task_id = {}
    for task in all_tasks:
        latest_logwork = latest_logwork_by_task_id.get(task.id)
        last_signal_by_task_id[task.id] = resolve_last_signal(
            task.updated_at,
            latest_logwork.updated_at if latest_logwork else None,
            latest_logwork.created_at if latest_logwork else None,
        )

    open_tasks_by_user_id: dict[int, list[Task]] = defaultdict(list)
    high_priority_open_task_count_by_user_id: dict[int, int] = defaultdict(int)
    for task in leaf_tasks:
        if not is_open_task(task):
            continue
        for assignee in assignees_by_task_id.get(task.id, []):
            open_tasks_by_user_id[assignee.user_id].append(task)
            if is_high_priority(task.priority):
                high_priority_open_task_count_by_user_id[assignee.user_id] += 1

    overdue_task_ids = {task.id for task in leaf_tasks if is_overdue(task, today)}
    stalled_task_ids = {
        task.id
        for task in leaf_tasks
        if is_task_stalled(task, last_signal_by_task_id.get(task.id), today, now)
    }

    return QuickResponseContext(
        projects=projects,
        today=today,
        now=now,
        all_tasks=all_tasks,
        leaf_tasks=leaf_tasks,
        task_by_id=task_by_id,
        assignees_by_task_id=dict(assignees_by_task_id),
        primary_assignee_by_task_id=primary_assignee_by_task_id,
        latest_logwork_by_task_id=latest_logwork_by_task_id,
        last_signal_by_task_id=last_signal_by_task_id,
        task_progress_map=task_progress_map,
        project_members=project_members,
        member_by_user_id=member_by_user_id,
        missing_logwork_user_ids=missing_logwork_user_ids,
        open_tasks_by_user_id=dict(open_tasks_by_user_id),
        high_priority_open_task_count_by_user_id=dict(high_priority_open_task_count_by_user_id),
        stalled_task_ids=stalled_task_ids,
        overdue_task_ids=overdue_task_ids,
        project_progress=project_progress,
        logwork_coverage=logwork_coverage,
        recent_logwork_rows=recent_logwork_rows[:6],
    )
