import math
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from models.project_model import Project, ProjectMember, Role
from models.user_model import User
from schemas.project_schema import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberUpdate,
    ProjectUpdate,
)
from utils.project_helpers import (
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
    project = db.query(Project).filter(Project.id == project_id).first()
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


def scoped_project_query(db: Session, current_user: User):
    query = db.query(Project)
    if not current_user.is_admin:
        member_project_ids = (
            db.query(ProjectMember.project_id)
            .filter(ProjectMember.user_id == current_user.id)
            .subquery()
        )
        query = query.filter(Project.id.in_(member_project_ids))
    return query


def list_project_roles(db: Session):
    ensure_default_roles(db)
    return db.query(Role).order_by(Role.name).all()


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
    query = scoped_project_query(db, current_user)

    if search:
        term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                Project.name.ilike(term),
                Project.description.ilike(term),
            )
        )

    if status and status != "ALL":
        db_status = to_db_status(status)
        query = query.filter(Project.status == db_status)

    if start_date_from:
        query = query.filter(Project.start_date >= start_date_from)

    if start_date_to:
        query = query.filter(Project.start_date <= start_date_to)

    if manager_id:
        pm_role = get_pm_role(db)
        manager_project_ids = (
            db.query(ProjectMember.project_id)
            .filter(
                ProjectMember.user_id == manager_id,
                ProjectMember.role_id == pm_role.id,
            )
            .subquery()
        )
        query = query.filter(Project.id.in_(manager_project_ids))

    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    projects = (
        query.order_by(desc(Project.updated_at), desc(Project.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return projects, total, total_pages


def create_project(db: Session, current_user: User, data: ProjectCreate) -> Project:
    manager = db.query(User).filter(User.id == data.manager_id).first()
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
    db.add(project)
    db.flush()

    manager_member = ProjectMember(
        project_id=project.id,
        user_id=data.manager_id,
        role_id=pm_role.id,
    )
    db.add(manager_member)

    if current_user.id != data.manager_id:
        creator_membership = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == current_user.id,
            )
            .first()
        )
        if not creator_membership:
            developer_role = db.query(Role).filter(Role.name == "DEVELOPER").first()
            db.add(
                ProjectMember(
                    project_id=project.id,
                    user_id=current_user.id,
                    role_id=developer_role.id if developer_role else pm_role.id,
                )
            )

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

    query = (
        db.query(ProjectMember, User, Role)
        .join(User, ProjectMember.user_id == User.id)
        .join(Role, ProjectMember.role_id == Role.id)
        .filter(ProjectMember.project_id == numeric_id)
    )

    if search:
        term = f"%{search.lower()}%"
        query = query.filter(
            or_(User.full_name.ilike(term), User.email.ilike(term))
        )

    return query.order_by(desc(ProjectMember.joined_at)).all()


def add_project_member(
    db: Session, current_user: User, project_id: str, data: ProjectMemberCreate
):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Người dùng đã bị vô hiệu hóa.")

    role = db.query(Role).filter(Role.id == data.role_id).first()
    if not role:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ.")

    existing = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == numeric_id,
            ProjectMember.user_id == data.user_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Người dùng đã là thành viên dự án.")

    member = ProjectMember(
        project_id=numeric_id,
        user_id=data.user_id,
        role_id=data.role_id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    return member, user, role


def update_project_member(
    db: Session, current_user: User, project_id: str, member_id: int, data: ProjectMemberUpdate
):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.id == member_id,
            ProjectMember.project_id == numeric_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên dự án.")

    role = db.query(Role).filter(Role.id == data.role_id).first()
    if not role:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ.")

    pm_role = get_pm_role(db)
    if member.role_id == pm_role.id and data.role_id != pm_role.id:
        pm_count = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == numeric_id,
                ProjectMember.role_id == pm_role.id,
            )
            .count()
        )
        if pm_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Không thể thay đổi vai trò của quản lý dự án duy nhất.",
            )

    member.role_id = data.role_id
    db.commit()
    db.refresh(member)

    user = db.query(User).filter(User.id == member.user_id).first()
    return member, user, role


def remove_project_member(db: Session, current_user: User, project_id: str, member_id: int):
    numeric_id = parse_project_id(project_id)
    require_project_access(db, numeric_id, current_user, require_manager=True)

    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.id == member_id,
            ProjectMember.project_id == numeric_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên dự án.")

    pm_role = get_pm_role(db)
    if member.role_id == pm_role.id:
        pm_count = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == numeric_id,
                ProjectMember.role_id == pm_role.id,
            )
            .count()
        )
        if pm_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Không thể gỡ quản lý dự án duy nhất.",
            )

    db.delete(member)
    db.commit()
