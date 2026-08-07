from datetime import datetime
from sqlalchemy.orm import Session
from app.models.task_log_model import TaskLog
from app.models.notification_model import Notification
from app.models.project_model import Project
from app.models.task_model import Task, TaskAssignees

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

def create_task_notifications(
    db: Session,
    task: Task,
    actor_user_id: int,
    title: str,
    content: str,
):
    """
    Tạo notification cho:
    - PM/Leader của project
    - Các assignees của task
    (Bỏ qua actor_user_id - người thực hiện hành động)
    """
    project = db.query(Project).filter(Project.id == task.project_id).first()
    target_user_ids = set()

    if project and project.manager_id:
        target_user_ids.add(project.manager_id)

    assignees = db.query(TaskAssignees).filter(TaskAssignees.task_id == task.id).all()
    from app.models.project_model import ProjectMember
    for a in assignees:
        member = db.query(ProjectMember).filter(ProjectMember.id == a.project_member_id).first()
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
            link=f"/tasks",
        )
        db.add(notif)
        notifications.append(notif)
    
    db.commit()
    for n in notifications:
        db.refresh(n)
        
    return notifications
