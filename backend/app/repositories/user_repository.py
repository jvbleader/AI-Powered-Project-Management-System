import math

from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload

from app.models.department_model import Department
from app.models.project_model import Role
from app.models.user_model import User
from app.utils.personnel_rank import personnel_rank_sql_order


def _base_query(db: Session):
    return db.query(User).options(
        joinedload(User.department),
        joinedload(User.team),
        joinedload(User.role_ref),
    )


def get_by_id(db: Session, user_id: int) -> User | None:
    return _base_query(db).filter(User.id == user_id).first()


def get_by_email(db: Session, email: str) -> User | None:
    return _base_query(db).filter(User.email == email).first()


def get_users(
    db: Session,
    search: str | None = None,
    status: str | None = None,
    role: str | None = None,
    department: str | None = None,
    user_ids: list[int] | None = None,
    page: int = 1,
    page_size: int = 10,
):
    query = (
        _base_query(db)
        .outerjoin(Role, User.role_id == Role.id)
        .outerjoin(Department, User.department_id == Department.id)
    )

    if user_ids is not None:
        if not user_ids:
            return [], 0, 1
        query = query.filter(User.id.in_(user_ids))

    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                User.email.ilike(search_term),
                User.full_name.ilike(search_term),
            )
        )

    if status and status != "ALL":
        if status == "ACTIVE":
            query = query.filter(User.is_active.is_(True))
        elif status == "INACTIVE":
            query = query.filter(User.is_active.is_(False))

    if role and role != "ALL":
        query = query.filter(Role.name == role)

    if department and department != "ALL":
        if department == "UNASSIGNED":
            query = query.filter(User.department_id.is_(None))
        else:
            query = query.filter(Department.name == department)

    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    users = (
        query.order_by(
            personnel_rank_sql_order(Role.name, Department.name).asc(),
            Role.name.asc(),
            Department.name.asc(),
            User.full_name.asc(),
            User.id.asc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return users, total, total_pages


def list_active_by_department_name(
    db: Session,
    department_name: str,
    *,
    role: str | None = None,
    search: str | None = None,
    exclude_role_names: list[str] | None = None,
) -> list[User]:
    query = (
        _base_query(db)
        .join(User.department)
        .join(User.role_ref)
        .filter(Department.name == department_name, User.is_active.is_(True))
    )

    if role and role != "ALL":
        query = query.filter(Role.name == role)

    if exclude_role_names:
        query = query.filter(~Role.name.in_(exclude_role_names))

    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                User.email.ilike(search_term),
                User.full_name.ilike(search_term),
            )
        )

    return query.order_by(
        personnel_rank_sql_order(Role.name, Department.name).asc(),
        Role.name.asc(),
        User.full_name.asc(),
        User.id.asc(),
    ).all()


def list_user_ids_by_department_ids(db: Session, department_ids: list[int]) -> list[int]:
    if not department_ids:
        return []
    rows = (
        db.query(User.id)
        .filter(User.department_id.in_(department_ids))
        .distinct()
        .all()
    )
    return [user_id for (user_id,) in rows]


def list_user_ids_excluding_roles(db: Session, role_names: list[str]) -> list[int]:
    if not role_names:
        rows = db.query(User.id).distinct().all()
        return [user_id for (user_id,) in rows]

    rows = (
        db.query(User.id)
        .join(User.role_ref)
        .filter(~Role.name.in_(role_names))
        .distinct()
        .all()
    )
    return [user_id for (user_id,) in rows]


def list_user_ids_excluding_role(db: Session, role_name: str) -> list[int]:
    return list_user_ids_excluding_roles(db, [role_name])


def create(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return get_by_id(db, user.id)


def commit_and_refresh(db: Session, user: User) -> User:
    db.commit()
    db.refresh(user)
    return get_by_id(db, user.id)


def update_password(db: Session, user_id: int, hashed_new_password: str) -> None:
    db.query(User).filter(User.id == user_id).update({User.password_hash: hashed_new_password})
    db.commit()
