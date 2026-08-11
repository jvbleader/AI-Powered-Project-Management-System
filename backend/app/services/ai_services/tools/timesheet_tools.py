from datetime import datetime
from typing import Any, Dict, List, Optional

from langchain_core.tools import tool
from sqlalchemy import select

from app.models.logworks import LogWork
from app.models.project_model import ProjectMember
from app.models.task_model import Task
from app.models.user_model import User
from app.services.ai_services.tools.access import (
    ToolConfig,
    accessible_project_ids,
    deny_if_project_inaccessible,
    load_current_user,
    tool_db_session,
)


@tool
def query_logworks(
    project_id: Optional[int] = None,
    task_id: Optional[int] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
    config: ToolConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu nhật ký làm việc (logworks / timesheet). Tích hợp tìm kiếm theo dự án, theo 1 task cụ thể, hoặc theo 1 nhân viên cụ thể.

    Args:
        project_id: (Tùy chọn) Truyền ID của dự án nếu muốn xem toàn bộ chấm công của dự án. (Ưu tiên số 1 nếu người dùng hỏi về dự án)
        task_id: (Tùy chọn) Truyền ID của task nếu muốn xem riêng những ai đã làm task này.
        user_id: (Tùy chọn) Truyền ID nhân viên nếu muốn xem riêng người này đã làm gì.
        start_date: (Tùy chọn) Chuỗi ngày YYYY-MM-DD.
        end_date: (Tùy chọn) Chuỗi ngày YYYY-MM-DD.
        limit: Số lượng kết quả trả về tối đa (mặc định 100).
    """
    with tool_db_session() as db:
        if not any([project_id, task_id, user_id]):
            return [{"error": "Phải cung cấp ít nhất project_id, task_id hoặc user_id"}]

        user = load_current_user(db, config)
        allowed_ids = accessible_project_ids(db, user)
        if not allowed_ids:
            return [{"error": "Bạn không có dự án nào được phép truy cập."}]

        if project_id is not None:
            denied = deny_if_project_inaccessible(db, user, project_id)
            if denied:
                return [denied]

        try:
            query = (
                select(LogWork, ProjectMember, User, Task)
                .join(ProjectMember, LogWork.project_member_id == ProjectMember.id)
                .join(User, ProjectMember.user_id == User.id)
                .join(Task, LogWork.task_id == Task.id)
                .where(ProjectMember.project_id.in_(allowed_ids))
            )

            if project_id:
                query = query.where(ProjectMember.project_id == project_id)
            if task_id:
                query = query.where(LogWork.task_id == task_id)
            if user_id:
                query = query.where(ProjectMember.user_id == user_id)

            if start_date:
                query = query.where(
                    LogWork.work_date >= datetime.strptime(start_date, "%Y-%m-%d").date()
                )
            if end_date:
                query = query.where(
                    LogWork.work_date <= datetime.strptime(end_date, "%Y-%m-%d").date()
                )

            query = query.order_by(LogWork.work_date.desc()).limit(limit)
            logworks = db.execute(query).all()
            return [
                {
                    "logwork_id": lw.id,
                    "user_name": u.full_name or u.email,
                    "user_id": u.id,
                    "task_name": task.title,
                    "project_id": pm.project_id,
                    "work_date": lw.work_date.isoformat() if lw.work_date else None,
                    "hours_spent": float(lw.hours_spent),
                    "work_content": lw.work_content,
                    "status": lw.status,
                }
                for lw, pm, u, task in logworks
            ]
        except Exception as e:
            return [{"error": str(e)}]
