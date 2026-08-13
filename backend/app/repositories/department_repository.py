from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.department_model import Department, Team
from app.models.project_model import Project
from app.models.user_model import User


def get_all(db: Session) -> list[Department]:
    return db.query(Department).order_by(Department.name.asc()).all()


def get_by_id(db: Session, department_id: int) -> Department | None:
    return db.query(Department).filter(Department.id == department_id).first()


def get_by_name(db: Session, name: str, exclude_id: int | None = None) -> Department | None:
    query = db.query(Department).filter(Department.name == name)
    if exclude_id is not None:
        query = query.filter(Department.id != exclude_id)
    return query.first()


def create(
    db: Session,
    name: str,
    description: str | None = "Created from the user administration flow",
) -> Department:
    dept = Department(
        name=name,
        description=description,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


def update(db: Session, department: Department) -> Department:
    department.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(department)
    return department


def delete(db: Session, department: Department) -> None:
    db.delete(department)
    db.commit()


def count_users(db: Session, department_id: int) -> int:
    return db.query(func.count(User.id)).filter(User.department_id == department_id).scalar() or 0


def count_projects(db: Session, department_id: int) -> int:
    return (
        db.query(func.count(Project.id)).filter(Project.department_id == department_id).scalar() or 0
    )


def count_teams(db: Session, department_id: int) -> int:
    return db.query(func.count(Team.id)).filter(Team.department_id == department_id).scalar() or 0


def usage_counts(db: Session) -> dict[int, dict[str, int]]:
    user_rows = db.query(User.department_id, func.count(User.id)).group_by(User.department_id).all()
    project_rows = (
        db.query(Project.department_id, func.count(Project.id)).group_by(Project.department_id).all()
    )
    team_rows = db.query(Team.department_id, func.count(Team.id)).group_by(Team.department_id).all()

    counts: dict[int, dict[str, int]] = {}
    for department_id, total in user_rows:
        if department_id is None:
            continue
        counts.setdefault(department_id, {"user_count": 0, "project_count": 0, "team_count": 0})
        counts[department_id]["user_count"] = total
    for department_id, total in project_rows:
        if department_id is None:
            continue
        counts.setdefault(department_id, {"user_count": 0, "project_count": 0, "team_count": 0})
        counts[department_id]["project_count"] = total
    for department_id, total in team_rows:
        if department_id is None:
            continue
        counts.setdefault(department_id, {"user_count": 0, "project_count": 0, "team_count": 0})
        counts[department_id]["team_count"] = total
    return counts
