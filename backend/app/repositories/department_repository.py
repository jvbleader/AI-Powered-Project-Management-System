from sqlalchemy.orm import Session

from app.models.department_model import Department


def get_all(db: Session) -> list[Department]:
    return db.query(Department).all()

def get_by_name(db: Session, name: str) -> Department | None:
    return db.query(Department).filter(Department.name == name).first()

def create(db: Session, name: str) -> Department:
    dept = Department(name=name)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept
