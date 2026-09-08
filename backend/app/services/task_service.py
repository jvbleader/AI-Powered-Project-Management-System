from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.project_model import ProjectMember
from app.models.task_model import Task
from app.repositories import project_repository, sprint_repository, task_repository
from app.schemas.task_schema import LogWorkCreate, TaskAttachmentCreate, TaskCreate, TaskUpdate
from app.services.task_log_service import create_task_log
from app.utils.dashboard_helpers import normalize_task_status
from app.utils.project_helpers import (
    has_companywide_project_access,
    is_admin_user,
    list_accessible_project_ids,
    user_can_access_project,
    user_can_manage_project,
    user_role_requires_manager_scope,
)


@dataclass(frozen=True)
class TaskAssigneeChange:
    previous_user_ids: tuple[int, ...]
    current_user_ids: tuple[int, ...]

    @property
    def changed(self) -> bool:
        return set(self.previous_user_ids) != set(self.current_user_ids)


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
            (
                getattr(task, "created_at", None).timestamp()
                if getattr(task, "created_at", None)
                else 0
            ),
            task.id,
        ),
        reverse=True,
    )


def _require_project_access(db: Session, project_id: int, user_id: int):
    user = _get_current_user(db, user_id)
    if user_can_access_project(db, project_id, user):
        return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền truy cập dự án này.",
    )


def _can_manage_project_tasks(db: Session, project_id: int, user_id: int) -> bool:
    user = _get_current_user(db, user_id)
    return user_can_manage_project(db, project_id, user)


def _can_delete_task(db: Session, project_id: int, user_id: int) -> bool:
    user = _get_current_user(db, user_id)
    if not user:
        return False
    if is_admin_user(user) or has_companywide_project_access(user):
        return True
    project = project_repository.get_project_by_id(db, project_id)
    if project and (project.manager_id == user.id or project.created_by == user.id):
        return True
    return bool(
        user_role_requires_manager_scope(user)
        and project_repository.get_project_member(db, project_id, user.id)
    )


def _parse_user_id(value) -> Optional[int]:
    if value is None:
        return None
    text = str(value).replace("usr-", "").strip()
    if not text:
        return None
    return int(text)


def _task_assignee_user_ids(db: Session, task_id: int) -> tuple[int, ...]:
    return tuple(int(row[1]) for row in task_repository.list_task_assignee_users(db, [task_id]))


def _has_child_tasks(db: Session, task_id: int) -> bool:
    return bool(task_repository.get_tasks_by_parent_id(db, task_id))


def _collect_leaf_assignee_user_ids(db: Session, task_id: int) -> set[int]:
    children = task_repository.get_tasks_by_parent_id(db, task_id)
    if not children:
        return set(_task_assignee_user_ids(db, task_id))

    leaf_ids: set[int] = set()
    for child in children:
        leaf_ids |= _collect_leaf_assignee_user_ids(db, child.id)
    return leaf_ids


def _replace_task_assignees(
    db: Session,
    task: Task,
    user_ids: Iterable[int],
    actor_member_id: int,
) -> tuple[int, ...]:
    unique_ids = tuple(dict.fromkeys(int(user_id) for user_id in user_ids))
    task_repository.clear_task_assignees(db, task.id)
    applied: list[int] = []
    for user_id in unique_ids:
        member = project_repository.get_project_member(db, task.project_id, user_id)
        if not member:
            continue
        task_repository.add_task_assignee(db, task.id, member.id, actor_member_id)
        applied.append(user_id)
    return tuple(applied)


def _sync_task_assignees_from_leaves(db: Session, task: Task, actor_member_id: int) -> None:
    if not _has_child_tasks(db, task.id):
        return
    leaf_user_ids = _collect_leaf_assignee_user_ids(db, task.id)
    if set(_task_assignee_user_ids(db, task.id)) != leaf_user_ids:
        _replace_task_assignees(db, task, leaf_user_ids, actor_member_id)


def _sync_ancestor_assignees(db: Session, task: Task, actor_member_id: int) -> None:
    parent_id = task.parent_task_id
    while parent_id:
        parent = task_repository.get_task_by_id(db, parent_id)
        if not parent:
            return
        _sync_task_assignees_from_leaves(db, parent, actor_member_id)
        parent_id = parent.parent_task_id


