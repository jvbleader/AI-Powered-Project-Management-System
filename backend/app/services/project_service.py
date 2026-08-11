import math
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.project_model import Project, ProjectMember
from app.models.user_model import User
from app.repositories import project_repository, user_repository
from app.schemas.project_schema import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberUpdate,
    ProjectUpdate,
)
from app.utils.project_helpers import (
    ROLE_ADMIN,
    ROLE_PM,
    get_user_role_name,
    is_admin_user,
    is_head_of_dev_user,
    list_accessible_project_ids,
    list_managed_project_ids,
    to_db_status,
    user_can_access_project,
    user_can_manage_project,
    user_role_requires_manager_scope,
)


def parse_project_id(project_id: str) -> int:
    raw = project_id.replace("prj-", "") if project_id.startswith("prj-") else project_id
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Mã dự án không hợp lệ.")


def _count_active_project_managers(db: Session, project_id: int) -> int:
    members = project_repository.list_project_members(db, project_id)
    count = 0
    for entry in members:
        if user_role_requires_manager_scope(entry[1]):
            count += 1
    return count


def _can_create_projects(current_user: User) -> bool:
    """Chỉ PM/PO/GM hoặc mọi thành viên phòng Head of Dev được tạo dự án."""
    if is_admin_user(current_user):
        return False
    if is_head_of_dev_user(current_user):
        return True
    return get_user_role_name(current_user) == ROLE_PM


def require_project_access(
    db: Session,
    project_id: int,
    current_user: User,
    require_manager: bool = False,
) -> Project:
    project = project_repository.get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")

    if require_manager:
        if not user_can_manage_project(db, project_id, current_user):
            raise HTTPException(
                status_code=403,
                detail="Bạn không có quyền quản lý dự án này.",
            )
    elif not user_can_access_project(db, project_id, current_user):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền truy cập dự án này.",
        )

    return project


def list_project_roles(db: Session):
    from app.models.project_model import Role
    from app.schemas.project_schema import RoleResponse

    roles = db.query(Role).all()
    return [RoleResponse.model_validate(r) for r in roles]


def list_projects(
    db: Session,
    current_user: User,
    search: str | None = None,
    status: str | None = None,
    manager_id: int | None = None,
    start_date_from: date | None = None,
    start_date_to: date | None = None,
    page: int = 1,
    page_size: int = 10,
):
    manager_project_ids = None
    if manager_id is not None:
        manager = project_repository.get_user_by_id(db, manager_id)
        manager_project_ids = list_managed_project_ids(db, manager) if manager else []

    accessible_project_ids = list_accessible_project_ids(db, current_user)
    projects, total = project_repository.list_projects(
        db=db,
        project_ids=accessible_project_ids,
        search=search,
        db_status=to_db_status(status) if status and status != "ALL" else None,
        start_date_from=start_date_from,
        start_date_to=start_date_to,
        manager_project_ids=manager_project_ids,
        page=page,
        page_size=page_size,
    )

    total_pages = math.ceil(total / page_size) if total > 0 else 1
    return projects, total, total_pages


