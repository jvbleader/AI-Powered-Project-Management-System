from types import SimpleNamespace
import math
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.models.project_model import Project, ProjectMember, Role
from app.repositories import project_repository
from app.models.user_model import User
from app.schemas.project_schema import (
    ProjectDetailResponse,
    ProjectMemberResponse,
    ProjectMetricsResponse,
    ProjectResponse,
)
from app.repositories import task_repository
from app.utils.dashboard_helpers import (
    build_task_progress_map,
    calculate_logwork_coverage,
    calculate_progress_percent,
    count_overdue_tasks,
    count_task_statuses,
    list_leaf_tasks,
    normalize_task_status,
)

PM_ROLE_NAME = "PROJECT_MANAGER"
DEVELOPER_ROLE_NAME = "DEVELOPER"
SYSTEM_PROJECT_MANAGEMENT_ROLES = {"MANAGER", "LEADER"}

def build_project_code(name: str) -> str:
    words = (
        name.strip()
        .split()
    )
    parts = [
        word.replace(" ", "").upper()
        for word in words[:3]
        if word.replace(" ", "").isalnum() or any(c.isalnum() for c in word)
    ]
    code_suffix = "".join(
        "".join(c for c in word if c.isalnum()).upper()
        for word in words[:3]
    )[:8]
    return f"FP-{code_suffix or 'NEW'}"


def to_frontend_status(db_status: str) -> str:
    mapping = {
        "active": "ACTIVE",
        "inactive": "PLANNING",
        "completed": "COMPLETED",
        "at_risk": "AT_RISK",
    }
    return mapping.get(db_status, "ACTIVE")


def to_db_status(frontend_status: str) -> str:
    mapping = {
        "ACTIVE": "active",
        "PLANNING": "inactive",
        "COMPLETED": "completed",
        "AT_RISK": "at_risk",
    }
    return mapping.get(frontend_status.upper(), "active")


def ensure_default_roles(db: Session) -> dict[str, int]:
    role_names = [PM_ROLE_NAME, DEVELOPER_ROLE_NAME, "QA", "VIEWER"]
    role_map: dict[str, int] = {}

    for role_name in role_names:
        role = project_repository.get_role_by_name(db, role_name)
        if not role:
            role = project_repository.create_role(db, role_name)
        role_map[role_name] = role.id

    db.commit()
    return role_map


def get_pm_role(db: Session) -> Role:
    role = project_repository.get_role_by_name(db, PM_ROLE_NAME)
    if not role:
        ensure_default_roles(db)
        role = project_repository.get_role_by_name(db, PM_ROLE_NAME)
    if not role:
        raise RuntimeError("Không tìm thấy vai trò PROJECT_MANAGER.")
    return role


def is_admin_user(user: User | None) -> bool:
    return bool(user and (getattr(user, "is_admin", False) or getattr(user, "role", None) == "ADMIN"))


def user_has_system_project_management_role(user: User | None) -> bool:
    return bool(user and getattr(user, "role", None) in SYSTEM_PROJECT_MANAGEMENT_ROLES)


def compute_project_metrics(db: Session, project_id: int) -> ProjectMetricsResponse:
    tasks = project_repository.get_project_tasks(db, project_id)
    if not tasks:
        return ProjectMetricsResponse()

    project_logworks = task_repository.list_project_logworks(db, project_id)
    progress_by_task = build_task_progress_map(project_logworks)

    leaf_tasks = list_leaf_tasks(tasks)
    counts = count_task_statuses(tasks)
    overdue = count_overdue_tasks(tasks)
    progress = calculate_progress_percent(tasks, progress_by_task)
    members = project_repository.list_project_members(db, project_id, include_inactive=False)
    member_user_ids = [user.id for _, user, _ in members]
    member_user_ids_by_member_id = {member.id: user.id for member, user, _ in members}

    coverage_logworks = [
        SimpleNamespace(
            user_id=member_user_ids_by_member_id.get(logwork.project_member_id),
            work_date=logwork.work_date,
        )
        for logwork in project_logworks
        if member_user_ids_by_member_id.get(logwork.project_member_id) is not None
    ]
    logwork_coverage = calculate_logwork_coverage(member_user_ids, coverage_logworks)

    return ProjectMetricsResponse(
        completedTasks=counts["done"],
        overdueTasks=overdue,
        logworkCoverage=logwork_coverage,
        velocity=progress,
        totalTasks=len(leaf_tasks),
    )


