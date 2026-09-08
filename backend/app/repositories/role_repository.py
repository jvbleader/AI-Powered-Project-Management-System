from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.project_model import Role
from app.models.user_model import User


def get_all(db: Session) -> list[Role]:
    return db.query(Role).order_by(Role.name.asc()).all()


def get_by_id(db: Session, role_id: int) -> Role | None:
    return db.query(Role).filter(Role.id == role_id).first()


def get_by_name(db: Session, name: str, exclude_id: int | None = None) -> Role | None:
    query = db.query(Role).filter(Role.name == name)
    if exclude_id is not None:
        query = query.filter(Role.id != exclude_id)
    return query.first()


def create(
    db: Session,
    name: str,
    description: str | None = None,
    is_admin: bool = False,
) -> Role:
    role = Role(
        name=name,
        description=description,
        is_admin=is_admin,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def update(db: Session, role: Role) -> Role:
    role.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(role)
    return role


def delete(db: Session, role: Role) -> None:
    db.delete(role)
    db.commit()


def count_users(db: Session, role_id: int) -> int:
    return db.query(func.count(User.id)).filter(User.role_id == role_id).scalar() or 0


def count_admin_roles(db: Session, exclude_id: int | None = None) -> int:
    query = db.query(func.count(Role.id)).filter(Role.is_admin.is_(True))
    if exclude_id is not None:
        query = query.filter(Role.id != exclude_id)
    return query.scalar() or 0


def usage_counts(db: Session) -> dict[int, int]:
    rows = db.query(User.role_id, func.count(User.id)).group_by(User.role_id).all()
    return {role_id: total for role_id, total in rows if role_id is not None}
