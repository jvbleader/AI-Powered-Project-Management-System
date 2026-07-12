from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.project_model import Project
from app.models.sprint_model import Sprint
from app.models.user_model import User
from app.repositories import project_repository, sprint_repository, task_repository
from app.schemas.dashboard_schema import (
    DashboardOverviewResponse,
    DashboardRecentLogworkResponse,
    DashboardSprintSummaryResponse,
    DashboardTaskPreviewResponse,
    DashboardTaskSummaryResponse,
    DashboardWorkloadMemberResponse,
)
from app.services import project_service
from app.utils.dashboard_helpers import (
    build_task_progress_map,
    calculate_elapsed_progress,
    calculate_logwork_coverage,
    calculate_progress_percent,
    count_overdue_tasks,
    count_task_statuses,
    decimal_to_float,
    list_leaf_tasks,
    normalize_task_status,
    resolve_health_tone,
    sum_estimated_hours,
    sum_logged_hours,
)
from app.utils.project_helpers import build_project_response, is_admin_user


def _normalize_sprint_status(status: str | None) -> str:
    normalized = (status or "planning").strip().lower()

    if normalized in {"active", "in_progress"}:
        return "ACTIVE"
    if normalized == "review":
        return "REVIEW"
    if normalized in {"closed", "completed", "done"}:
        return "CLOSED"
    return "PLANNED"


def _load_accessible_projects(db: Session, current_user: User):
    if is_admin_user(current_user):
        return (
            db.query(Project)
            .order_by(desc(Project.updated_at), desc(Project.id))
            .all()
        )

    accessible_ids = project_repository.list_member_project_ids(db, current_user.id)
    if not accessible_ids:
        return []

    return (
        db.query(Project)
        .filter(Project.id.in_(accessible_ids))
        .order_by(desc(Project.updated_at), desc(Project.id))
        .all()
    )


def _resolve_selected_project(db: Session, current_user: User, project_id: int | None):
    accessible_projects = _load_accessible_projects(db, current_user)
    if not accessible_projects:
        return None, []

    if project_id is not None:
        project = project_service.require_project_access(db, project_id, current_user)
        return project, accessible_projects

    return accessible_projects[0], accessible_projects


def _select_active_sprint(sprints: list[Sprint]) -> Sprint | None:
    if not sprints:
        return None

    normalized_map = {sprint.id: _normalize_sprint_status(sprint.status) for sprint in sprints}
    for preferred_status in ("ACTIVE", "REVIEW", "PLANNED", "CLOSED"):
        for sprint in sprints:
            if normalized_map[sprint.id] == preferred_status:
                return sprint

    return sprints[0]


def _build_task_preview(task, assignee_name: str | None, sprint_name: str | None = None):
    return DashboardTaskPreviewResponse(
        id=task.id,
        key=f"TASK-{task.id}",
        title=task.title,
        status=normalize_task_status(task.status),
        priority=(task.priority or "medium").upper(),
        startDate=task.start_date,
        dueDate=task.deadline,
        assigneeName=assignee_name,
        sprintName=sprint_name,
    )