def create_project(db: Session, current_user: User, data: ProjectCreate) -> Project:
    if not _can_create_projects(current_user):
        raise HTTPException(status_code=403, detail="Bạn không có quyền tạo dự án.")

    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Tài khoản đã bị vô hiệu hóa.")

    existing_project = project_repository.get_project_by_name(db, data.name)
    if existing_project:
        raise HTTPException(status_code=400, detail="Tên dự án đã tồn tại. Vui lòng chọn tên khác.")

    # Người tạo luôn là manager của dự án.
    manager_id = current_user.id
    department_id = data.department_id

    from app.models.department_model import Department

    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=400, detail="Phòng ban không tồn tại.")

    if not is_head_of_dev_user(current_user):
        if not current_user.department_id:
            raise HTTPException(status_code=400, detail="Tài khoản chưa gắn phòng ban.")
        if department_id != current_user.department_id:
            raise HTTPException(
                status_code=400,
                detail="Bạn chỉ được tạo dự án thuộc phòng ban của mình.",
            )
        department_id = current_user.department_id

    project = Project(
        department_id=department_id,
        name=data.name,
        project_type=data.project_type,
        description=data.description,
        status="inactive",
        start_date=data.start_date,
        end_date=data.end_date,
        manager_id=manager_id,
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    project = project_repository.create_project(db, project)

    manager_member = ProjectMember(
        project_id=project.id,
        user_id=manager_id,
        joined_at=datetime.now(timezone.utc),
        is_active=True,
    )
    project_repository.add_project_member(db, manager_member)

    db.commit()
    db.refresh(project)
    return project


def get_project(db: Session, current_user: User, project_id: str) -> Project:
    numeric_id = parse_project_id(project_id)
    return require_project_access(db, numeric_id, current_user)


def update_project(
    db: Session, current_user: User, project_id: str, data: ProjectUpdate
) -> Project:
    numeric_id = parse_project_id(project_id)
    project = require_project_access(db, numeric_id, current_user, require_manager=True)

    if data.name:
        existing_project = project_repository.get_project_by_name(db, data.name)
        if existing_project and existing_project.id != project.id:
            raise HTTPException(
                status_code=400, detail="Tên dự án đã tồn tại. Vui lòng chọn tên khác."
            )
        project.name = data.name.strip()
    if data.project_type is not None:
        project.project_type = data.project_type.strip()
    if data.description is not None:
        project.description = data.description.strip()
    if data.status is not None:
        project.status = to_db_status(data.status)
    if data.start_date is not None:
        project.start_date = data.start_date
    if data.end_date is not None:
        if data.start_date and data.end_date < data.start_date:
            raise HTTPException(status_code=400, detail="Ngày kết thúc phải sau ngày bắt đầu.")
        if not data.start_date and project.start_date and data.end_date < project.start_date:
            raise HTTPException(status_code=400, detail="Ngày kết thúc phải sau ngày bắt đầu.")
        project.end_date = data.end_date
    if data.department_id is not None:
        project.department_id = data.department_id

    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


def list_project_members(
    db: Session, current_user: User, project_id: str, search: str | None = None
):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user)
    return project_repository.list_project_members(db, numeric_id, search, include_inactive=True)


def list_member_candidates(
    db: Session,
    current_user: User,
    project_id: str,
    *,
    department: str | None = None,
    role: str | None = None,
    search: str | None = None,
) -> list[User]:
    """Danh sách user theo phòng ban để thêm vào dự án (cho phép mượn cross-department)."""
    numeric_id = parse_project_id(project_id)
    project = require_project_access(db, numeric_id, current_user, require_manager=True)

    department_name = (department or "").strip()
    if not department_name:
        dept = getattr(project, "department", None)
        department_name = getattr(dept, "name", None) or ""
    if not department_name and project.department_id:
        from app.models.department_model import Department

        dept_row = db.query(Department).filter(Department.id == project.department_id).first()
        department_name = dept_row.name if dept_row else ""

    if not department_name:
        raise HTTPException(status_code=400, detail="Vui lòng chọn phòng ban.")

    return user_repository.list_active_by_department_name(
        db,
        department_name,
        role=role,
        search=search,
        exclude_role_names=[ROLE_ADMIN],
    )


def add_project_member(db: Session, current_user: User, project_id: str, data: ProjectMemberCreate):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    user = project_repository.get_user_by_id(db, data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Người dùng đã bị vô hiệu hóa.")

    existing = project_repository.get_project_member(
        db, numeric_id, data.user_id, include_inactive=True
    )
    if existing:
        if getattr(existing, "is_active", True):
            raise HTTPException(status_code=400, detail="Người dùng đã là thành viên dự án.")
        existing.is_active = True
        existing.joined_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing, user, user.role_ref

    member = ProjectMember(
        project_id=numeric_id,
        user_id=data.user_id,
        joined_at=datetime.now(timezone.utc),
        is_active=True,
    )
    project_repository.add_project_member(db, member)
    db.commit()
    db.refresh(member)
    return member, user, user.role_ref


def update_project_member(
    db: Session, current_user: User, project_id: str, member_id: int, data: ProjectMemberUpdate
):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    member = project_repository.get_project_member_by_id(db, member_id, numeric_id)
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên dự án.")

    user = project_repository.get_user_by_id(db, member.user_id)
    current_is_manager = user_role_requires_manager_scope(user)

    db.commit()
    db.refresh(member)

    user = project_repository.get_user_by_id(db, member.user_id)
    return member, user, user.role_ref


def remove_project_member(db: Session, current_user: User, project_id: str, member_id: int):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    member = project_repository.get_project_member_by_id(db, member_id, numeric_id)
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên dự án.")

    user = project_repository.get_user_by_id(db, member.user_id)
    if user_role_requires_manager_scope(user):
        manager_count = _count_active_project_managers(db, numeric_id)
        if manager_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Không thể gỡ quản lý dự án duy nhất.",
            )

    member.is_active = False
    db.commit()