def _sync_ancestor_rollups(
    db: Session, task: Task, actor_member_id: int, include_self: bool = False
) -> None:
    current = (
        task
        if include_self
        else (task_repository.get_task_by_id(db, task.parent_task_id) if task.parent_task_id else None)
    )
    while current:
        _sync_task_assignees_from_leaves(db, current, actor_member_id)

        children = task_repository.get_tasks_by_parent_id(db, current.id)
        if children:
            total_hours = sum(float(c.estimated_hours or 0) for c in children)
            starts = [c.start_date for c in children if c.start_date]
            deadlines = [c.deadline for c in children if c.deadline]
            update_fields = {}
            update_fields["estimated_hours"] = round(total_hours, 1)
            if starts:
                update_fields["start_date"] = min(starts)
            if deadlines:
                update_fields["deadline"] = max(deadlines)
            task_repository.update_task(db, current, update_fields)

        if not current.parent_task_id:
            break
        current = task_repository.get_task_by_id(db, current.parent_task_id)


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


def _validate_sprint(db: Session, project, sprint_id: Optional[int]):
    if sprint_id is None:
        return
    if (getattr(project, "project_type", "") or "").lower() == "waterfall":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dự án Waterfall không sử dụng Sprint.",
        )
    sprint = sprint_repository.get_sprint_by_id(db, sprint_id)
    if not sprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint không tồn tại.",
        )
    if sprint.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sprint không thuộc về dự án này.",
        )


def _ensure_no_parent_cycle(db: Session, task_id: int, parent_task_id: Optional[int]):
    current_parent_id = parent_task_id
    visited = {task_id}

    while current_parent_id is not None:
        if current_parent_id in visited:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tạo vòng lặp trong cây task.",
            )

        visited.add(current_parent_id)
        parent = task_repository.get_task_by_id(db, current_parent_id)
        if not parent:
            return

        current_parent_id = parent.parent_task_id


def _get_or_create_actor_member(db: Session, project_id: int, user_id: int) -> ProjectMember:
    member = project_repository.get_project_member(db, project_id, user_id, include_inactive=True)
    if member:
        if not getattr(member, "is_active", True):
            member.is_active = True
            db.flush()
        return member

    member = ProjectMember(
        project_id=project_id,
        user_id=user_id,
        joined_at=datetime.now(timezone.utc),
        is_active=True,
    )
    return project_repository.add_project_member(db, member)


def _ensure_task_update_access(db: Session, task: Task, user_id: int, update_data: dict):
    # Cho phép mọi thành viên trong dự án có quyền truy cập được chỉnh sửa chi tiết task
    _require_project_access(db, task.project_id, user_id)


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
    accessible_project_ids = list_accessible_project_ids(db, user)
    if not accessible_project_ids:
        return []

    # Thành viên dự án được xem toàn bộ task của các dự án mình tham gia.
    tasks = task_repository.list_tasks(
        db,
        project_ids=accessible_project_ids,
        sprint_id=sprint_id,
    )
    return _normalize_tasks(_sort_tasks(tasks))


def create_task(db: Session, project_id: int, current_user_id: int, task_in: TaskCreate):
    # Mọi người có quyền truy cập dự án đều được tạo task.
    project = project_repository.get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    actor_user = _require_project_access(db, project_id, current_user_id)
    actor_member = _get_or_create_actor_member(db, project_id, actor_user.id)
    _validate_parent_task(db, project_id, task_in.parent_task_id)
    _validate_sprint(db, project, task_in.sprint_id)

    task_data = task_in.model_dump(exclude={"assignee_user_ids"})
    task_data["project_id"] = project_id
    task_data["created_by_member_id"] = actor_member.id
    task_data["status"] = normalize_task_status(task_data.get("status"))
    if task_data["status"] == "done":
        task_data["completed_at"] = datetime.now(timezone.utc)
    else:
        task_data["completed_at"] = None

    task = task_repository.create_task(db, task_data)

    unique_assignee_ids = tuple(
        dict.fromkeys(
            parsed
            for raw_id in task_in.assignee_user_ids
            if (parsed := _parse_user_id(raw_id)) is not None
        )
    )
    for parsed_user_id in unique_assignee_ids:
        assignee_member = project_repository.get_project_member(
            db,
            project_id,
            parsed_user_id,
        )
        if assignee_member:
            task_repository.add_task_assignee(db, task.id, assignee_member.id, actor_member.id)

    _sync_ancestor_rollups(db, task, actor_member.id)
    _sync_task_and_ancestor_statuses(db, task)
    db.commit()
    db.refresh(task)
    return _normalize_task(task)


def get_task(db: Session, task_id: int, current_user_id: int):
    task = task_repository.get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    _require_project_access(db, task.project_id, current_user_id)
    return _normalize_task(task)


