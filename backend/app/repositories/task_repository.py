from typing import List, Optional
from sqlalchemy import desc
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.task_model import Task, TaskAssignees, TaskComment
from app.models.logworks import LogWork
from app.models.project_model import ProjectMember
from app.models.user_model import User
from app.schemas.task_schema import TaskCreate, TaskUpdate

def get_task_by_id(db: Session, task_id: int) -> Optional[Task]:
    return db.query(Task).filter(Task.id == task_id).first()

def list_tasks(
    db: Session,
    project_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    project_ids_subquery=None,
) -> List[Task]:
    query = db.query(Task)
    if project_id:
        query = query.filter(Task.project_id == project_id)
    elif project_ids_subquery is not None:
        query = query.filter(Task.project_id.in_(project_ids_subquery))
    if sprint_id:
        query = query.filter(Task.sprint_id == sprint_id)
    return query.order_by(desc(Task.created_at)).all()

def create_task(db: Session, task_data: dict) -> Task:
    task = Task(**task_data)
    db.add(task)
    db.flush()
    return task

def update_task(db: Session, task: Task, update_data: dict) -> Task:
    for key, value in update_data.items():
        if hasattr(task, key) and value is not None:
            setattr(task, key, value)
    
    if "status" in update_data and update_data["status"] == "done":
        task.completed_at = datetime.now(timezone.utc)
        
    db.flush()
    return task

def delete_task(db: Session, task: Task) -> None:
    db.delete(task)
    db.flush()

# --- Assignees ---
def get_task_assignees(db: Session, task_id: int) -> List[TaskAssignees]:
    return db.query(TaskAssignees).filter(TaskAssignees.task_id == task_id).all()

def list_task_assignee_users(db: Session, task_ids: List[int]):
    if not task_ids:
        return []

    return (
        db.query(
            TaskAssignees.task_id,
            User.id,
            User.full_name,
            User.email,
        )
        .join(ProjectMember, ProjectMember.id == TaskAssignees.project_member_id)
        .join(User, User.id == ProjectMember.user_id)
        .filter(TaskAssignees.task_id.in_(task_ids))
        .all()
    )

def add_task_assignee(db: Session, task_id: int, project_member_id: int, assigned_by: int) -> TaskAssignees:
    assignee = TaskAssignees(
        task_id=task_id, 
        project_member_id=project_member_id, 
        assigned_by_member_id=assigned_by
    )
    db.add(assignee)
    db.flush()
    return assignee

def remove_task_assignee(db: Session, task_id: int, project_member_id: int) -> None:
    assignee = db.query(TaskAssignees).filter(
        TaskAssignees.task_id == task_id, 
        TaskAssignees.project_member_id == project_member_id
    ).first()
    if assignee:
        db.delete(assignee)
        db.flush()

# --- Comments ---
def list_task_comments(db: Session, task_id: int) -> List[TaskComment]:
    return db.query(TaskComment).filter(TaskComment.task_id == task_id).order_by(TaskComment.created_at).all()

def create_task_comment(db: Session, comment_data: dict) -> TaskComment:
    comment = TaskComment(**comment_data)
    db.add(comment)
    db.flush()
    return comment

# --- Logworks ---
def list_task_logworks(db: Session, task_id: int) -> List[LogWork]:
    return db.query(LogWork).filter(LogWork.task_id == task_id).order_by(desc(LogWork.work_date)).all()

def create_logwork(db: Session, logwork_data: dict) -> LogWork:
    logwork = LogWork(**logwork_data)
    db.add(logwork)
    db.flush()
    return logwork
