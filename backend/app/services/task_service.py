from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.project_model import ProjectMember
from app.models.task_model import Task
from app.repositories import project_repository, task_repository
from app.schemas.task_schema import LogWorkCreate, TaskCommentCreate, TaskCreate, TaskUpdate
from app.utils.project_helpers import (
    DEVELOPER_ROLE_NAME,
    ensure_default_roles,
    get_pm_role,
    is_admin_user,
    list_accessible_project_ids,
    list_managed_project_ids,
    normalize_task_status,
    user_can_manage_project,
    user_is_project_member,
)


def _get_current_user(db: Session, user_id: int):
    user = project_repository.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _normalize_task(task: Task) -> Task:
    task.status = normalize_task_status(task.status)
    return task


def _normalize_tasks(tasks: Iterable[Task]) -> list[Task]:
    return [_normalize_task(task) for task in tasks]


def _sort_tasks(tasks: Iterable[Task]) -> list[Task]:
    return sorted(
        tasks,
        key=lambda task: (
            getattr(task, "created_at", None).timestamp()
            if getattr(task, "created_at", None)
            else 0,
            task.id,
        ),
        reverse=True,
    )


def _require_project_access(db: Session, project_id: int, user_id: int):
    user = _get_current_user(db, user_id)
    if is_admin_user(user) or user_is_project_member(db, project_id, user.id):
        return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền truy cập dự án này.",
    )


def _can_manage_project_tasks(db: Session, project_id: int, user_id: int) -> bool:
    user = _get_current_user(db, user_id)
    return user_can_manage_project(db, project_id, user)


def _require_manage_project_tasks(db: Session, project_id: int, user_id: int):
    user = _require_project_access(db, project_id, user_id)
    if user_can_manage_project(db, project_id, user):
        return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền quản lý task trong dự án này.",
    )


def _validate_parent_task(db: Session, project_id: int, parent_task_id: Optional[int]):
    if parent_task_id is None:
        return

    parent = task_repository.get_task_by_id(db, parent_task_id)
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent task not found")
    if parent.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parent task must belong to the same project",
        )


def _get_or_create_actor_member(db: Session, project_id: int, user_id: int) -> ProjectMember:
    member = project_repository.get_project_member(db, project_id, user_id, include_inactive=True)
    if member:
        if not getattr(member, "is_active", True):
            member.is_active = True
            db.flush()
        return member

    user = _get_current_user(db, user_id)
    if not is_admin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn phải là thành viên của dự án để thực hiện thao tác này.",
        )

    ensure_default_roles(db)
    developer_role = project_repository.get_role_by_name(db, DEVELOPER_ROLE_NAME)
    pm_role = get_pm_role(db)
    actor_member = ProjectMember(
        project_id=project_id,
        user_id=user_id,
        role_id=developer_role.id if developer_role else pm_role.id,
    )
    project_repository.add_project_member(db, actor_member)
    db.flush()
    return actor_member


def _ensure_task_update_access(db: Session, task: Task, user_id: int, update_data: dict):
    if _can_manage_project_tasks(db, task.project_id, user_id):
        return

    if not task_repository.is_task_assignee(db, task.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền cập nhật task này.",
        )

    allowed_keys = {"status"}
    disallowed_keys = set(update_data.keys()) - allowed_keys
    if disallowed_keys:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chỉ có thể cập nhật trạng thái của task được giao cho mình.",
        )


def list_tasks(db: Session, project_id: int, current_user_id: int, sprint_id: Optional[int] = None):
    _require_project_access(db, project_id, current_user_id)
    tasks = task_repository.list_tasks(db, project_id=project_id, sprint_id=sprint_id)
    return _normalize_tasks(tasks)


def list_accessible_tasks(
    db: Session,
    current_user_id: int,
    project_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
):
    if project_id is not None:
        return list_tasks(db, project_id, current_user_id, sprint_id)

    user = _get_current_user(db, current_user_id)
    if is_admin_user(user):
        tasks = task_repository.list_tasks(db, sprint_id=sprint_id)
        return _normalize_tasks(tasks)

    accessible_project_ids = list_accessible_project_ids(db, user)
    if not accessible_project_ids:
        return []

    managed_project_ids = set(list_managed_project_ids(db, user))
    merged_tasks: dict[int, Task] = {}

    if managed_project_ids:
        for task in task_repository.list_tasks(
            db,
            project_ids=sorted(managed_project_ids),
            sprint_id=sprint_id,
        ):
            merged_tasks[task.id] = task

    member_only_project_ids = sorted(set(accessible_project_ids) - managed_project_ids)
    if member_only_project_ids:
        for task in task_repository.list_tasks(
            db,
            project_ids=member_only_project_ids,
            sprint_id=sprint_id,
            assignee_user_id=current_user_id,
        ):
            merged_tasks[task.id] = task

    return _normalize_tasks(_sort_tasks(merged_tasks.values()))


