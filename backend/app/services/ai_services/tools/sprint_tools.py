from typing import Any, Dict, List, Optional
from app.core.connection import SessionLocal
from app.models.sprint_model import Sprint
from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import tool
from sqlalchemy import select
from sqlalchemy.orm import Session

@tool
def query_sprints(
    project_id: int, status: Optional[str] = None, config: RunnableConfig = None
) -> List[Dict[str, Any]]:
    """
    Lấy danh sách các đợt phát triển (Sprint) của dự án.
    Sử dụng để tra cứu tiến độ tổng quan, xem sprint nào đang chạy (active), sắp tới (planning) hay đã đóng (closed).
    
    [!!! CẢNH BÁO QUAN TRỌNG !!!]: CÔNG CỤ NÀY CHỈ HỖ TRỢ CHO DỰ ÁN DẠNG AGILE. TUYỆT ĐỐI KHÔNG GỌI CÔNG CỤ NÀY NẾU DỰ ÁN LÀ WATERFALL.

    Args:
        project_id: ID của dự án. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        status: Trạng thái sprint (planning, active, closed).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return [{"error": "Database session not available."}]
    try:
        query = select(Sprint).where(Sprint.project_id == project_id)
        if status:
            query = query.where(Sprint.status == status)

        sprints = db.execute(query).scalars().all()
        return [
            {
                "sprint_id": s.id,
                "name": s.name,
                "status": s.status,
                "start_date": s.start_date.isoformat() if s.start_date else None,
                "end_date": s.end_date.isoformat() if s.end_date else None,
                "goal": s.goal,
            }
            for s in sprints
        ]
    except Exception as e:
        return [{"error": str(e)}]

@tool
def update_sprint_status(
    sprint_id: int, status: str, config: RunnableConfig = None
) -> Dict[str, Any]:
    """
    Cập nhật trạng thái của đợt phát triển (Sprint).
    Sử dụng để bắt đầu (active) hoặc kết thúc (closed) một sprint.

    [!!! CẢNH BÁO QUAN TRỌNG !!!]: CÔNG CỤ NÀY CHỈ HỖ TRỢ CHO DỰ ÁN DẠNG AGILE. TUYỆT ĐỐI KHÔNG GỌI CÔNG CỤ NÀY NẾU DỰ ÁN LÀ WATERFALL.

    Args:
        sprint_id: ID của sprint cần cập nhật. (BẮT BUỘC)
        status: Trạng thái mới của sprint (ví dụ: 'active', 'closed').
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return {"error": "Database session not available."}
    try:
        sprint = db.execute(select(Sprint).where(Sprint.id == sprint_id)).scalars().first()
        if not sprint:
            return {"error": f"Sprint with ID {sprint_id} not found."}
        
        sprint.status = status
        db.commit()
        db.refresh(sprint)
        
        return {
            "success": True,
            "message": f"Sprint status updated to {status}",
            "sprint_id": sprint.id,
            "status": sprint.status
        }
    except Exception as e:
        db.rollback()
        return {"error": str(e)}


