from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.connection import get_db
from app.models.notification_model import Notification
from app.models.user_model import User
from app.schemas.task_schema import (
    LogWorkCreate,
    LogWorkResponse,
    TaskAssigneeResponse,
    TaskAttachmentCreate,
    TaskAttachmentResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)
from app.services import task_service
from app.services.websocket_manager import manager
from app.utils.dashboard_helpers import build_task_estimate_rollup, build_task_spent_rollup


class AssigneeRequest(BaseModel):
    user_id: Optional[str] = None
    user_ids: Optional[List[str]] = None


router = APIRouter(prefix="/api/projects/{project_id}/tasks", tags=["Tasks"])
router_root = APIRouter(prefix="/api/tasks", tags=["Tasks"])


def _hydrate_task_response(db: Session, task: TaskResponse):
    _hydrate_task_list_response(db, [task])


def _hydrate_task_list_response(db: Session, tasks: List[TaskResponse]):
    if not tasks:
        return

    project_ids = sorted({task.project_id for task in tasks})
    project_task_estimate_rollups: dict[int, dict[int, float]] = {}
    project_task_spent_rollups: dict[int, dict[int, float]] = {}
    all_project_tasks = task_service.task_repository.list_tasks(db, project_ids=project_ids)
    all_project_logworks = task_service.task_repository.list_logworks_by_project_ids(
        db, project_ids
    )
    project_id_by_task_id = {task.id: task.project_id for task in all_project_tasks}
    logworks_by_project_id = {project_id: [] for project_id in project_ids}

    for logwork in all_project_logworks:
        project_id = project_id_by_task_id.get(logwork.task_id)
        if project_id is not None:
            logworks_by_project_id[project_id].append(logwork)

    for project_id in project_ids:
        project_tasks = [task for task in all_project_tasks if task.project_id == project_id]
        project_task_estimate_rollups[project_id] = build_task_estimate_rollup(project_tasks)
        project_task_spent_rollups[project_id] = build_task_spent_rollup(
            project_tasks, logworks_by_project_id[project_id]
        )

    assignees_by_task_id = {task.id: [] for task in tasks}
    parent_ids_with_children = {
        project_task.parent_task_id
        for project_task in all_project_tasks
        if project_task.parent_task_id
    }
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
        task.estimated_hours = project_task_estimate_rollups.get(task.project_id, {}).get(
            task.id,
            task.estimated_hours,
        )
        task._spent_hours_rollup = project_task_spent_rollups.get(task.project_id, {}).get(
            task.id,
            0.0,
        )
        if task.start_date and task.estimated_hours and task.estimated_hours > 0:
            try:
                days_required = max(1, math.ceil(float(task.estimated_hours) / 8.0))
                if days_required <= 36500:
                    calculated_deadline = task.start_date + timedelta(days=days_required - 1)
                    if not task.deadline or calculated_deadline > task.deadline:
                        task.deadline = calculated_deadline
            except (OverflowError, ValueError):
                pass

        task.assignees = assignees_by_task_id.get(task.id, [])
        task.has_children = task.id in parent_ids_with_children
        task.key = f"TASK-{task.id}"
        if task.created_by_member_id not in creator_user_ids_by_member_id:
            member = task_service.project_repository.get_project_member_by_id(
                db,
                task.created_by_member_id,
                task.project_id,
                include_inactive=True,
            )
            creator_user_ids_by_member_id[task.created_by_member_id] = (
                member.user_id if member else None
            )
        task.created_by_user_id = creator_user_ids_by_member_id.get(task.created_by_member_id)