def build_member_response(member: ProjectMember, user: User, role: Role) -> ProjectMemberResponse:
    return ProjectMemberResponse(
        id=member.id,
        userId=user.id,
        userName=user.full_name,
        userEmail=user.email,
        roleId=role.id,
        roleName=role.name,
        joinedAt=member.joined_at,
        isActive=getattr(member, 'is_active', True)
    )


def build_project_response(
    db: Session,
    project: Project,
    include_members: bool = False,
) -> ProjectDetailResponse | ProjectResponse:
    members = project_repository.list_project_members(db, project.id, include_inactive=False)

    pm_role = get_pm_role(db)
    manager_member = next(
        (entry for entry in members if entry[2].id == pm_role.id),
        None,
    )
    manager_id = manager_member[1].id if manager_member else None
    manager_name = manager_member[1].full_name if manager_member else None
    member_ids = [entry[1].id for entry in members]
    metrics = compute_project_metrics(db, project.id)
    progress = metrics.velocity if metrics.totalTasks else 0

    base = ProjectResponse(
        id=project.id,
        code=build_project_code(project.name),
        name=project.name,
        description=project.description,
        status=to_frontend_status(project.status),
        progress=progress,
        managerId=manager_id,
        managerName=manager_name,
        memberIds=member_ids,
        startDate=project.start_date,
        endDate=project.end_date,
        createdBy=project.created_by,
        createdAt=project.created_at,
        updatedAt=project.updated_at,
        metrics=metrics,
    )

    if not include_members:
        return base

    member_responses = [
        build_member_response(member, user, role)
        for member, user, role in members
    ]

    return ProjectDetailResponse(**base.model_dump(), members=member_responses)


def user_is_project_manager(db: Session, project_id: int, user_id: int) -> bool:
    pm_role = get_pm_role(db)
    membership = project_repository.get_project_member_with_role(db, project_id, user_id, pm_role.id)
    return membership is not None


def user_is_project_manager_any(db: Session, user_id: int) -> bool:
    pm_role = get_pm_role(db)
    return bool(project_repository.list_manager_project_ids(db, user_id, pm_role.id))


def user_is_project_member(db: Session, project_id: int, user_id: int) -> bool:
    return project_repository.get_project_member(db, project_id, user_id) is not None


def list_accessible_project_ids(db: Session, user: User | None) -> list[int]:
    if not user:
        return []
    return project_repository.list_member_project_ids(db, user.id)


def list_managed_project_ids(db: Session, user: User | None) -> list[int]:
    if not user:
        return []

    accessible_project_ids = set(list_accessible_project_ids(db, user))
    if not accessible_project_ids:
        return []

    if user_has_system_project_management_role(user):
        return sorted(accessible_project_ids)

    pm_role = get_pm_role(db)
    project_manager_ids = set(project_repository.list_manager_project_ids(db, user.id, pm_role.id))
    return sorted(accessible_project_ids.intersection(project_manager_ids))


def user_can_access_team_directory(db: Session, user: User | None) -> bool:
    if is_admin_user(user):
        return True

    return bool(list_managed_project_ids(db, user))


def user_can_manage_project(db: Session, project_id: int, user: User | None) -> bool:
    if is_admin_user(user):
        return True

    if not user:
        return False

    if user_has_system_project_management_role(user) and user_is_project_member(db, project_id, user.id):
        return True

    return user_is_project_manager(db, project_id, user.id)


def paginate(total: int, page: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total > 0 else 1
