from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.task_model import Task
from app.models.user_model import User
from app.repositories import project_repository, task_repository
from app.services.ai_services.task_title_rules import validate_meaningful_task_titles
from app.services.task_service import _get_or_create_actor_member
from app.utils.project_helpers import user_can_manage_project


def execute_create_tasks(
    db: Session,
    current_user: User,
    project_id: int | None,
    tasks_data: List[Dict[str, Any]],
    parent_task_id: int | None = None,
    _is_recursive: bool = False,
) -> List[Task]:
    """
    Thực thi việc tạo các task sau khi người dùng đã confirm bản nháp.
    - Mọi user đăng nhập đều được tạo task ở bất kỳ dự án nào (tự join nếu chưa member).
    - Assignee phải là member của dự án.
    """
    from datetime import datetime, timezone

    validate_meaningful_task_titles(tasks_data)

    created_tasks = []

    for td in tasks_data:
        pid = project_id or td.get("project_id")
        if not pid:
            raise ValueError(f"Không xác định được dự án (project_id) để tạo task: '{td.get('title')}'.")

        pid = int(pid)
        if not project_repository.get_project_by_id(db, pid):
            raise ValueError(f"Không tìm thấy dự án (ID: {pid}).")

        creator_member = _get_or_create_actor_member(db, pid, current_user.id)

        task_data = {
            "project_id": pid,
            "title": td.get("title", "Không có tiêu đề"),
            "description": td.get("description", ""),
            "created_by_member_id": creator_member.id,
            "status": td.get("status", "todo"),
            "priority": td.get("priority", "medium"),
            "start_date": datetime.now(timezone.utc).date(),
        }

        pid_parent = parent_task_id or td.get("parent_task_id")
        if pid_parent:
            task_data["parent_task_id"] = pid_parent

        if td.get("estimated_hours") is not None:
            try:
                task_data["estimated_hours"] = float(td["estimated_hours"])
            except (ValueError, TypeError):
                pass

        if td.get("start_date"):
            try:
                task_data["start_date"] = datetime.strptime(td["start_date"], "%Y-%m-%d").date()
            except ValueError:
                pass

        if td.get("deadline"):
            try:
                task_data["deadline"] = datetime.strptime(td["deadline"], "%Y-%m-%d").date()
            except ValueError:
                pass

        task = task_repository.create_task(db, task_data)

        assignee_user_id = td.get("assignee_id")
        assignee_name = td.get("assignee_name")
        assignee_member = None

        def _resolve_assignee_member(raw_id: int):
            """AI hay nhầm project_member.id với users.id — chấp nhận cả hai."""
            by_user = project_repository.get_project_member(db, pid, raw_id)
            if by_user:
                return by_user
            return project_repository.get_project_member_by_id(db, raw_id, pid)

        if assignee_user_id is not None and str(assignee_user_id).strip() != "":
            try:
                raw_assignee_id = int(assignee_user_id)
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"assignee_id không hợp lệ: {assignee_user_id!r}."
                ) from exc

            assignee_member = _resolve_assignee_member(raw_assignee_id)

        if not assignee_member and assignee_name:
            from app.models.project_model import ProjectMember
            from app.models.user_model import User as UserModel

            member_with_user = (
                db.query(ProjectMember)
                .join(UserModel, ProjectMember.user_id == UserModel.id)
                .filter(
                    ProjectMember.project_id == pid,
                    ProjectMember.is_active.is_(True),
                    UserModel.full_name.ilike(f"%{assignee_name.strip()}%"),
                )
                .first()
            )
            if member_with_user:
                assignee_member = member_with_user

        if assignee_user_id is not None and str(assignee_user_id).strip() != "" and not assignee_member:
            raise ValueError(
                f"Người được giao (id={assignee_user_id}"
                f"{f', tên: {assignee_name}' if assignee_name else ''}) "
                f"không phải thành viên dự án {pid}."
            )

        if assignee_member:
            task_repository.add_task_assignee(
                db=db,
                task_id=task.id,
                project_member_id=assignee_member.id,
                assigned_by=creator_member.id,
            )

        created_tasks.append(task)

        subtasks_data = td.get("subtasks")
        if subtasks_data and isinstance(subtasks_data, list):
            sub_created = execute_create_tasks(
                db,
                current_user,
                pid,
                subtasks_data,
                parent_task_id=task.id,
                _is_recursive=True,
            )
            created_tasks.extend(sub_created)

    if not _is_recursive:
        db.commit()
        from app.services.task_log_service import notify_task_assigned

        for task in created_tasks:
            db.refresh(task)
            assignee_rows = task_repository.list_task_assignee_users(db, [task.id])
            assignee_user_ids = [user_id for _task_id, user_id, _name, _email in assignee_rows]
            if assignee_user_ids:
                notify_task_assigned(
                    db,
                    task=task,
                    assignee_user_ids=assignee_user_ids,
                    actor_user_id=current_user.id,
                    actor_name=current_user.full_name,
                )

    return created_tasks


def execute_update_sprint_statuses(
    db: Session,
    current_user: User,
    updates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Áp dụng đổi trạng thái sprint sau HITL confirm."""
    from app.models.project_model import Project
    from app.models.sprint_model import Sprint

    allowed = {"planning", "active", "closed"}
    results: List[Dict[str, Any]] = []

    for item in updates:
        sprint_id = item.get("sprint_id")
        status = (item.get("status") or "").strip().lower()
        if not sprint_id:
            raise ValueError("Thiếu sprint_id.")
        if status not in allowed:
            raise ValueError(f"Trạng thái không hợp lệ: {status}")

        sprint = db.query(Sprint).filter(Sprint.id == int(sprint_id)).first()
        if not sprint:
            raise ValueError(f"Không tìm thấy sprint ID {sprint_id}.")

        if not user_can_manage_project(db, sprint.project_id, current_user):
            raise ValueError(f"Bạn không có quyền cập nhật sprint thuộc dự án {sprint.project_id}.")

        project = db.query(Project).filter(Project.id == sprint.project_id).first()
        if not project or (project.project_type or "").lower() != "agile":
            raise ValueError("Chỉ cập nhật được trạng thái Sprint trên dự án Agile.")

        sprint.status = status
        results.append(
            {
                "sprint_id": sprint.id,
                "project_id": sprint.project_id,
                "name": sprint.name,
                "status": sprint.status,
            }
        )

    db.commit()
    return results
