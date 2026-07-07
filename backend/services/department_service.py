from sqlalchemy.orm import Session

from models.department_model import Department
from repositories import department_repository


def get_departments(db: Session) -> list[Department]:
    return department_repository.get_all(db)
