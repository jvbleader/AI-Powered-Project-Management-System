from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import List, Optional

from app.repositories import sprint_repository, project_repository
from app.schemas.sprint_schema import SprintCreate, SprintUpdate
from app.models.sprint_model import Sprint
from app.services.task_service import _check_project_access

def list_sprints(db: Session, project_id: int, current_user_id: int):
    _check_project_access(db, project_id, current_user_id)
    return sprint_repository.list_sprints(db, project_id)

def create_sprint(db: Session, project_id: int, current_user_id: int, sprint_in: SprintCreate):
    member = _check_project_access(db, project_id, current_user_id)
    member_id = member.id if member else 1
    
    sprint_data = sprint_in.model_dump()
    sprint_data["project_id"] = project_id
    sprint_data["created_by_member_id"] = member_id
    
    sprint = sprint_repository.create_sprint(db, sprint_data)
    db.commit()
    db.refresh(sprint)
    return sprint

def update_sprint(db: Session, sprint_id: int, current_user_id: int, sprint_in: SprintUpdate):
    sprint = sprint_repository.get_sprint_by_id(db, sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")
        
    _check_project_access(db, sprint.project_id, current_user_id)
    
    update_data = sprint_in.model_dump(exclude_unset=True)
    sprint = sprint_repository.update_sprint(db, sprint, update_data)
    db.commit()
    db.refresh(sprint)
    return sprint
