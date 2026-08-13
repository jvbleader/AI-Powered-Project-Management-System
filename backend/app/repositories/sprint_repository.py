from typing import List, Optional

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models.sprint_model import Sprint


def get_sprint_by_id(db: Session, sprint_id: int) -> Optional[Sprint]:
    return db.query(Sprint).filter(Sprint.id == sprint_id).first()


def get_active_sprint_by_project(db: Session, project_id: int) -> Optional[Sprint]:
    return db.query(Sprint).filter(
        Sprint.project_id == project_id,
        func.lower(Sprint.status) == "active"
    ).first()


def list_sprints(
    db: Session, project_id: Optional[int] = None, project_ids_subquery=None
) -> List[Sprint]:
    query = db.query(Sprint)
    if project_id:
        query = query.filter(Sprint.project_id == project_id)
    if project_ids_subquery is not None:
        query = query.filter(Sprint.project_id.in_(project_ids_subquery))
    return query.order_by(desc(Sprint.start_date), desc(Sprint.id)).all()


def create_sprint(db: Session, sprint_data: dict) -> Sprint:
    sprint = Sprint(**sprint_data)
    db.add(sprint)
    db.flush()
    return sprint


def update_sprint(db: Session, sprint: Sprint, update_data: dict) -> Sprint:
    for key, value in update_data.items():
        if hasattr(sprint, key) and value is not None:
            setattr(sprint, key, value)

    db.flush()
    return sprint
