from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import List, Optional

from app.repositories import task_repository, project_repository
from app.schemas.task_schema import TaskCreate, TaskUpdate, TaskCommentCreate, LogWorkCreate
from app.models.task_model import Task

def _is_admin_user(user) -> bool:
    return bool(user and (getattr(user, "is_admin", False) or getattr(user, "role", None) == "ADMIN"))

def _check_project_access(db: Session, project_id: int, user_id: int):
    member = project_repository.get_project_member(db, project_id, user_id)
    if not member:
        user = project_repository.get_user_by_id(db, user_id)
        if not _is_admin_user(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this project")
    return member

def list_tasks(db: Session, project_id: int, current_user_id: int, sprint_id: Optional[int] = None):
    _check_project_access(db, project_id, current_user_id)
    return task_repository.list_tasks(db, project_id=project_id, sprint_id=sprint_id)

def list_accessible_tasks(
    db: Session,
    current_user_id: int,
    project_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
):
    if project_id is not None:
        _check_project_access(db, project_id, current_user_id)
        return task_repository.list_tasks(db, project_id=project_id, sprint_id=sprint_id)

    user = project_repository.get_user_by_id(db, current_user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if _is_admin_user(user):
        return task_repository.list_tasks(db, sprint_id=sprint_id)

    member_project_ids = project_repository.get_member_project_ids_subquery(db, current_user_id)
    return task_repository.list_tasks(
        db,
        sprint_id=sprint_id,
        project_ids_subquery=member_project_ids,
    )

def create_task(db: Session, project_id: int, current_user_id: int, task_in: TaskCreate):
    member = _check_project_access(db, project_id, current_user_id)
    member_id = member.id if member else 1 # Fallback for admin if not member
    
    task_data = task_in.model_dump(exclude={"assignee_user_ids"})
    task_data["project_id"] = project_id
    task_data["created_by_member_id"] = member_id
    
    task = task_repository.create_task(db, task_data)
    
    # Handle assignees
    if task_in.assignee_user_ids:
        for user_id in task_in.assignee_user_ids:
            # Need to get member id for this user_id
            assignee_member = project_repository.get_project_member(db, project_id, int(user_id.replace("usr-", "")))
            if assignee_member:
                task_repository.add_task_assignee(db, task.id, assignee_member.id, member_id)
                
    db.commit()
    db.refresh(task)
    return task

def get_task(db: Session, task_id: int, current_user_id: int):
    task = task_repository.get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    _check_project_access(db, task.project_id, current_user_id)
    return task

def update_task(db: Session, task_id: int, current_user_id: int, task_in: TaskUpdate):
    task = get_task(db, task_id, current_user_id)
    update_data = task_in.model_dump(exclude_unset=True)
    task = task_repository.update_task(db, task, update_data)
    db.commit()
    db.refresh(task)
    return task

def add_assignee(db: Session, task_id: int, user_id_to_assign: str, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    member = project_repository.get_project_member(db, task.project_id, current_user_id)
    member_id = member.id if member else 1
    
    assignee_member = project_repository.get_project_member(db, task.project_id, int(user_id_to_assign.replace("usr-", "")))
    if not assignee_member:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is not a member of this project")
         
    assignee = task_repository.add_task_assignee(db, task.id, assignee_member.id, member_id)
    db.commit()
    return assignee

def get_comments(db: Session, task_id: int, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    return task_repository.list_task_comments(db, task_id)

def add_comment(db: Session, task_id: int, current_user_id: int, comment_in: TaskCommentCreate):
    task = get_task(db, task_id, current_user_id)
    member = project_repository.get_project_member(db, task.project_id, current_user_id)
    member_id = member.id if member else 1
    
    comment_data = comment_in.model_dump()
    comment_data["task_id"] = task_id
    comment_data["project_member_id"] = member_id
    
    comment = task_repository.create_task_comment(db, comment_data)
    db.commit()
    db.refresh(comment)
    return comment

def get_logworks(db: Session, task_id: int, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    return task_repository.list_task_logworks(db, task_id)

def add_logwork(db: Session, task_id: int, current_user_id: int, logwork_in: LogWorkCreate):
    task = get_task(db, task_id, current_user_id)
    member = project_repository.get_project_member(db, task.project_id, current_user_id)
    member_id = member.id if member else 1
    
    logwork_data = logwork_in.model_dump()
    logwork_data["task_id"] = task_id
    logwork_data["project_member_id"] = member_id
    
    logwork = task_repository.create_logwork(db, logwork_data)
    db.commit()
    db.refresh(logwork)
    return logwork