def get_dashboard_overview(
    db: Session,
    current_user: User,
    project_id: int | None = None,
) -> DashboardOverviewResponse:
    selected_project, accessible_projects = _resolve_selected_project(db, current_user, project_id)
    if not selected_project:
        return DashboardOverviewResponse()

    accessible_project_responses = [build_project_response(db, project) for project in accessible_projects]
    selected_project_response = next(
        (project for project in accessible_project_responses if project.id == selected_project.id),
        build_project_response(db, selected_project),
    )

    portfolio_progress = round(
        sum(project.progress for project in accessible_project_responses) / len(accessible_project_responses)
    ) if accessible_project_responses else 0
    open_tasks_in_scope = sum(
        max(0, project.metrics.totalTasks - project.metrics.completedTasks)
        for project in accessible_project_responses
    )

    project_tasks = task_repository.list_tasks(db, project_id=selected_project.id)
    project_logwork_rows = task_repository.list_project_logworks_with_context(db, selected_project.id)
    project_logworks = [row[0] for row in project_logwork_rows]
    task_progress_map = build_task_progress_map(project_logworks)
    leaf_tasks = list_leaf_tasks(project_tasks)
    task_counts = count_task_statuses(project_tasks)
    overdue_count = count_overdue_tasks(project_tasks)

    assignee_rows = task_repository.list_task_assignee_users(db, [task.id for task in project_tasks])
    assignee_by_task_id = {
        task_id: {
            "user_id": user_id,
            "name": full_name,
            "email": email,
        }
        for task_id, user_id, full_name, email in assignee_rows
    }

    sprint_rows = sprint_repository.list_sprints(db, selected_project.id)
    sprint_by_id = {sprint.id: sprint for sprint in sprint_rows}
    sprint_summaries: list[DashboardSprintSummaryResponse] = []

    for sprint in sprint_rows:
        sprint_tasks = [task for task in project_tasks if task.sprint_id == sprint.id]
        sprint_task_ids = {task.id for task in sprint_tasks}
        sprint_logworks = [entry for entry in project_logworks if entry.task_id in sprint_task_ids]
        sprint_counts = count_task_statuses(sprint_tasks)
        actual_progress = calculate_progress_percent(sprint_tasks, task_progress_map)
        planned_progress = calculate_elapsed_progress(sprint.start_date, sprint.end_date)
        sprint_summaries.append(
            DashboardSprintSummaryResponse(
                id=sprint.id,
                name=sprint.name,
                status=_normalize_sprint_status(sprint.status),
                goal=sprint.goal,
                startDate=sprint.start_date,
                endDate=sprint.end_date,
                plannedProgress=planned_progress,
                actualProgress=actual_progress,
                totalTasks=len(list_leaf_tasks(sprint_tasks)),
                todoCount=sprint_counts["todo"],
                inProgressCount=sprint_counts["in_progress"],
                doneCount=sprint_counts["done"],
                estimatedHours=sum_estimated_hours(sprint_tasks),
                loggedHours=sum_logged_hours(sprint_logworks),
                health=resolve_health_tone(actual_progress, planned_progress, sprint.status),
            )
        )

    active_sprint_model = _select_active_sprint(sprint_rows)
    active_sprint = next(
        (summary for summary in sprint_summaries if active_sprint_model and summary.id == active_sprint_model.id),
        None,
    )

    members = project_repository.list_project_members(db, selected_project.id, include_inactive=False)
    member_user_ids = [user.id for _, user, _ in members]
    logwork_coverage_rows = [
        type("CoverageLogwork", (), {"user_id": user.id, "work_date": logwork.work_date})
        for logwork, _, project_member, user in project_logwork_rows
    ]
    logwork_coverage = calculate_logwork_coverage(member_user_ids, logwork_coverage_rows)

    project_progress = calculate_progress_percent(project_tasks, task_progress_map)

    overdue_tasks = sorted(
        [task for task in leaf_tasks if task.deadline and task.deadline < datetime.now(timezone.utc).date() and normalize_task_status(task.status) != "done"],
        key=lambda task: (task.deadline, task.id),
    )[:6]
    active_tasks = sorted(
        [task for task in leaf_tasks if normalize_task_status(task.status) != "done"],
        key=lambda task: (task.deadline or datetime.max.date(), task.id),
    )[:8]

    workload_board: list[DashboardWorkloadMemberResponse] = []
    tasks_by_assignee_id: dict[int, list] = defaultdict(list)
    for task in leaf_tasks:
        assignee = assignee_by_task_id.get(task.id)
        if assignee:
            tasks_by_assignee_id[assignee["user_id"]].append(task)

    member_logworks: dict[int, list] = defaultdict(list)
    for logwork, _, _, user in project_logwork_rows:
        member_logworks[user.id].append(logwork)

    for member, user, role in members:
        assigned_tasks = tasks_by_assignee_id.get(user.id, [])
        assigned_counts = count_task_statuses(assigned_tasks)
        workload_board.append(
            DashboardWorkloadMemberResponse(
                userId=user.id,
                memberId=member.id,
                name=user.full_name,
                email=user.email,
                roleName=role.name,
                assignedTasks=len(assigned_tasks),
                todoTasks=assigned_counts["todo"],
                inProgressTasks=assigned_counts["in_progress"],
                doneTasks=assigned_counts["done"],
                overdueTasks=count_overdue_tasks(assigned_tasks),
                estimatedHours=sum_estimated_hours(assigned_tasks),
                loggedHours=sum_logged_hours(member_logworks.get(user.id, [])),
                progress=calculate_progress_percent(assigned_tasks, task_progress_map),
            )
        )

    workload_board.sort(key=lambda item: (-item.loggedHours, -item.estimatedHours, item.name))

    recent_logwork = [
        DashboardRecentLogworkResponse(
            id=logwork.id,
            taskId=task.id,
            taskKey=f"TASK-{task.id}",
            taskTitle=task.title,
            userId=user.id,
            userName=user.full_name,
            workDate=logwork.work_date,
            hours=decimal_to_float(logwork.hours_spent),
            note=logwork.work_content,
            progressPercent=decimal_to_float(logwork.progress_percent),
        )
        for logwork, task, _, user in project_logwork_rows[:6]
    ]

    critical_sprint_count = sum(
        1
        for sprint in sprint_summaries
        if sprint.health == "critical" and sprint.status in {"ACTIVE", "REVIEW"}
    )

    return DashboardOverviewResponse(
        project=selected_project_response,
        portfolioProgress=portfolio_progress,
        projectProgress=project_progress,
        activeSprintProgress=active_sprint.actualProgress if active_sprint else 0,
        logworkCoverage=logwork_coverage,
        criticalAlerts=overdue_count + critical_sprint_count,
        projectsInScope=len(accessible_project_responses),
        openTasksInScope=open_tasks_in_scope,
        taskSummary=DashboardTaskSummaryResponse(
            todo=task_counts["todo"],
            inProgress=task_counts["in_progress"],
            done=task_counts["done"],
            total=len(leaf_tasks),
            overdue=overdue_count,
        ),
        activeSprint=active_sprint,
        sprintSummaries=sprint_summaries,
        overdueTasks=[
            _build_task_preview(
                task,
                assignee_by_task_id.get(task.id, {}).get("name"),
                sprint_by_id[task.sprint_id].name if task.sprint_id in sprint_by_id else None,
            )
            for task in overdue_tasks
        ],
        activeTasks=[
            _build_task_preview(
                task,
                assignee_by_task_id.get(task.id, {}).get("name"),
                sprint_by_id[task.sprint_id].name if task.sprint_id in sprint_by_id else None,
            )
            for task in active_tasks
        ],
        workloadBoard=workload_board,
        recentLogwork=recent_logwork,
    )
