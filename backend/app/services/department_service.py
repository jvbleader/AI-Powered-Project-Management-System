from sqlalchemy.orm import Session

from app.models.department_model import Department
from app.repositories import department_repository


def get_departments(db: Session) -> list[Department]:
    return department_repository.get_all(db)