def _sync_task_and_ancestor_statuses(
    db: Session,
    task: Task,
    *,
    include_self: bool = False,
) -> None:
    """Derive every parent status from its direct children.

    A parent is ``done`` only when all of its direct children are ``done``.
    As soon as one child is reopened/not done, the parent and every ancestor
    become ``in_progress`` and their completion timestamps are cleared.
    """
    current = (
        task
        if include_self
        else (task_repository.get_task_by_id(db, task.parent_task_id) if task.parent_task_id else None)
    )

    while current:
        children = task_repository.get_tasks_by_parent_id(db, current.id)
        if children:
            all_children_done = all(
                normalize_task_status(child.status) == "done" for child in children
            )
            desired_status = "done" if all_children_done else "in_progress"
            current_status = normalize_task_status(current.status)
            completed_at_is_consistent = (
                current.completed_at is not None
                if desired_status == "done"
                else current.completed_at is None
            )
            if current_status != desired_status or not completed_at_is_consistent:
                task_repository.update_task(
                    db,
                    current,
                    {
                        "status": desired_status,
                        "completed_at": (
                            datetime.now(timezone.utc) if desired_status == "done" else None
                        ),
                    },
                )

        if not current.parent_task_id:
            break
        current = task_repository.get_task_by_id(db, current.parent_task_id)


def update_task(db: Session, task_id: int, current_user_id: int, task_in: TaskUpdate):
    task = get_task(db, task_id, current_user_id)
    update_data = task_in.model_dump(exclude_unset=True)
    if "status" in update_data:
        update_data["status"] = normalize_task_status(update_data["status"])
        if update_data["status"] == "done":
            update_data["completed_at"] = datetime.now(timezone.utc)
        else:
            update_data["completed_at"] = None

    _ensure_task_update_access(db, task, current_user_id, update_data)

    if "estimated_hours" in update_data and _has_child_tasks(db, task.id):
        if update_data["estimated_hours"] != task.estimated_hours:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể trực tiếp sửa thời gian ước tính của task cha. Thời gian ước tính của task cha được tính tự động từ các task con.",
            )
        else:
            del update_data["estimated_hours"]

    if "sprint_id" in update_data and update_data["sprint_id"] is not None:
        project = project_repository.get_project_by_id(db, task.project_id)
        if project:
            _validate_sprint(db, project, update_data["sprint_id"])

    previous_parent_id = task.parent_task_id
    parent_task_id = update_data.get("parent_task_id")
    if parent_task_id == task.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task cannot be its own parent",
        )

    _validate_parent_task(db, task.project_id, parent_task_id)
    _ensure_no_parent_cycle(db, task.id, parent_task_id)

    # Auto-update deadline based on estimated_hours change
    if "estimated_hours" in update_data and "deadline" not in update_data:
        old_estimate = float(task.estimated_hours or 0)
        new_estimate = float(update_data["estimated_hours"] or 0)
        diff_hours = new_estimate - old_estimate
        diff_days = round(diff_hours / 8.0)

        if diff_days != 0 and task.deadline:
            try:
                update_data["deadline"] = task.deadline + timedelta(days=diff_days)
            except (OverflowError, ValueError):
                pass

    start_date = update_data.get("start_date", task.start_date)
    deadline = update_data.get("deadline", task.deadline)
    if start_date and deadline and deadline < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deadline must be after or equal to start date",
        )

    # Track changes for logging
    changes_to_log = []
    for key, new_val in update_data.items():
        if hasattr(task, key):
            old_val = getattr(task, key)
            if old_val != new_val:
                # Convert date/datetime to string for logging if necessary
                old_val_str = str(old_val) if old_val is not None else None
                new_val_str = str(new_val) if new_val is not None else None
                changes_to_log.append((key, old_val_str, new_val_str))

    task = task_repository.update_task(db, task, update_data)

    previous_parent = None
    if "parent_task_id" in update_data:
        actor_member = _get_or_create_actor_member(db, task.project_id, current_user_id)
        if previous_parent_id and previous_parent_id != task.parent_task_id:
            previous_parent = task_repository.get_task_by_id(db, previous_parent_id)
            if previous_parent:
                _sync_ancestor_rollups(db, previous_parent, actor_member.id, include_self=True)
        _sync_ancestor_rollups(db, task, actor_member.id, include_self=False)
    elif task.parent_task_id:
        actor_member = _get_or_create_actor_member(db, task.project_id, current_user_id)
        _sync_ancestor_rollups(db, task, actor_member.id, include_self=False)

    if "status" in update_data or "parent_task_id" in update_data:
        if previous_parent and previous_parent.id != task.parent_task_id:
            _sync_task_and_ancestor_statuses(db, previous_parent, include_self=True)
        _sync_task_and_ancestor_statuses(
            db,
            task,
            include_self=_has_child_tasks(db, task.id),
        )

    for key, old_val_str, new_val_str in changes_to_log:
        create_task_log(
            db=db,
            task_id=task.id,
            user_id=current_user_id,
            action="updated",
            field_changed=key,
            old_value=old_val_str,
            new_value=new_val_str,
        )

    db.commit()
    db.refresh(task)
    return _normalize_task(task), changes_to_log