@router.get("", response_model=List[TaskResponse])
def get_tasks(
    project_id: int,
    sprint_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = task_service.list_tasks(db, project_id, current_user.id, sprint_id)
    _hydrate_task_list_response(db, tasks)
    return tasks


@router_root.get("", response_model=List[TaskResponse])
def get_accessible_tasks(
    project_id: Optional[int] = Query(None),
    sprint_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = task_service.list_accessible_tasks(
        db,
        current_user.id,
        project_id=project_id,
        sprint_id=sprint_id,
    )
    _hydrate_task_list_response(db, tasks)
    return tasks


def _notification_ws_payload(notification: Notification) -> dict:
    return {
        "type": "NEW_NOTIFICATION",
        "data": {
            "id": notification.id,
            "type": notification.type,
            "title": notification.title,
            "content": notification.content,
            "link": notification.link,
            "is_read": False,
            "created_at": notification.created_at.isoformat(),
        },
    }


def _enqueue_notification_ws(
    background_tasks: BackgroundTasks,
    notifications: list[Notification],
) -> None:
    if not notifications:
        return

    async def send_all() -> None:
        for notif in notifications:
            await manager.send_personal_message(
                _notification_ws_payload(notif),
                notif.user_id,
            )

    background_tasks.add_task(send_all)


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: int,
    task_in: TaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.task_log_service import notify_task_assigned

    task = task_service.create_task(db, project_id, current_user.id, task_in)
    raw_task = task_service.task_repository.get_task_by_id(db, task.id)

    assignee_user_ids: list[int] = []
    for raw_id in task_in.assignee_user_ids:
        try:
            assignee_user_ids.append(int(str(raw_id).replace("usr-", "")))
        except (TypeError, ValueError):
            continue

    if raw_task and assignee_user_ids:
        notifications = notify_task_assigned(
            db,
            task=raw_task,
            assignee_user_ids=assignee_user_ids,
            actor_user_id=current_user.id,
            actor_name=current_user.full_name,
        )
        _enqueue_notification_ws(background_tasks, notifications)

    _hydrate_task_response(db, task)
    return task


@router_root.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    task = task_service.get_task(db, task_id, current_user.id)
    _hydrate_task_response(db, task)
    return task


@router_root.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task_in: TaskUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task, changes = task_service.update_task(db, task_id, current_user.id, task_in)

    if changes:
        from app.services.task_log_service import (
            create_task_notifications,
            format_task_update_content,
        )

        raw_task = task_service.task_repository.get_task_by_id(db, task_id)
        if raw_task:
            notifications = create_task_notifications(
                db=db,
                task=raw_task,
                actor_user_id=current_user.id,
                title="Công việc được cập nhật",
                content=format_task_update_content(
                    db,
                    task_title=raw_task.title,
                    changes=changes,
                    actor_name=current_user.full_name,
                ),
            )
            _enqueue_notification_ws(background_tasks, notifications)

    _hydrate_task_response(db, task)
    return task


@router_root.post("/{task_id}/assignees")
def add_assignee(
    task_id: int,
    req: AssigneeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.task_log_service import create_task_log, notify_task_assignee_changed

    assignee_change = task_service.add_assignee(
        db,
        task_id,
        req.user_id,
        current_user.id,
        user_ids_to_assign=req.user_ids,
    )
    task = task_service.task_repository.get_task_by_id(db, task_id)

    if task and assignee_change.changed:
        old_value = (
            ",".join(f"usr-{user_id}" for user_id in assignee_change.previous_user_ids) or None
        )
        new_value = (
            ",".join(f"usr-{user_id}" for user_id in assignee_change.current_user_ids) or None
        )
        create_task_log(
            db=db,
            task_id=task_id,
            user_id=current_user.id,
            action="assigned",
            field_changed="assignee",
            old_value=old_value,
            new_value=new_value,
        )

        notifications = notify_task_assignee_changed(
            db,
            task=task,
            previous_user_ids=assignee_change.previous_user_ids,
            current_user_ids=assignee_change.current_user_ids,
            actor_user_id=current_user.id,
            actor_name=current_user.full_name,
        )
        _enqueue_notification_ws(background_tasks, notifications)

    _hydrate_task_response(db, task)
    return {"message": "Success"}


from app.schemas.task_schema import TaskLogResponse


@router_root.get("/{task_id}/logs", response_model=List[TaskLogResponse])
def get_task_logs(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    from sqlalchemy import desc

    from app.models.task_log_model import TaskLog

    task_service.get_task(db, task_id, current_user.id)

    logs = (
        db.query(TaskLog)
        .filter(TaskLog.task_id == task_id)
        .order_by(desc(TaskLog.created_at))
        .all()
    )
    for log in logs:
        if log.user:
            log.user_name = log.user.full_name
    return logs


@router_root.get("/{task_id}/attachments", response_model=List[TaskAttachmentResponse])
def get_attachments(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    attachments = task_service.get_attachments(db, task_id, current_user.id)
    for attachment in attachments:
        # Resolve user name
        task = task_service.task_repository.get_task_by_id(db, task_id)
        if task:
            member = task_service.project_repository.get_project_member_by_id(
                db, attachment.uploaded_by, task.project_id
            )
            if member:
                user = task_service.project_repository.get_user_by_id(db, member.user_id)
                if user:
                    attachment.user_name = user.full_name
    return attachments


@router_root.post(
    "/{task_id}/attachments",
    response_model=TaskAttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_attachment(
    task_id: int,
    attachment_in: TaskAttachmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachment = task_service.add_attachment(db, task_id, current_user.id, attachment_in)
    return attachment


@router_root.get("/{task_id}/logworks", response_model=List[LogWorkResponse])
def get_logworks(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    logworks = task_service.get_logworks(db, task_id, current_user.id)
    for lw in logworks:
        task = task_service.task_repository.get_task_by_id(db, task_id)
        if task:
            member = task_service.project_repository.get_project_member_by_id(
                db, lw.project_member_id, task.project_id
            )
            if member:
                user = task_service.project_repository.get_user_by_id(db, member.user_id)
                if user:
                    lw.user_name = user.full_name
                    lw.user_id = user.id
    return logworks


@router_root.post(
    "/{task_id}/logworks", response_model=LogWorkResponse, status_code=status.HTTP_201_CREATED
)
def create_logwork(
    task_id: int,
    logwork_in: LogWorkCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.task_log_service import notify_logwork_on_task

    lw = task_service.add_logwork(db, task_id, current_user.id, logwork_in)
    notifications: list[Notification] = []

    task = task_service.task_repository.get_task_by_id(db, task_id)
    if task:
        notifications.extend(
            notify_logwork_on_task(
                db,
                task=task,
                actor_user_id=current_user.id,
                actor_name=current_user.full_name,
                hours_spent=logwork_in.hours_spent,
            )
        )

        project = task_service.project_repository.get_project_by_id(db, task.project_id)
        if project and project.manager_id and project.manager_id != current_user.id:
            notification = Notification(
                user_id=project.manager_id,
                type="LOGWORK_SUBMITTED",
                title="Có nhật ký công việc mới",
                content=(
                    f"{current_user.full_name} đã gửi logwork {logwork_in.hours_spent:g}h "
                    f"chờ duyệt trong dự án '{project.name}'"
                ),
                link=f"/logwork-approvals?highlightLogworkId={lw.id}",
            )
            db.add(notification)
            db.commit()
            db.refresh(notification)
            notifications.append(notification)

    _enqueue_notification_ws(background_tasks, notifications)
    return lw


@router_root.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    task_service.delete_task(db, task_id, current_user.id)
