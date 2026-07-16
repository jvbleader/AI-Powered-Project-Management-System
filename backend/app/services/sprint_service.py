from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories import sprint_repository
from app.schemas.sprint_schema import SprintCreate, SprintUpdate
from app.utils.project_helpers import user_can_manage_project
from app.services.task_service import (
    _get_or_create_actor_member,
    _require_project_access,
)

def list_sprints(db: Session, project_id: int, current_user_id: int):
    _require_project_access(db, project_id, current_user_id)
    return sprint_repository.list_sprints(db, project_id)

def create_sprint(db: Session, project_id: int, current_user_id: int, sprint_in: SprintCreate):
    current_user = _require_project_access(db, project_id, current_user_id)
    if not user_can_manage_project(db, project_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền tạo sprint trong dự án này.",
        )
    actor_member = _get_or_create_actor_member(db, project_id, current_user_id)
    
    sprint_data = sprint_in.model_dump()
    sprint_data["project_id"] = project_id
    sprint_data["created_by_member_id"] = actor_member.id
    
    sprint = sprint_repository.create_sprint(db, sprint_data)
    db.commit()
    db.refresh(sprint)
    return sprint

def update_sprint(db: Session, sprint_id: int, current_user_id: int, sprint_in: SprintUpdate):
    sprint = sprint_repository.get_sprint_by_id(db, sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")
        
    current_user = _require_project_access(db, sprint.project_id, current_user_id)
    if not user_can_manage_project(db, sprint.project_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền cập nhật sprint trong dự án này.",
        )
    
    update_data = sprint_in.model_dump(exclude_unset=True)
    sprint = sprint_repository.update_sprint(db, sprint, update_data)
    db.commit()
    db.refresh(sprint)
    return sprint
