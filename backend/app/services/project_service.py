import math
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.project_model import Project, ProjectMember
from app.models.user_model import User
from app.repositories import project_repository
from app.schemas.project_schema import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberUpdate,
    ProjectUpdate,
)
from app.utils.project_helpers import (
    ensure_default_roles,
    get_pm_role,
    to_db_status,
    user_is_project_manager,
    user_is_project_member,
)


def parse_project_id(project_id: str) -> int:
    raw = project_id.replace("prj-", "") if project_id.startswith("prj-") else project_id
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Mã dự án không hợp lệ.")


def require_project_access(
    db: Session, project_id: int, current_user: User, require_manager: bool = False
) -> Project:
    project = project_repository.get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")

    if current_user.is_admin:
        return project

    if require_manager:
        if not user_is_project_manager(db, project_id, current_user.id):
            raise HTTPException(
                status_code=403,
                detail="Bạn không có quyền quản lý dự án này.",
            )
    elif not user_is_project_member(db, project_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền truy cập dự án này.",
        )

    return project


def list_project_roles(db: Session):
    ensure_default_roles(db)
    return project_repository.list_all_roles(db)


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
    pm_role = get_pm_role(db) if manager_id else None
    
    projects, total = project_repository.list_projects(
        db=db,
        is_admin=current_user.is_admin,
        current_user_id=current_user.id,
        search=search,
        db_status=to_db_status(status) if status and status != "ALL" else None,
        start_date_from=start_date_from,
        start_date_to=start_date_to,
        manager_id=manager_id,
        pm_role_id=pm_role.id if pm_role else None,
        page=page,
        page_size=page_size
    )

    total_pages = math.ceil(total / page_size) if total > 0 else 1
    return projects, total, total_pages


def create_project(db: Session, current_user: User, data: ProjectCreate) -> Project:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Chỉ có Admin mới có quyền tạo dự án.")

    manager = project_repository.get_user_by_id(db, data.manager_id)
    if not manager:
        raise HTTPException(status_code=400, detail="Người quản lý không tồn tại.")

    if not manager.is_active:
        raise HTTPException(status_code=400, detail="Người quản lý đã bị vô hiệu hóa.")

    ensure_default_roles(db)
    pm_role = get_pm_role(db)

    project = Project(
        name=data.name,
        description=data.description,
        status="inactive",
        start_date=data.start_date,
        end_date=data.end_date,
        created_by=current_user.id,
    )
    project = project_repository.create_project(db, project)

    manager_member = ProjectMember(
        project_id=project.id,
        user_id=data.manager_id,
        role_id=pm_role.id,
    )
    project_repository.add_project_member(db, manager_member)

    if current_user.id != data.manager_id:
        creator_membership = project_repository.get_project_member(db, project.id, current_user.id)
        if not creator_membership:
            developer_role = project_repository.get_role_by_name(db, "DEVELOPER")
            project_repository.add_project_member(db, ProjectMember(
                project_id=project.id,
                user_id=current_user.id,
                role_id=developer_role.id if developer_role else pm_role.id,
            ))

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

    if data.name is not None:
        project.name = data.name.strip()
    if data.description is not None:
        project.description = data.description.strip()
    if data.status is not None:
        project.status = to_db_status(data.status)
    if data.start_date is not None:
        project.start_date = data.start_date
    if data.end_date is not None:
        if data.start_date and data.end_date < data.start_date:
            raise HTTPException(
                status_code=400,
                detail="Ngày kết thúc phải sau ngày bắt đầu.",
            )
        if not data.start_date and project.start_date and data.end_date < project.start_date:
            raise HTTPException(
                status_code=400,
                detail="Ngày kết thúc phải sau ngày bắt đầu.",
            )
        project.end_date = data.end_date

    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


def list_project_members(db: Session, current_user: User, project_id: str, search: str | None = None):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user)
    return project_repository.list_project_members(db, numeric_id, search)


def add_project_member(
    db: Session, current_user: User, project_id: str, data: ProjectMemberCreate
):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    user = project_repository.get_user_by_id(db, data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Người dùng đã bị vô hiệu hóa.")

    role = project_repository.get_role_by_id(db, data.role_id)
    if not role:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ.")

    existing = project_repository.get_project_member(db, numeric_id, data.user_id)
    if existing:
        raise HTTPException(status_code=400, detail="Người dùng đã là thành viên dự án.")

    member = ProjectMember(
        project_id=numeric_id,
        user_id=data.user_id,
        role_id=data.role_id,
    )
    project_repository.add_project_member(db, member)
    db.commit()
    db.refresh(member)

    return member, user, role


def update_project_member(
    db: Session, current_user: User, project_id: str, member_id: int, data: ProjectMemberUpdate
):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    member = project_repository.get_project_member_by_id(db, member_id, numeric_id)
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên dự án.")

    role = project_repository.get_role_by_id(db, data.role_id)
    if not role:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ.")

    pm_role = get_pm_role(db)
    if member.role_id == pm_role.id and data.role_id != pm_role.id:
        pm_count = project_repository.count_project_role(db, numeric_id, pm_role.id)
        if pm_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Không thể thay đổi vai trò của quản lý dự án duy nhất.",
            )

    member.role_id = data.role_id
    db.commit()
    db.refresh(member)

    user = project_repository.get_user_by_id(db, member.user_id)
    return member, user, role


def remove_project_member(db: Session, current_user: User, project_id: str, member_id: int):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    member = project_repository.get_project_member_by_id(db, member_id, numeric_id)
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên dự án.")

    pm_role = get_pm_role(db)
    if member.role_id == pm_role.id:
        pm_count = project_repository.count_project_role(db, numeric_id, pm_role.id)
        if pm_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Không thể gỡ quản lý dự án duy nhất.",
            )

    project_repository.delete_project_member(db, member)
    db.commit()
