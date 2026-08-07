from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.connection import SessionLocal
from app.models.logworks import LogWork
from app.models.project_model import ProjectMember, Role
from app.models.task_model import Task, TaskAssignees
from app.models.user_model import User
from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import tool
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session


@tool
def query_team_members(
    project_id: int,
    role: Optional[str] = None,
    search_name: Optional[str] = None,
    is_active: Optional[bool] = True,
    config: RunnableConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu danh sách thành viên trong một dự án cụ thể. Có thể lọc theo vai trò (role) hoặc tìm theo tên.

    Args:
        project_id: ID của dự án cần tra cứu. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        role: Vai trò (ví dụ: "developer", "tester", "product_owner").
        search_name: Từ khóa tìm kiếm theo tên nhân viên (ví dụ: "Thạch").
        is_active: Chỉ lấy những người đang còn làm trong dự án (mặc định là True).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return [{"error": "Database session not available."}]

    try:
        query = (
            select(ProjectMember, User, Role)
            .join(User, ProjectMember.user_id == User.id)
            .join(Role, User.role_id == Role.id)
            .where(ProjectMember.project_id == project_id)
        )

        if is_active is not None:
            query = query.where(ProjectMember.is_active == is_active)
        if role:
            query = query.where(Role.name.ilike(f"%{role}%"))
        if search_name:
            query = query.where(
                or_(User.full_name.ilike(f"%{search_name}%"), User.email.ilike(f"%{search_name}%"))
            )

        members = db.execute(query).all()
        return [
            {
                "user_id": user.id,
                "project_member_id": pm.id,
                "name": user.full_name or user.email,
                "role": role.name if role else "unknown",
            }
            for pm, user, role in members
        ]
    except Exception as e:
        return [{"error": str(e)}]


@tool
def get_user_workload(
    user_id: int,
    project_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    config: RunnableConfig = None,
) -> Dict[str, Any]:
    """
    Đánh giá khối lượng công việc hiện tại của một nhân viên.
    Kiểm tra xem họ đang làm bao nhiêu task, có quá tải hay không, và TỔNG SỐ GIỜ đã log (chấm công) của họ là bao nhiêu.
    Rất hữu ích để tính toán số giờ làm việc trung bình của thành viên trong dự án.

    Args:
        user_id: ID của nhân viên. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        project_id: (Optional) ID dự án để lọc theo dự án.
        start_date: (Optional) Chuỗi ngày YYYY-MM-DD. Lọc task bắt đầu từ ngày này.
        end_date: (Optional) Chuỗi ngày YYYY-MM-DD. Lọc task kết thúc/deadline đến ngày này.
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return {"error": "Database session not available."}

    try:
        query = (
            select(Task)
            .join(TaskAssignees, Task.id == TaskAssignees.task_id)
            .join(ProjectMember, TaskAssignees.project_member_id == ProjectMember.id)
            .where(and_(ProjectMember.user_id == user_id, Task.status.in_(["todo", "in_progress"])))
        )
        if project_id:
            query = query.where(Task.project_id == project_id)
        if start_date:
            query = query.where(Task.start_date >= datetime.strptime(start_date, "%Y-%m-%d").date())
        if end_date:
            query = query.where(Task.deadline <= datetime.strptime(end_date, "%Y-%m-%d").date())

        tasks = db.execute(query).scalars().all()

        # Lấy tổng số giờ đã log của user này
        lw_query = (
            select(func.sum(LogWork.hours_spent))
            .join(ProjectMember, LogWork.project_member_id == ProjectMember.id)
            .where(ProjectMember.user_id == user_id, LogWork.status == "APPROVED")
        )
        if project_id:
            lw_query = lw_query.where(ProjectMember.project_id == project_id)
        total_logged_hours = db.execute(lw_query).scalar() or 0.0

        return {
            "user_id": user_id,
            "active_tasks_count": len(tasks),
            "total_logged_hours": float(total_logged_hours),
            "tasks": [
                {"task_id": t.id, "title": t.title, "status": t.status, "project_id": t.project_id}
                for t in tasks
            ],
        }
    except Exception as e:
        return {"error": str(e)}
