from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.notification_model import Notification
from app.models.project_model import Project, ProjectMember
from app.models.sprint_model import Sprint
from app.models.task_log_model import TaskLog
from app.models.task_model import Task, TaskAssignees

_FIELD_LABELS = {
    "title": "tiêu đề",
    "description": "mô tả",
    "status": "trạng thái",
    "priority": "độ ưu tiên",
    "start_date": "ngày bắt đầu",
    "deadline": "hạn hoàn thành",
    "estimated_hours": "thời gian ước tính",
    "sprint_id": "sprint",
    "parent_task_id": "công việc cha",
}

_STATUS_LABELS = {
    "todo": "Cần làm",
    "in_progress": "Đang tiến hành",
    "done": "Hoàn thành",
}

_PRIORITY_LABELS = {
    "low": "Thấp",
    "medium": "Trung bình",
    "high": "Cao",
    "critical": "Khẩn cấp",
}


def _empty_label() -> str:
    return "trống"


def _format_date_value(value: str | None) -> str:
    if value is None or value == "" or value == "None":
        return _empty_label()
    raw = value.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(raw[:26], fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    try:
        return date.fromisoformat(raw[:10]).strftime("%d/%m/%Y")
    except ValueError:
        return raw


def _format_field_value(
    db: Session,
    field: str,
    value: str | None,
) -> str:
    if value is None or value == "" or value == "None":
        return _empty_label()

    if field == "status":
        return _STATUS_LABELS.get(value.lower(), value)

    if field == "priority":
        return _PRIORITY_LABELS.get(value.lower(), value)

    if field in {"start_date", "deadline"}:
        return _format_date_value(value)

    if field == "estimated_hours":
        try:
            hours = float(value)
            return f"{hours:g} giờ"
        except ValueError:
            return f"{value} giờ"

    if field == "sprint_id":
        try:
            sprint_id = int(float(value))
        except ValueError:
            return value
        sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
        return sprint.name if sprint else f"#{sprint_id}"

    if field == "parent_task_id":
        try:
            parent_id = int(float(value))
        except ValueError:
            return value
        parent = db.query(Task).filter(Task.id == parent_id).first()
        return f'"{parent.title}"' if parent else f"#{parent_id}"

    if field == "description":
        text = value.strip()
        if len(text) > 80:
            return f'"{text[:77]}..."'
        return f'"{text}"'

    if field == "title":
        return f'"{value}"'

    return value


def format_task_update_content(
    db: Session,
    *,
    task_title: str,
    changes: list[tuple[str, str | None, str | None]],
    actor_name: str | None = None,
) -> str:
    """Nội dung thông báo cập nhật task bằng tiếng Việt (không dùng tên cột DB)."""
    parts: list[str] = []
    for field, old_value, new_value in changes:
        label = _FIELD_LABELS.get(field, field.replace("_", " "))
        old_label = _format_field_value(db, field, old_value)
        new_label = _format_field_value(db, field, new_value)
        parts.append(f"{label} từ {old_label} thành {new_label}")

    detail = "; ".join(parts) if parts else "một số thông tin"
    prefix = f"{actor_name} đã cập nhật" if actor_name else "Đã cập nhật"
    return f'{prefix} công việc "{task_title}": {detail}.'


def create_task_log(
    db: Session,
    task_id: int,
    user_id: int,
    action: str,
    field_changed: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
):
    log = TaskLog(
        task_id=task_id,
        user_id=user_id,
        action=action,
        field_changed=field_changed,
        old_value=old_value,
        new_value=new_value,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def notify_task_assigned(
    db: Session,
    *,
    task: Task,
    assignee_user_ids: list[int],
    actor_user_id: int,
    actor_name: str | None = None,
) -> list[Notification]:
    """Tạo TASK_ASSIGNED cho người được giao (bỏ qua người đang assign)."""
    notifications: list[Notification] = []
    unique_ids = {int(uid) for uid in assignee_user_ids if uid is not None}

    for uid in unique_ids:
        if uid == actor_user_id:
            continue

        if actor_name:
            content = f'Công việc "{task.title}" đã được giao cho bạn bởi {actor_name}'
        else:
            content = f'Công việc "{task.title}" đã được giao cho bạn'

        notif = Notification(
            user_id=uid,
            type="TASK_ASSIGNED",
            title="Bạn được giao công việc mới",
            content=content,
            link=f"/projects/{task.project_id}?highlightTaskId={task.id}",
        )
        db.add(notif)
        notifications.append(notif)

    if notifications:
        db.commit()
        for notif in notifications:
            db.refresh(notif)

    return notifications


def notify_task_assignee_changed(
    db: Session,
    *,
    task: Task,
    previous_user_ids: list[int] | tuple[int, ...],
    current_user_ids: list[int] | tuple[int, ...],
    actor_user_id: int,
    actor_name: str | None = None,
) -> list[Notification]:
    """Thông báo chuyển giao cho cả người bị gỡ và người vừa được giao task."""
    previous_ids = {int(uid) for uid in previous_user_ids}
    current_ids = {int(uid) for uid in current_user_ids}
    removed_ids = previous_ids - current_ids
    added_ids = current_ids - previous_ids
    removed_ids.discard(actor_user_id)
    added_ids.discard(actor_user_id)
    actor_suffix = f" bởi {actor_name}" if actor_name else ""
    notifications: list[Notification] = []

    for uid in removed_ids:
        if current_ids:
            title = "Công việc đã được chuyển giao"
            content = (
                f'Công việc "{task.title}" đã được chuyển sang người thực hiện khác'
                f"{actor_suffix}"
            )
        else:
            title = "Bạn không còn phụ trách công việc"
            content = f'Phân công công việc "{task.title}" đã được thu hồi{actor_suffix}'

        notification = Notification(
            user_id=uid,
            type="TASK_UNASSIGNED",
            title=title,
            content=content,
            link=f"/projects/{task.project_id}?highlightTaskId={task.id}",
        )
        db.add(notification)
        notifications.append(notification)

    for uid in added_ids:
        notification = Notification(
            user_id=uid,
            type="TASK_ASSIGNED",
            title="Bạn được giao công việc mới",
            content=f'Công việc "{task.title}" đã được giao cho bạn{actor_suffix}',
            link=f"/projects/{task.project_id}?highlightTaskId={task.id}",
        )
        db.add(notification)
        notifications.append(notification)

    if notifications:
        db.commit()
        for notification in notifications:
            db.refresh(notification)

    return notifications


def notify_logwork_on_task(
    db: Session,
    *,
    task: Task,
    actor_user_id: int,
    actor_name: str | None,
    hours_spent: float,
) -> list[Notification]:
    """Thông báo realtime cho người được giao task khi người khác logwork."""
    assignee_user_ids: set[int] = set()
    assignees = db.query(TaskAssignees).filter(TaskAssignees.task_id == task.id).all()
    for assignee in assignees:
        member = (
            db.query(ProjectMember).filter(ProjectMember.id == assignee.project_member_id).first()
        )
        if member:
            assignee_user_ids.add(member.user_id)

    assignee_user_ids.discard(actor_user_id)
    if not assignee_user_ids:
        return []

    hours_label = f"{hours_spent:g}h"
    actor = actor_name or "Một thành viên"
    notifications: list[Notification] = []
    for uid in assignee_user_ids:
        notification = Notification(
            user_id=uid,
            type="LOGWORK_ON_TASK",
            title="Có người logwork trên task của bạn",
            content=f'{actor} đã ghi {hours_label} trên công việc "{task.title}".',
            link=f"/tasks?taskId={task.id}",
        )
        db.add(notification)
        notifications.append(notification)

    if notifications:
        db.commit()
        for notification in notifications:
            db.refresh(notification)

    return notifications


def create_task_notifications(
    db: Session,
    task: Task,
    actor_user_id: int,
    title: str,
    content: str,
) -> list[Notification]:
    """
    Tạo notification cho:
    - PM/Leader của project
    - Các assignees của task
    (Bỏ qua actor_user_id - người thực hiện hành động)
    """
    project = db.query(Project).filter(Project.id == task.project_id).first()
    target_user_ids: set[int] = set()

    if project and project.manager_id:
        target_user_ids.add(project.manager_id)

    assignees = db.query(TaskAssignees).filter(TaskAssignees.task_id == task.id).all()
    for assignee in assignees:
        member = (
            db.query(ProjectMember).filter(ProjectMember.id == assignee.project_member_id).first()
        )
        if member:
            target_user_ids.add(member.user_id)

    target_user_ids.discard(actor_user_id)

    notifications = []
    for uid in target_user_ids:
        notif = Notification(
            user_id=uid,
            type="TASK_UPDATED",
            title=title,
            content=content,
            link=f"/projects/{task.project_id}?highlightTaskId={task.id}",
        )
        db.add(notif)
        notifications.append(notif)

    if notifications:
        db.commit()
        for notif in notifications:
            db.refresh(notif)

    return notifications
