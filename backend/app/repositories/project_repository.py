from datetime import date
from typing import List, Optional, Tuple

from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload

from app.models.project_model import Project, ProjectMember, Role
from app.models.task_model import Task
from app.models.user_model import User



def _active_project_member_filter():
    return or_(ProjectMember.is_active.is_(True), ProjectMember.is_active.is_(None))


def get_role_by_name(db: Session, name: str) -> Optional[Role]:
    return db.query(Role).filter(Role.name == name).first()


def get_role_by_id(db: Session, role_id: int) -> Optional[Role]:
    return db.query(Role).filter(Role.id == role_id).first()


def list_all_roles(db: Session) -> List[Role]:
    return db.query(Role).order_by(Role.name).all()


def create_role(db: Session, name: str) -> Role:
    role = Role(name=name)
    db.add(role)
    db.flush()
    return role


def get_project_by_id(db: Session, project_id: int) -> Optional[Project]:
    return db.query(Project).filter(Project.id == project_id).first()


def get_project_by_name(db: Session, name: str) -> Optional[Project]:
    return db.query(Project).filter(Project.name == name).first()


def list_all_project_ids(db: Session) -> List[int]:
    rows = db.query(Project.id).all()
    return [project_id for (project_id,) in rows]


def list_member_project_ids(
    db: Session,
    user_id: int,
    manager_only: bool = False,
) -> List[int]:
    query = db.query(ProjectMember.project_id).filter(
        ProjectMember.user_id == user_id,
        _active_project_member_filter(),
    )
    if manager_only:
        # User is already known to be a manager from the helper check,
        # but if we wanted to filter here, we would need to join User and Role.
        # Since the helper only calls this if the user is a manager, this is fine.
        pass

    rows = query.distinct().all()
    return [project_id for (project_id,) in rows]


def list_projects(
    db: Session,
    project_ids: Optional[List[int]] = None,
    search: Optional[str] = None,
    db_status: Optional[str] = None,
    start_date_from: Optional[date] = None,
    start_date_to: Optional[date] = None,
    manager_project_ids: Optional[List[int]] = None,
    page: int = 1,
    page_size: int = 10,
) -> Tuple[List[Project], int]:
    query = db.query(Project)

    if project_ids is not None:
        if not project_ids:
            return [], 0
        query = query.filter(Project.id.in_(project_ids))

    if search:
        term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                Project.name.ilike(term),
                Project.description.ilike(term),
            )
        )

    if db_status:
        query = query.filter(Project.status == db_status)

    if start_date_from:
        query = query.filter(Project.start_date >= start_date_from)

    if start_date_to:
        query = query.filter(Project.start_date <= start_date_to)

    if manager_project_ids is not None:
        if not manager_project_ids:
            return [], 0
        query = query.filter(Project.id.in_(manager_project_ids))

    total = query.count()
    projects = (
        query.order_by(desc(Project.updated_at), desc(Project.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return projects, total


def create_project(db: Session, project: Project) -> Project:
    db.add(project)
    db.flush()
    return project


def get_project_member(
    db: Session,
    project_id: int,
    user_id: int,
    include_inactive: bool = False,
) -> Optional[ProjectMember]:
    query = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    )
    if not include_inactive:
        query = query.filter(_active_project_member_filter())
    return query.first()


def get_project_member_by_id(
    db: Session,
    member_id: int,
    project_id: int,
    include_inactive: bool = False,
) -> Optional[ProjectMember]:
    query = db.query(ProjectMember).filter(
        ProjectMember.id == member_id,
        ProjectMember.project_id == project_id,
    )
    if not include_inactive:
        query = query.filter(_active_project_member_filter())
    return query.first()


def list_project_members(
    db: Session,
    project_id: int,
    search: Optional[str] = None,
    include_inactive: bool = False,
):
    query = (
        db.query(ProjectMember, User, Role)
        .join(User, ProjectMember.user_id == User.id)
        .join(Role, User.role_id == Role.id)
        .options(joinedload(User.department), joinedload(User.team), joinedload(User.role_ref))
        .filter(ProjectMember.project_id == project_id)
    )
    if not include_inactive:
        query = query.filter(_active_project_member_filter())
    if search:
        term = f"%{search.lower()}%"
        query = query.filter(or_(User.full_name.ilike(term), User.email.ilike(term)))
    return query.order_by(desc(ProjectMember.joined_at), desc(ProjectMember.id)).all()


def list_project_user_ids(
    db: Session,
    project_ids: List[int],
    include_inactive: bool = False,
) -> List[int]:
    if not project_ids:
        return []

    query = db.query(ProjectMember.user_id).filter(ProjectMember.project_id.in_(project_ids))
    if not include_inactive:
        query = query.filter(_active_project_member_filter())

    rows = query.distinct().all()
    return [user_id for (user_id,) in rows]





def add_project_member(db: Session, member: ProjectMember) -> ProjectMember:
    db.add(member)
    db.flush()
    return member


def delete_project_member(db: Session, member: ProjectMember) -> None:
    db.delete(member)
    db.flush()


def get_project_tasks(db: Session, project_id: int) -> List[Task]:
    return db.query(Task).filter(Task.project_id == project_id).all()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return (
        db.query(User)
        .options(joinedload(User.department), joinedload(User.team), joinedload(User.role_ref))
        .filter(User.id == user_id)
        .first()
    )
