from typing import Any, Dict, List, Optional

from app.core.connection import SessionLocal
from app.models.project_model import Project
from app.models.task_model import Task
from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import tool
from sqlalchemy import func, select
from sqlalchemy.orm import Session

@tool
def query_projects(
    keyword: Optional[str] = None, 
    status: Optional[str] = None, 
    config: RunnableConfig = None
) -> List[Dict[str, Any]]:
    """
    Tra cứu danh sách dự án dựa theo tên (keyword) hoặc trạng thái.
    Sử dụng tool này khi cần tìm project_id của một dự án mà người dùng nhắc tới.

    Args:
        keyword: Từ khóa tìm kiếm trong tên dự án (ví dụ: "Alpha", "Website"). (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        status: Trạng thái dự án (ví dụ: "active", "completed"). Nếu để trống sẽ không lọc theo trạng thái.
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return [{"error": "Database session not available."}]
    try:
        query = select(Project)
        if keyword:
            query = query.where(Project.name.ilike(f"%{keyword}%"))
        if status:
            query = query.where(Project.status == status)
        projects = db.execute(query).scalars().all()
        return [
            {"project_id": p.id, "name": p.name, "status": p.status, "project_type": p.project_type}
            for p in projects
        ]
    except Exception as e:
        return [{"error": str(e)}]

@tool
def get_project_overview(project_id: int, config: RunnableConfig = None) -> Dict[str, Any]:
    """
    Lấy thông tin chi tiết tổng quan của một dự án (thời gian, người quản lý, số lượng task).

    Args:
        project_id: ID của dự án. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return {"error": "Database session not available."}
    try:
        project = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
        if not project:
            return {"error": "Project not found"}

        # Thống kê task
        total_tasks = db.execute(
            select(func.count(Task.id)).where(Task.project_id == project_id)
        ).scalar()
        done_tasks = db.execute(
            select(func.count(Task.id)).where(Task.project_id == project_id, Task.status == "done")
        ).scalar()

        return {
            "project_id": project.id,
            "name": project.name,
            "status": project.status,
            "project_type": project.project_type,
            "manager_name": project.manager.full_name if project.manager else None,
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "end_date": project.end_date.isoformat() if project.end_date else None,
            "total_tasks": total_tasks,
            "completed_tasks": done_tasks,
        }
    except Exception as e:
        return {"error": str(e)}
