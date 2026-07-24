from typing import List, Optional
import asyncio
from fastapi import APIRouter, Depends, Query, status, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.api.auth import get_current_user
from app.models.user_model import User
from app.models.notification_model import Notification
from app.services.websocket_manager import manager
from app.schemas.task_schema import (
    TaskResponse, TaskCreate, TaskUpdate, 
    TaskAttachmentResponse, TaskAttachmentCreate,
    LogWorkResponse, LogWorkCreate,
    TaskAssigneeResponse
)
from app.services import task_service
from app.utils.dashboard_helpers import build_task_estimate_rollup
from pydantic import BaseModel

class AssigneeRequest(BaseModel):
    user_id: str

router = APIRouter(prefix="/api/projects/{project_id}/tasks", tags=["Tasks"])
router_root = APIRouter(prefix="/api/tasks", tags=["Tasks"])

def _hydrate_task_response(db: Session, task: TaskResponse):
    _hydrate_task_list_response(db, [task])

def _hydrate_task_list_response(db: Session, tasks: List[TaskResponse]):
    if not tasks:
        return

    project_ids = sorted({task.project_id for task in tasks})
    project_task_rollups: dict[int, dict[int, float]] = {}
    all_project_tasks = task_service.task_repository.list_tasks(db, project_ids=project_ids)

    for project_id in project_ids:
        project_tasks = [task for task in all_project_tasks if task.project_id == project_id]
        project_task_rollups[project_id] = build_task_estimate_rollup(project_tasks)

    assignees_by_task_id = {task.id: [] for task in tasks}
    creator_user_ids_by_member_id: dict[int, int | None] = {}
    assignee_rows = task_service.task_repository.list_task_assignee_users(
        db,
        [task.id for task in tasks],
    )

    for task_id, user_id, full_name, email in assignee_rows:
        assignees_by_task_id.setdefault(task_id, []).append(
            TaskAssigneeResponse(
                user_id=f"usr-{user_id}",
                name=full_name,
                email=email,
            )
        )

    import math
    from datetime import timedelta

    for task in tasks:
        task.estimated_hours = project_task_rollups.get(task.project_id, {}).get(
            task.id,
            task.estimated_hours,
        )
        if task.start_date and task.estimated_hours and task.estimated_hours > 0:
            days_required = max(1, math.ceil(float(task.estimated_hours) / 8.0))
            calculated_deadline = task.start_date + timedelta(days=days_required - 1)
            if not task.deadline or calculated_deadline > task.deadline:
                task.deadline = calculated_deadline

        task.assignees = assignees_by_task_id.get(task.id, [])
        task.key = f"TASK-{task.id}"
        if task.created_by_member_id not in creator_user_ids_by_member_id:
            member = task_service.project_repository.get_project_member_by_id(
                db,
                task.created_by_member_id,
                task.project_id,
                include_inactive=True,
            )
            creator_user_ids_by_member_id[task.created_by_member_id] = member.user_id if member else None
        task.created_by_user_id = creator_user_ids_by_member_id.get(task.created_by_member_id)

