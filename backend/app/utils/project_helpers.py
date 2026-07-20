import math

from sqlalchemy.orm import Session

from app.models.project_model import Project, ProjectMember
from app.models.user_model import User
from app.repositories import project_repository
from app.schemas.project_schema import (
    ProjectDetailResponse,
    ProjectMemberResponse,
    ProjectMetricsResponse,
    ProjectResponse,
    RoleResponse,
)
from app.repositories import task_repository
from app.utils.dashboard_helpers import (
    build_task_progress_map,
    calculate_logwork_coverage,
    calculate_progress_percent,
    count_overdue_tasks,
    count_task_statuses,
    list_leaf_tasks,
)

ROLE_PM = "Project Manager / Product Owner / Group Member"
ROLE_LEADER = "Leader"
ROLE_DIRECTOR = "Giám đốc"
ROLE_ADMIN = "Admin"
DEPARTMENT_HEAD_OF_DEV = "Head of Dev"

def list_project_role_names() -> list[str]:
    return ["Manager", "Member"]

def project_role_options() -> list[RoleResponse]:
    return [
        RoleResponse(id=1, name="Manager"),
        RoleResponse(id=2, name="Member"),
    ]

def normalize_project_role_name(name: str | None) -> str:
    return (name or "").strip()

def project_role_name_from_user(user: User | None) -> str:
    if not user:
        return "Member"
    if user_role_requires_manager_scope(user):
        return "Manager"
    return "Member"

def project_role_id_from_user(user: User | None) -> int:
    return 1 if user_role_requires_manager_scope(user) else 2


def build_project_code(name: str) -> str:
    words = name.strip().split()
    code_suffix = "".join("".join(c for c in word if c.isalnum()).upper() for word in words[:3])[:8]
    return f"FP-{code_suffix or 'NEW'}" 


def to_frontend_status(db_status: str) -> str:
    mapping = {
        "active": "ACTIVE",
        "inactive": "PLANNING",
        "completed": "COMPLETED",
        "at_risk": "AT_RISK",
    }
    return mapping.get((db_status or "").lower(), "ACTIVE")


def to_db_status(frontend_status: str) -> str:
    mapping = {
        "ACTIVE": "active",
        "PLANNING": "inactive",
        "COMPLETED": "completed",
        "AT_RISK": "at_risk",
    }
    return mapping.get((frontend_status or "").upper(), "active")


def get_user_role_name(user: User | None) -> str:
    return (getattr(user, "role", "") or "").strip()


def is_admin_user(user: User | None) -> bool:
    return get_user_role_name(user) == ROLE_ADMIN


def is_director_user(user: User | None) -> bool:
    return get_user_role_name(user) == ROLE_DIRECTOR


def is_head_of_dev_user(user: User | None) -> bool:
    department_name = getattr(getattr(user, "department", None), "name", None)
    return (department_name or "").strip() == DEPARTMENT_HEAD_OF_DEV


def has_companywide_project_access(user: User | None) -> bool:
    return is_director_user(user) or is_head_of_dev_user(user)


def user_role_requires_manager_scope(user: User | None) -> bool:
    return get_user_role_name(user) in {ROLE_PM, ROLE_LEADER}


def compute_project_metrics(db: Session, project_id: int) -> ProjectMetricsResponse:
    tasks = project_repository.get_project_tasks(db, project_id)
    if not tasks:
        return ProjectMetricsResponse()

    project_logworks = task_repository.list_project_logworks(db, project_id)
    progress_by_task = build_task_progress_map(project_logworks)

    leaf_tasks = list_leaf_tasks(tasks)
    counts = count_task_statuses(tasks)
    overdue = count_overdue_tasks(tasks, include_parent_tasks=True)
    progress = calculate_progress_percent(tasks, progress_by_task)
    members = project_repository.list_project_members(db, project_id, include_inactive=False)
    member_user_ids = [user.id for _, user, _ in members]
    member_user_ids_by_member_id = {member.id: user.id for member, user, _ in members}

    coverage_logworks = [
        type(
            "CoverageLogwork",
            (),
            {
                "user_id": member_user_ids_by_member_id.get(logwork.project_member_id),
                "work_date": logwork.work_date,
            },
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


def build_member_response(member: ProjectMember, user: User, _user_role) -> ProjectMemberResponse:
    role_name = _user_role.name if _user_role else "Member"
    role_id = _user_role.id if _user_role else 0
    return ProjectMemberResponse(
        id=member.id,
        userId=user.id,
        userName=user.full_name,
        userEmail=user.email,
        roleId=role_id,
        roleName=role_name,
        joinedAt=member.joined_at,
        isActive=getattr(member, "is_active", True) and getattr(user, "is_active", True),
    )


def build_project_response(
    db: Session,
    project: Project,
    include_members: bool = False,
) -> ProjectDetailResponse | ProjectResponse:
    members = project_repository.list_project_members(db, project.id, include_inactive=False)

    manager_id = project.manager_id
    manager_name = project.manager.full_name if project.manager else None
    member_ids = [entry[1].id for entry in members]
    metrics = compute_project_metrics(db, project.id)
    progress = metrics.velocity if metrics.totalTasks else 0

    from app.models.department_model import Department
    department = db.query(Department).filter(Department.id == project.department_id).first()

    base = ProjectResponse(
        id=project.id,
        code=build_project_code(project.name),
        name=project.name,
        projectType=getattr(project, "project_type", "agile"),
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
        departmentId=project.department_id,
        departmentName=department.name if department else None,
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
    membership = project_repository.get_project_member(db, project_id, user_id)
    if not membership:
        return False
    user = db.query(User).filter(User.id == user_id).first()
    return user_role_requires_manager_scope(user)


def user_is_project_member(db: Session, project_id: int, user_id: int) -> bool:
    return project_repository.get_project_member(db, project_id, user_id) is not None


def list_accessible_project_ids(db: Session, user: User | None) -> list[int]:
    if not user or is_admin_user(user):
        return []

    if has_companywide_project_access(user):
        return sorted(project_repository.list_all_project_ids(db))

    if user_role_requires_manager_scope(user):
        return sorted(project_repository.list_member_project_ids(db, user.id, manager_only=True))

    return sorted(project_repository.list_member_project_ids(db, user.id))


def list_managed_project_ids(db: Session, user: User | None) -> list[int]:
    if not user or is_admin_user(user):
        return []
    return sorted(project_repository.list_member_project_ids(db, user.id, manager_only=True))


def user_can_access_team_directory(db: Session, user: User | None) -> bool:
    if is_admin_user(user):
        return True
    if has_companywide_project_access(user):
        return True
    return bool(list_managed_project_ids(db, user))


def user_can_access_project(db: Session, project_id: int, user: User | None) -> bool:
    if not user or is_admin_user(user):
        return False

    if has_companywide_project_access(user):
        return True

    membership = project_repository.get_project_member(db, project_id, user.id)
    return membership is not None


def user_can_manage_project(db: Session, project_id: int, user: User | None) -> bool:
    if not user or is_admin_user(user):
        return False

    membership = project_repository.get_project_member(db, project_id, user.id)
    return bool(membership) and user_role_requires_manager_scope(user)


def paginate(total: int, page: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total > 0 else 1
