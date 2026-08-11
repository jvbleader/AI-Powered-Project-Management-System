from typing import Any, Dict, List, Optional

from langchain_core.tools import tool
from sqlalchemy import select

from app.models.project_model import Project
from app.models.sprint_model import Sprint
from app.services.ai_services.tools.access import (
    ToolConfig,
    deny_if_cannot_manage_project,
    deny_if_project_inaccessible,
    load_current_user,
    tool_db_session,
)

ALLOWED_SPRINT_STATUSES = {"planning", "active", "closed"}


@tool
def query_sprints(
    project_id: int, status: Optional[str] = None, config: ToolConfig = None
) -> List[Dict[str, Any]]:
    """
    Lấy danh sách các đợt phát triển (Sprint) của dự án.
    Sử dụng để tra cứu tiến độ tổng quan, xem sprint nào đang chạy (active), sắp tới (planning) hay đã đóng (closed).

    [!!! CẢNH BÁO QUAN TRỌNG !!!]: CÔNG CỤ NÀY CHỈ HỖ TRỢ CHO DỰ ÁN DẠNG AGILE. TUYỆT ĐỐI KHÔNG GỌI CÔNG CỤ NÀY NẾU DỰ ÁN LÀ WATERFALL.

    Args:
        project_id: ID của dự án. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        status: Trạng thái sprint (planning, active, closed).
    """
    with tool_db_session() as db:
        denied = deny_if_project_inaccessible(db, load_current_user(db, config), project_id)
        if denied:
            return [denied]

        try:
            project = db.execute(
                select(Project).where(Project.id == project_id)
            ).scalar_one_or_none()
            if not project:
                return [{"error": "Project not found"}]
            if (project.project_type or "").lower() != "agile":
                return [{"error": "Dự án này không phải Agile nên không có Sprint."}]

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
def propose_sprint_status_update(
    sprint_id: int, status: str, config: ToolConfig = None
) -> Dict[str, Any]:
    """
    Chuẩn bị đề xuất đổi trạng thái Sprint (KHÔNG ghi database).
    Dùng khi người dùng muốn bắt đầu (active) hoặc kết thúc (closed) một sprint.

    Sau khi tool trả về thành công, BẮT BUỘC xuất bản nháp markdown:
    ```json_sprint_status_draft
    [{"sprint_id": ..., "project_id": ..., "name": "...", "current_status": "...", "status": "..."}]
    ```
    để người dùng xác nhận trên UI. TUYỆT ĐỐI KHÔNG nói là đã cập nhật xong.

    [!!! CẢNH BÁO !!!]: CHỈ cho dự án AGILE.

    Args:
        sprint_id: ID của sprint cần cập nhật. (BẮT BUỘC)
        status: Trạng thái mới ('planning', 'active', 'closed').
    """
    with tool_db_session() as db:
        normalized = (status or "").strip().lower()
        if normalized not in ALLOWED_SPRINT_STATUSES:
            return {
                "error": (
                    f"Trạng thái không hợp lệ: {status}. "
                    f"Chỉ chấp nhận: {sorted(ALLOWED_SPRINT_STATUSES)}"
                )
            }

        try:
            sprint = db.execute(select(Sprint).where(Sprint.id == sprint_id)).scalars().first()
            if not sprint:
                return {"error": f"Sprint with ID {sprint_id} not found."}

            user = load_current_user(db, config)
            denied_access = deny_if_project_inaccessible(db, user, sprint.project_id)
            if denied_access:
                return denied_access
            denied_manage = deny_if_cannot_manage_project(db, user, sprint.project_id)
            if denied_manage:
                return denied_manage

            project = db.execute(
                select(Project).where(Project.id == sprint.project_id)
            ).scalar_one_or_none()
            if not project or (project.project_type or "").lower() != "agile":
                return {"error": "Chỉ được đổi trạng thái Sprint trên dự án Agile."}

            return {
                "requires_confirmation": True,
                "message": (
                    "Đề xuất hợp lệ. Hãy xuất khối ```json_sprint_status_draft``` "
                    "để người dùng xác nhận. Chưa ghi database."
                ),
                "draft": {
                    "sprint_id": sprint.id,
                    "project_id": sprint.project_id,
                    "name": sprint.name,
                    "current_status": sprint.status,
                    "status": normalized,
                },
            }
        except Exception as e:
            return {"error": str(e)}