@router.get("", response_model=List[TaskResponse])
def get_tasks(
    project_id: int,
    sprint_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tasks = task_service.list_tasks(db, project_id, current_user.id, sprint_id)
    _hydrate_task_list_response(db, tasks)
    return tasks

@router_root.get("", response_model=List[TaskResponse])
def get_accessible_tasks(
    project_id: Optional[int] = Query(None),
    sprint_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tasks = task_service.list_accessible_tasks(
        db,
        current_user.id,
        project_id=project_id,
        sprint_id=sprint_id,
    )
    _hydrate_task_list_response(db, tasks)
    return tasks

@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: int,
    task_in: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = task_service.create_task(db, project_id, current_user.id, task_in)
    _hydrate_task_response(db, task)
    return task

@router_root.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = task_service.get_task(db, task_id, current_user.id)
    _hydrate_task_response(db, task)
    return task

@router_root.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task_in: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = task_service.update_task(db, task_id, current_user.id, task_in)
    _hydrate_task_response(db, task)
    return task

@router_root.post("/{task_id}/assignees")
def add_assignee(
    task_id: int,
    req: AssigneeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task_service.add_assignee(db, task_id, req.user_id, current_user.id)
    task = task_service.task_repository.get_task_by_id(db, task_id)
    
    target_user_id_str = req.user_id.replace("usr-", "") if req.user_id else ""
    
    if target_user_id_str:
        target_user_id = int(target_user_id_str)
        if target_user_id != current_user.id:
            notification = Notification(
                user_id=target_user_id,
                type="TASK_ASSIGNED",
                title="Bạn được giao một Task mới",
                content=f"Task: {task.title if task else f'#{task_id}'}",
                link=f"/tasks"
            )
            db.add(notification)
            db.commit()
            db.refresh(notification)

            async def send_ws():
                await manager.send_personal_message(
                    {
                        "type": "NEW_NOTIFICATION",
                        "data": {
                            "id": notification.id,
                            "type": notification.type,
                            "title": notification.title,
                            "content": notification.content,
                            "link": notification.link,
                            "is_read": False,
                            "created_at": notification.created_at.isoformat()
                        }
                    }, 
                    target_user_id
                )
            background_tasks.add_task(send_ws)

    _hydrate_task_response(db, task)
    return {"message": "Success"}

@router_root.get("/{task_id}/attachments", response_model=List[TaskAttachmentResponse])
def get_attachments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    attachments = task_service.get_attachments(db, task_id, current_user.id)
    for attachment in attachments:
        # Resolve user name
        task = task_service.task_repository.get_task_by_id(db, task_id)
        if task:
            member = task_service.project_repository.get_project_member_by_id(db, attachment.uploaded_by, task.project_id)
            if member:
                user = task_service.project_repository.get_user_by_id(db, member.user_id)
                if user:
                    attachment.user_name = user.full_name
    return attachments

@router_root.post("/{task_id}/attachments", response_model=TaskAttachmentResponse, status_code=status.HTTP_201_CREATED)
def create_attachment(
    task_id: int,
    attachment_in: TaskAttachmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    attachment = task_service.add_attachment(db, task_id, current_user.id, attachment_in)
    return attachment

@router_root.get("/{task_id}/logworks", response_model=List[LogWorkResponse])
def get_logworks(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    logworks = task_service.get_logworks(db, task_id, current_user.id)
    for lw in logworks:
        task = task_service.task_repository.get_task_by_id(db, task_id)
        if task:
            member = task_service.project_repository.get_project_member_by_id(db, lw.project_member_id, task.project_id)
            if member:
                user = task_service.project_repository.get_user_by_id(db, member.user_id)
                if user:
                    lw.user_name = user.full_name
    return logworks

@router_root.post("/{task_id}/logworks", response_model=LogWorkResponse, status_code=status.HTTP_201_CREATED)
def create_logwork(
    task_id: int,
    logwork_in: LogWorkCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    lw = task_service.add_logwork(db, task_id, current_user.id, logwork_in)
    
    task = task_service.task_repository.get_task_by_id(db, task_id)
    if task:
        project = task_service.project_repository.get_project_by_id(db, task.project_id)
        if project and project.manager_id and project.manager_id != current_user.id:
            notification = Notification(
                user_id=project.manager_id,
                type="LOGWORK_SUBMITTED",
                title="Yêu cầu duyệt Log Work",
                content=f"{current_user.full_name} vừa log {logwork_in.hours_spent}h vào '{task.title}'",
                link="/logwork-approvals"
            )
            db.add(notification)
            db.commit()
            db.refresh(notification)

            async def send_ws():
                await manager.send_personal_message(
                    {
                        "type": "NEW_NOTIFICATION",
                        "data": {
                            "id": notification.id,
                            "type": notification.type,
                            "title": notification.title,
                            "content": notification.content,
                            "link": notification.link,
                            "is_read": False,
                            "created_at": notification.created_at.isoformat()
                        }
                    }, 
                    project.manager_id
                )
            background_tasks.add_task(send_ws)

    return lw


@router_root.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task_service.delete_task(db, task_id, current_user.id)
