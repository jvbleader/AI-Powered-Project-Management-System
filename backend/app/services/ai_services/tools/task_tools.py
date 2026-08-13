from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from langchain_core.tools import tool
from sqlalchemy import and_, func, or_, select

from app.models.project_model import Project, ProjectMember
from app.models.task_model import Task, TaskAssignees
from app.models.user_model import User
from app.services.ai_services.tools.access import (
    ToolConfig,
    accessible_project_ids,
    deny_if_project_inaccessible,
    load_current_user,
    managed_project_ids,
    tool_db_session,
)


@tool
def query_tasks(
    project_id: Optional[int] = None,
    task_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    is_overdue: Optional[bool] = None,
    managed_only: Optional[bool] = None,
    limit: int = 50,
    config: ToolConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu danh sách công việc (tasks) HOẶC chi tiết của MỘT task cụ thể.
    - Có `project_id`: chỉ trong 1 dự án.
    - `managed_only=True`: chỉ các dự án thuộc phạm vi quản lý.
      Với PM/PO/GM (và Leader) = mọi dự án đang join, không lọc theo projects.manager_id.
    - Không có project_id và managed_only=False/None: quét mọi dự án accessible.

    Cách hiểu câu hỏi thường gặp:
    - "task quá hạn của tôi" (cá nhân): is_overdue=True + assignee_id = Current User ID.
    - "task quá hạn trong dự án tôi quản lý" / "task quá hạn / dự án tôi quản lý":
      is_overdue=True + managed_only=True (không gắn assignee trừ khi user nói "được giao cho tôi").
    - "task quá hạn" chung, không nói "tôi quản lý": is_overdue=True, bỏ trống project_id.

    Args:
        project_id: (Tùy chọn) ID dự án. Bỏ trống để quét nhiều dự án.
        task_id: (Tùy chọn) ID task cụ thể. Nếu có task_id thì BẮT BUỘC có project_id.
        status: Trạng thái (todo, in_progress, done).
        priority: Mức ưu tiên (low, medium, high, urgent).
        assignee_id: ID User được giao task. Dùng Current User ID khi hỏi task "của tôi" theo nghĩa được assign.
        sprint_id: ID sprint.
        is_overdue: True = task quá hạn chưa hoàn thành.
        managed_only: True = chỉ dự án user quản lý (manager).
        limit: Số kết quả tối đa (mặc định 50).
    """
    with tool_db_session() as db:
        user = load_current_user(db, config)
        allowed_ids = accessible_project_ids(db, user)
        if not allowed_ids:
            return [{"error": "Bạn không có dự án nào được phép truy cập."}]

        if project_id is not None:
            denied = deny_if_project_inaccessible(db, user, project_id)
            if denied:
                return [denied]
            scope_ids = [project_id]
        elif managed_only:
            managed_ids = managed_project_ids(db, user)
            scope_ids = [pid for pid in managed_ids if pid in allowed_ids]
            if not scope_ids:
                return [{"info": "Bạn không quản lý dự án nào (hoặc không có dự án trong phạm vi)."}]
        else:
            scope_ids = allowed_ids

        if task_id is not None and project_id is None:
            return [{"error": "Khi xem chi tiết 1 task (task_id), cần truyền project_id."}]

        try:
            if task_id:
                t = db.execute(
                    select(Task).where(Task.id == task_id, Task.project_id == project_id)
                ).scalar_one_or_none()
                if not t:
                    return [{"error": f"Task {task_id} not found in this project"}]

                ta_records = db.execute(
                    select(ProjectMember, User)
                    .join(User, ProjectMember.user_id == User.id)
                    .join(TaskAssignees, TaskAssignees.project_member_id == ProjectMember.id)
                    .where(TaskAssignees.task_id == task_id)
                ).all()

                assignees = [
                    {"user_id": user_row.id, "name": user_row.full_name or user_row.email}
                    for pm, user_row in ta_records
                ]

                return [
                    {
                        "task_id": t.id,
                        "project_id": t.project_id,
                        "sprint_id": t.sprint_id,
                        "title": t.title,
                        "description": t.description,
                        "status": t.status,
                        "priority": t.priority,
                        "start_date": t.start_date.isoformat() if t.start_date else None,
                        "deadline": t.deadline.isoformat() if t.deadline else None,
                        "estimated_hours": float(t.estimated_hours) if t.estimated_hours else 0,
                        "spent_hours": t.spent_hours,
                        "assignees": assignees,
                    }
                ]

            query = select(Task, Project.name).join(Project, Project.id == Task.project_id).where(
                Task.project_id.in_(scope_ids)
            )
            if status:
                query = query.where(Task.status == status)
            if priority:
                query = query.where(Task.priority == priority)
            if sprint_id:
                query = query.where(Task.sprint_id == sprint_id)
            if is_overdue is True:
                effective_deadline = func.coalesce(Task.deadline, Task.start_date)
                query = query.where(
                    and_(
                        Task.status != "done",
                        effective_deadline != None,
                        effective_deadline < datetime.now(timezone.utc).date(),
                    )
                )
            elif is_overdue is False:
                effective_deadline = func.coalesce(Task.deadline, Task.start_date)
                query = query.where(
                    or_(
                        effective_deadline == None,
                        effective_deadline >= datetime.now(timezone.utc).date(),
                    )
                )

            if assignee_id:
                query = (
                    query.join(TaskAssignees, Task.id == TaskAssignees.task_id)
                    .join(ProjectMember, TaskAssignees.project_member_id == ProjectMember.id)
                    .where(ProjectMember.user_id == assignee_id)
                )

            rows = db.execute(query.limit(limit)).all()
            result = []
            for t, project_name in rows:
                assignees = (
                    db.execute(
                        select(User.full_name)
                        .join(ProjectMember, User.id == ProjectMember.user_id)
                        .join(TaskAssignees, TaskAssignees.project_member_id == ProjectMember.id)
                        .where(TaskAssignees.task_id == t.id)
                    )
                    .scalars()
                    .all()
                )
                result.append(
                    {
                        "task_id": t.id,
                        "project_id": t.project_id,
                        "project_name": project_name,
                        "title": t.title,
                        "status": t.status,
                        "priority": t.priority,
                        "parent_task_id": t.parent_task_id,
                        "sprint_id": t.sprint_id,
                        "deadline": t.deadline.isoformat() if t.deadline else None,
                        "assignees": assignees,
                    }
                )
            return result
        except Exception as e:
            return [{"error": str(e)}]
