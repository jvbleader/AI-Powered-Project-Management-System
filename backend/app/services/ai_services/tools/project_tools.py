from typing import Any, Dict, List, Optional

from langchain_core.tools import tool
from sqlalchemy import func, select

from app.models.project_model import Project
from app.models.task_model import Task
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
def query_projects(
    keyword: Optional[str] = None,
    status: Optional[str] = None,
    managed_only: Optional[bool] = None,
    config: ToolConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu danh sách dự án.
    - BẮT BUỘC TRUYỀN `managed_only=True` khi người dùng hỏi về "các dự án tôi đang quản lý", "tiến độ dự án tôi quản lý". 
    - Nếu quên truyền, kết quả trả về sẽ có cờ `is_managed_by_you`. Dựa vào cờ này, NẾU KHÔNG CÓ DỰ ÁN NÀO LÀ TRUE thì phải báo: "Bạn không quản lí bất kì dự án nào".

    Args:
        keyword: Từ khóa trong tên dự án (tùy chọn).
        status: Trạng thái dự án (ví dụ: "active", "completed").
        managed_only: BẮT BUỘC True nếu user hỏi về dự án họ quản lý.
    """
    with tool_db_session() as db:
        user = load_current_user(db, config)
        allowed_ids = accessible_project_ids(db, user)
        if not allowed_ids:
            return [{"error": "Bạn không có dự án nào được phép truy cập."}]

        manager_ids_set = set(managed_project_ids(db, user))

        if managed_only:
            from app.utils.project_helpers import (
                is_admin_user,
                has_companywide_project_access,
                user_role_requires_manager_scope
            )
            is_manager = is_admin_user(user) or has_companywide_project_access(user) or user_role_requires_manager_scope(user)
            if not is_manager:
                return [{"error": "Bạn không quản lí bất kì dự án nào"}]

            scope_ids = [pid for pid in manager_ids_set if pid in allowed_ids]
            if not scope_ids:
                return [{"info": "Bạn không quản lí bất kì dự án nào"}]
        else:
            scope_ids = allowed_ids

        try:
            query = select(Project).where(Project.id.in_(scope_ids))
            if keyword:
                query = query.where(Project.name.ilike(f"%{keyword}%"))
            if status:
                query = query.where(Project.status == status)
            projects = db.execute(query).scalars().all()
            return [
                {
                    "project_id": p.id,
                    "name": p.name,
                    "status": p.status,
                    "project_type": p.project_type,
                    "is_managed_by_you": p.id in manager_ids_set,
                }
                for p in projects
            ]
        except Exception as e:
            return [{"error": str(e)}]


@tool
def get_project_overview(project_id: int, config: ToolConfig = None) -> Dict[str, Any]:
    """
    Lấy thông tin chi tiết tổng quan của một dự án (thời gian, người quản lý, số lượng task).

    Args:
        project_id: ID của dự án. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
    """
    with tool_db_session() as db:
        user = load_current_user(db, config)
        denied = deny_if_project_inaccessible(db, user, project_id)
        if denied:
            return denied

        try:
            project = db.execute(
                select(Project).where(Project.id == project_id)
            ).scalar_one_or_none()
            if not project:
                return {"error": "Project not found"}

            total_tasks = db.execute(
                select(func.count(Task.id)).where(Task.project_id == project_id)
            ).scalar()
            done_tasks = db.execute(
                select(func.count(Task.id)).where(
                    Task.project_id == project_id, Task.status == "done"
                )
            ).scalar()

            manager_name = None
            if project.manager_id:
                manager = db.execute(
                    select(User).where(User.id == project.manager_id)
                ).scalar_one_or_none()
                if manager:
                    manager_name = manager.full_name or manager.email

            return {
                "project_id": project.id,
                "name": project.name,
                "status": project.status,
                "project_type": project.project_type,
                "manager_name": manager_name,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "end_date": project.end_date.isoformat() if project.end_date else None,
                "total_tasks": total_tasks,
                "completed_tasks": done_tasks,
            }
        except Exception as e:
            return {"error": str(e)}