def add_assignee(
    db: Session,
    task_id: int,
    user_id_to_assign: Optional[str],
    current_user_id: int,
    user_ids_to_assign: Optional[list[str]] = None,
) -> TaskAssigneeChange:
    task = get_task(db, task_id, current_user_id)
    actor_user = _require_project_access(db, task.project_id, current_user_id)

    if _has_child_tasks(db, task.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể gán trực tiếp task cha. Người thực hiện được lấy từ các task lá.",
        )

    previous_user_ids = _task_assignee_user_ids(db, task.id)
    is_manager = _can_manage_project_tasks(db, task.project_id, current_user_id)

    if user_ids_to_assign is not None:
        requested_ids = [_parse_user_id(value) for value in user_ids_to_assign]
        next_user_ids = tuple(dict.fromkeys(user_id for user_id in requested_ids if user_id is not None))
    else:
        parsed_user_id = _parse_user_id(user_id_to_assign)
        next_user_ids = (parsed_user_id,) if parsed_user_id is not None else ()


    change = TaskAssigneeChange(
        previous_user_ids=previous_user_ids,
        current_user_ids=next_user_ids,
    )
    if not change.changed:
        return change

    actor_member = _get_or_create_actor_member(db, task.project_id, actor_user.id)

    if not next_user_ids:
        task_repository.clear_task_assignees(db, task.id)
        _sync_ancestor_rollups(db, task, actor_member.id)
        db.commit()
        return change

    for user_id in next_user_ids:
        assignee_member = project_repository.get_project_member(db, task.project_id, user_id)
        if not assignee_member:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is not a member of this project",
            )

    applied_user_ids = _replace_task_assignees(db, task, next_user_ids, actor_member.id)
    _sync_ancestor_rollups(db, task, actor_member.id)
    db.commit()
    return TaskAssigneeChange(
        previous_user_ids=previous_user_ids,
        current_user_ids=applied_user_ids,
    )


def get_attachments(db: Session, task_id: int, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    return task_repository.list_task_attachments(db, task.id)


def add_attachment(
    db: Session, task_id: int, current_user_id: int, attachment_in: TaskAttachmentCreate
):
    task = get_task(db, task_id, current_user_id)
    actor_member = _get_or_create_actor_member(db, task.project_id, current_user_id)

    attachment_data = attachment_in.model_dump()
    attachment_data["task_id"] = task_id
    attachment_data["uploaded_by"] = actor_member.id

    attachment = task_repository.create_task_attachment(db, attachment_data)
    db.commit()
    db.refresh(attachment)
    return attachment


def get_logworks(db: Session, task_id: int, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    return task_repository.list_task_logworks(db, task.id)


def add_logwork(db: Session, task_id: int, current_user_id: int, logwork_in: LogWorkCreate):
    task = get_task(db, task_id, current_user_id)
    if not _can_manage_project_tasks(
        db, task.project_id, current_user_id
    ) and not task_repository.is_task_assignee(
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

    project = project_repository.get_project_by_id(db, task.project_id)
    if project and project.manager_id == current_user_id:
        logwork_data["status"] = "APPROVED"

    logwork = task_repository.create_logwork(db, logwork_data)
    db.commit()
    db.refresh(logwork)
    return logwork


def _delete_task_recursive(db: Session, task: Task):
    children = task_repository.get_tasks_by_parent_id(db, task.id)
    for child in children:
        _delete_task_recursive(db, child)
    task_repository.delete_task(db, task)


def delete_task(db: Session, task_id: int, current_user_id: int):
    task = get_task(db, task_id, current_user_id)
    _require_project_access(db, task.project_id, current_user_id)
    if not _can_delete_task(db, task.project_id, current_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ có Leader, PM hoặc Quản trị viên mới có quyền xoá task.",
        )
    parent_id = task.parent_task_id
    actor_member = _get_or_create_actor_member(db, task.project_id, current_user_id)
    _delete_task_recursive(db, task)
    if parent_id:
        parent = task_repository.get_task_by_id(db, parent_id)
        if parent:
            _sync_ancestor_rollups(db, parent, actor_member.id, include_self=True)
            _sync_task_and_ancestor_statuses(db, parent, include_self=True)
    db.commit()
