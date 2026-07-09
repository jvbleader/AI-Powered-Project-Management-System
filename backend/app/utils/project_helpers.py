import math
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.models.project_model import Project, ProjectMember, Role
from app.repositories import project_repository
from app.models.task_model import Task
from app.models.user_model import User
from app.schemas.project_schema import (
    ProjectDetailResponse,
    ProjectMemberResponse,
    ProjectMetricsResponse,
    ProjectResponse,
)

PM_ROLE_NAME = "PROJECT_MANAGER"
DEVELOPER_ROLE_NAME = "DEVELOPER"


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


def compute_project_metrics(db: Session, project_id: int) -> ProjectMetricsResponse:
    tasks = project_repository.get_project_tasks(db, project_id)
    if not tasks:
        return ProjectMetricsResponse()

    today = datetime.now(timezone.utc).date()
    completed = sum(1 for task in tasks if task.status == "done")
    overdue = sum(
        1
        for task in tasks
        if task.deadline and task.deadline < today and task.status != "done"
    )
    total = len(tasks)
    progress = round((completed / total) * 100) if total else 0

    return ProjectMetricsResponse(
        completedTasks=completed,
        overdueTasks=overdue,
        logworkCoverage=0,
        velocity=progress,
        totalTasks=total,
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
    )


def build_project_response(
    db: Session,
    project: Project,
    include_members: bool = False,
) -> ProjectDetailResponse | ProjectResponse:
    members = project_repository.list_project_members(db, project.id)

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


def user_is_project_member(db: Session, project_id: int, user_id: int) -> bool:
    return project_repository.get_project_member(db, project_id, user_id) is not None


def paginate(total: int, page: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total > 0 else 1
