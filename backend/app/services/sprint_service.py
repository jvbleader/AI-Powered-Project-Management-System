from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories import sprint_repository
from app.schemas.sprint_schema import SprintCreate, SprintUpdate
from app.services.task_service import (
    _get_current_user,
    _get_or_create_actor_member,
    _require_project_access,
)
from app.utils.project_helpers import (
    has_companywide_project_access,
    list_accessible_project_ids,
    list_managed_project_ids,
    user_can_manage_project,
)


def list_sprints(db: Session, project_id: int, current_user_id: int):
    _require_project_access(db, project_id, current_user_id)
    return sprint_repository.list_sprints(db, project_id=project_id)


def list_accessible_sprints(db: Session, current_user_id: int, project_id: int | None = None):
    if project_id is not None:
        return list_sprints(db, project_id, current_user_id)

    user = _get_current_user(db, current_user_id)
    accessible_project_ids = list_accessible_project_ids(db, user)
    if not accessible_project_ids:
        return []

    if has_companywide_project_access(user):
        return sprint_repository.list_sprints(
            db,
            project_ids_subquery=accessible_project_ids,
        )

    managed_project_ids = set(list_managed_project_ids(db, user))
    if not managed_project_ids:
        return sprint_repository.list_sprints(
            db,
            project_ids_subquery=accessible_project_ids,
        )
    return sprint_repository.list_sprints(
        db,
        project_ids_subquery=accessible_project_ids,
    )


def create_sprint(db: Session, project_id: int, current_user_id: int, sprint_in: SprintCreate):
    current_user = _require_project_access(db, project_id, current_user_id)
    if not user_can_manage_project(db, project_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền tạo sprint trong dự án này.",
        )
    actor_member = _get_or_create_actor_member(db, project_id, current_user_id)

    sprint_data = sprint_in.model_dump()
    
    if sprint_data.get("status") and sprint_data.get("status").upper() == "ACTIVE":
        active_sprint = sprint_repository.get_active_sprint_by_project(db, project_id)
        if active_sprint:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sprint '{active_sprint.name}' đang hoạt động. Không thể tạo và active ngay sprint khác.",
            )
            
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
    
    if update_data.get("status") and update_data.get("status").upper() == "ACTIVE":
        active_sprint = sprint_repository.get_active_sprint_by_project(db, sprint.project_id)
        if active_sprint and active_sprint.id != sprint_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sprint '{active_sprint.name}' đang hoạt động. Không thể bắt đầu sprint khác.",
            )
    
    if update_data.get("status") and update_data.get("status").lower() == "closed":
        from app.models.task_model import Task
        from sqlalchemy import func
        # Move all unfinished tasks in this sprint back to the backlog
        db.query(Task).filter(
            Task.sprint_id == sprint_id,
            func.lower(Task.status) != "done"
        ).update({"sprint_id": None}, synchronize_session=False)

    sprint = sprint_repository.update_sprint(db, sprint, update_data)
    db.commit()
    db.refresh(sprint)
    return sprint
