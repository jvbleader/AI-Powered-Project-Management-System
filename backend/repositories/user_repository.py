import math

from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from models.department_model import Department
from models.user_model import User


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()

def get_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()

def get_users(
    db: Session,
    search: str | None = None,
    status: str | None = None,
    role: str | None = None,
    department: str | None = None,
    page: int = 1,
    page_size: int = 10,
):
    query = db.query(User)

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
            query = query.filter(User.is_active == True)
        elif status == "INACTIVE":
            query = query.filter(User.is_active == False)

    if role and role != "ALL":
        query = query.filter(User.role == role)

    if department and department != "ALL":
        if department == "UNASSIGNED":
            query = query.filter(User.department_id == None)
        else:
            query = query.join(User.department).filter(Department.name == department)

    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    users = query.order_by(desc(User.created_at), desc(User.id)).offset((page - 1) * page_size).limit(page_size).all()

    return users, total, total_pages

def create(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def commit_and_refresh(db: Session, user: User) -> User:
    db.commit()
    db.refresh(user)
    return user