def create_task(db: Session, project_id: int, current_user_id: int, task_in: TaskCreate):
    actor_user = _require_manage_project_tasks(db, project_id, current_user_id)
    actor_member = _get_or_create_actor_member(db, project_id, actor_user.id)
    _validate_parent_task(db, project_id, task_in.parent_task_id)

    task_data = task_in.model_dump(exclude={"assignee_user_ids"})
    task_data["project_id"] = project_id
    task_data["created_by_member_id"] = actor_member.id
    task_data["status"] = normalize_task_status(task_data.get("status"))

    task = task_repository.create_task(db, task_data)

    for assignee_user_id in task_in.assignee_user_ids:
        assignee_member = project_repository.get_project_member(
            db,
            project_id,
            int(assignee_user_id.replace("usr-", "")),
        )
        if assignee_member:
            task_repository.add_task_assignee(db, task.id, assignee_member.id, actor_member.id)

    db.commit()
    db.refresh(task)
    return _normalize_task(task)


def get_task(db: Session, task_id: int, current_user_id: int):
    task = task_repository.get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    _require_project_access(db, task.project_id, current_user_id)
    return _normalize_task(task)


def update_task(db: Session, task_id: int, current_user_id: int, task_in: TaskUpdate):
    task = get_task(db, task_id, current_user_id)
    update_data = task_in.model_dump(exclude_unset=True)
    if "status" in update_data:
        update_data["status"] = normalize_task_status(update_data["status"])

    _ensure_task_update_access(db, task, current_user_id, update_data)

    parent_task_id = update_data.get("parent_task_id")
    if parent_task_id == task.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task cannot be its own parent",
        )

    if _can_manage_project_tasks(db, task.project_id, current_user_id):
        _validate_parent_task(db, task.project_id, parent_task_id)

        start_date = update_data.get("start_date", task.start_date)
        deadline = update_data.get("deadline", task.deadline)
        if start_date and deadline and deadline < start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deadline must be after or equal to start date",
            )

    task = task_repository.update_task(db, task, update_data)
    db.commit()
    db.refresh(task)
    return _normalize_task(task)


def add_assignee(db: Session, task_id: int, user_id_to_assign: str, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    actor_user = _require_manage_project_tasks(db, task.project_id, current_user_id)
    actor_member = _get_or_create_actor_member(db, task.project_id, actor_user.id)

    if not user_id_to_assign:
        task_repository.clear_task_assignees(db, task.id)
        db.commit()
        return None

    assignee_member = project_repository.get_project_member(
        db,
        task.project_id,
        int(user_id_to_assign.replace("usr-", "")),
    )
    if not assignee_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not a member of this project",
        )

    task_repository.clear_task_assignees(db, task.id)
    assignee = task_repository.add_task_assignee(db, task.id, assignee_member.id, actor_member.id)
    db.commit()
    return assignee


def get_comments(db: Session, task_id: int, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    return task_repository.list_task_comments(db, task.id)


def add_comment(db: Session, task_id: int, current_user_id: int, comment_in: TaskCommentCreate):
    task = get_task(db, task_id, current_user_id)
    actor_member = _get_or_create_actor_member(db, task.project_id, current_user_id)

    comment_data = comment_in.model_dump()
    comment_data["task_id"] = task_id
    comment_data["project_member_id"] = actor_member.id

    comment = task_repository.create_task_comment(db, comment_data)
    db.commit()
    db.refresh(comment)
    return comment


def get_logworks(db: Session, task_id: int, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    return task_repository.list_task_logworks(db, task.id)


def add_logwork(db: Session, task_id: int, current_user_id: int, logwork_in: LogWorkCreate):
    task = get_task(db, task_id, current_user_id)
    if not _can_manage_project_tasks(db, task.project_id, current_user_id) and not task_repository.is_task_assignee(
        db,
        task.id,
        current_user_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chỉ có thể ghi logwork cho task được giao cho mình.",
        )

    actor_member = _get_or_create_actor_member(db, task.project_id, current_user_id)
    logwork_data = logwork_in.model_dump()
    logwork_data["task_id"] = task_id
    logwork_data["project_member_id"] = actor_member.id

    logwork = task_repository.create_logwork(db, logwork_data)
    db.commit()
    db.refresh(logwork)
    return logwork
