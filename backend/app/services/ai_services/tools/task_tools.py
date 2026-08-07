from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.connection import SessionLocal
from app.models.project_model import ProjectMember
from app.models.task_model import Task, TaskAssignees
from app.models.user_model import User
from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import tool
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

@tool
def query_tasks(
    project_id: int,
    task_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    is_overdue: Optional[bool] = None,
    limit: int = 50,
    config: RunnableConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu danh sách công việc (tasks) HOẶC chi tiết của MỘT task cụ thể trong dự án. 
    Rất hữu ích khi cần kiểm tra các task trễ hạn, ưu tiên cao, task của một người cụ thể, hoặc thông tin chi tiết 1 task.

    Args:
        project_id: ID của dự án cần tra cứu. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        task_id: (Tùy chọn) Truyền ID của task nếu muốn xem chi tiết chuyên sâu của riêng task đó. Nếu có task_id, các filter khác bị bỏ qua.
        status: Trạng thái (todo, in_progress, done, cancel).
        priority: Mức ưu tiên (low, medium, high, urgent).
        assignee_id: ID của User (user_id) được giao task. Dùng get_project_members để tìm ID người này trước.
        sprint_id: ID của đợt chạy nước rút (sprint).
        is_overdue: Truyền True nếu lấy task quá hạn chưa hoàn thành. Truyền False cho các task chưa quá hạn.
        limit: Số lượng kết quả trả về tối đa (mặc định 50).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return [{"error": "Database session not available."}]

    try:
        # Nếu có task_id, trả về thông tin chi tiết của task đó luôn
        if task_id:
            t = db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id)).scalar_one_or_none()
            if not t:
                return [{"error": f"Task {task_id} not found in this project"}]

            ta_records = db.execute(
                select(ProjectMember, User)
                .join(User, ProjectMember.user_id == User.id)
                .join(TaskAssignees, TaskAssignees.project_member_id == ProjectMember.id)
                .where(TaskAssignees.task_id == task_id)
            ).all()

            assignees = [{"user_id": user.id, "name": user.full_name or user.email} for pm, user in ta_records]

            return [{
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
            }]

        # Nếu không có task_id, tiến hành query danh sách
        query = select(Task).where(Task.project_id == project_id)
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

        tasks = db.execute(query.limit(limit)).scalars().all()
        result = []
        for t in tasks:
            # Lấy thông tin người được giao nhanh
            assignees = []
            ta_records = (
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
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "deadline": t.deadline.isoformat() if t.deadline else None,
                    "assignees": ta_records,
                }
            )
        return result
    except Exception as e:
        return [{"error": str(e)}]
