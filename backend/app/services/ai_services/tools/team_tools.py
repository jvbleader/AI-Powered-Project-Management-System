from datetime import datetime
from typing import Any, Dict, List, Optional

from langchain_core.tools import tool
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.logworks import LogWork
from app.models.project_model import Project, ProjectMember, Role
from app.models.task_model import Task, TaskAssignees
from app.models.user_model import User
from app.services.ai_services.tools.access import (
    ToolConfig,
    accessible_project_ids,
    deny_if_project_inaccessible,
    load_current_user,
    tool_db_session,
)


@tool
def query_team_members(
    project_id: Optional[int] = None,
    role: Optional[str] = None,
    search_name: Optional[str] = None,
    user_id: Optional[int] = None,
    is_active: Optional[bool] = True,
    config: ToolConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu thành viên dự án theo tên/email/user_id.
    - Có `project_id`: chỉ tìm trong 1 dự án.
    - KHÔNG có `project_id`: tìm trên TẤT CẢ dự án người dùng hiện tại được phép truy cập
      (dùng khi hỏi "người này còn trong dự án nào", "có thuộc dự án tôi quản lý không").
    - Khi tạo task: `assignee_id` phải lấy từ `user_id` trong kết quả, KHÔNG dùng `project_member_id`.

    Args:
        project_id: (Tùy chọn) ID dự án. Bỏ trống để quét mọi dự án accessible.
        role: Vai trò (ví dụ: "developer", "tester", "product_owner").
        search_name: Từ khóa tìm theo tên/email (ví dụ: "Anh Hồng").
        user_id: (Tùy chọn) ID user cụ thể nếu đã biết.
        is_active: Chỉ lấy member đang active (mặc định True).
    """
    with tool_db_session() as db:
        current = load_current_user(db, config)
        allowed_ids = accessible_project_ids(db, current)
        if not allowed_ids:
            return [{"error": "Bạn không có dự án nào được phép truy cập."}]

        if project_id is not None:
            denied = deny_if_project_inaccessible(db, current, project_id)
            if denied:
                return [denied]
            scope_ids = [project_id]
        else:
            scope_ids = allowed_ids

        if not search_name and user_id is None and role is None and project_id is None:
            return [{
                "error": (
                    "Cần ít nhất search_name hoặc user_id khi quét nhiều dự án. "
                    "Hoặc truyền project_id để liệt kê toàn bộ thành viên 1 dự án."
                )
            }]

        try:
            query = (
                select(ProjectMember, User, Role, Project)
                .join(User, ProjectMember.user_id == User.id)
                .join(Role, User.role_id == Role.id)
                .join(Project, ProjectMember.project_id == Project.id)
                .where(ProjectMember.project_id.in_(scope_ids))
            )

            if is_active is not None:
                query = query.where(ProjectMember.is_active == is_active)
            if role:
                query = query.where(Role.name.ilike(f"%{role}%"))
            if user_id is not None:
                query = query.where(User.id == user_id)
            if search_name:
                query = query.where(
                    or_(
                        User.full_name.ilike(f"%{search_name}%"),
                        User.email.ilike(f"%{search_name}%"),
                    )
                )

            rows = db.execute(query).all()
            return [
                {
                    "user_id": user.id,
                    "project_member_id": pm.id,
                    "name": user.full_name or user.email,
                    "role": role_obj.name if role_obj else "unknown",
                    "project_id": project.id,
                    "project_name": project.name,
                }
                for pm, user, role_obj, project in rows
            ]
        except Exception as e:
            return [{"error": str(e)}]


@tool
def get_user_workload(
    user_id: int,
    project_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    config: ToolConfig = None,
) -> Dict[str, Any]:
    """
    Đánh giá workload hiện tại của một nhân viên: số task đang mở, tổng giờ ước lượng còn lại,
    và lịch (start_date–deadline) từng task để phát hiện chồng lịch khi gán việc mới.

    Args:
        user_id: ID của nhân viên. (BẮT BUỘC)
        project_id: (Optional) ID dự án để lọc theo dự án.
        start_date: (Optional) YYYY-MM-DD. Lọc task bắt đầu từ ngày này.
        end_date: (Optional) YYYY-MM-DD. Lọc task deadline đến ngày này.
    """
    with tool_db_session() as db:
        user = load_current_user(db, config)
        allowed_ids = accessible_project_ids(db, user)
        if not allowed_ids:
            return {"error": "Bạn không có dự án nào được phép truy cập."}

        if project_id is not None:
            denied = deny_if_project_inaccessible(db, user, project_id)
            if denied:
                return denied
            scope_ids = [project_id]
        else:
            scope_ids = allowed_ids

        try:
            query = (
                select(Task)
                .join(TaskAssignees, Task.id == TaskAssignees.task_id)
                .join(ProjectMember, TaskAssignees.project_member_id == ProjectMember.id)
                .where(
                    and_(
                        ProjectMember.user_id == user_id,
                        Task.status.in_(["todo", "in_progress"]),
                        Task.project_id.in_(scope_ids),
                    )
                )
            )
            if start_date:
                query = query.where(
                    Task.start_date >= datetime.strptime(start_date, "%Y-%m-%d").date()
                )
            if end_date:
                query = query.where(
                    Task.deadline <= datetime.strptime(end_date, "%Y-%m-%d").date()
                )

            tasks = db.execute(query).scalars().all()

            lw_query = (
                select(func.sum(LogWork.hours_spent))
                .join(ProjectMember, LogWork.project_member_id == ProjectMember.id)
                .where(
                    ProjectMember.user_id == user_id,
                    LogWork.status == "APPROVED",
                    ProjectMember.project_id.in_(scope_ids),
                )
            )
            total_logged_hours = db.execute(lw_query).scalar() or 0.0

            return {
                "user_id": user_id,
                "active_tasks_count": len(tasks),
                "open_estimated_hours": round(
                    sum(float(t.estimated_hours or 0) for t in tasks), 1
                ),
                "total_logged_hours": float(total_logged_hours),
                "busy_windows": [
                    {
                        "task_id": t.id,
                        "title": t.title,
                        "status": t.status,
                        "project_id": t.project_id,
                        "start_date": t.start_date.isoformat() if t.start_date else None,
                        "deadline": t.deadline.isoformat() if t.deadline else None,
                        "estimated_hours": float(t.estimated_hours) if t.estimated_hours else 0,
                    }
                    for t in tasks
                ],
                "tasks": [
                    {
                        "task_id": t.id,
                        "title": t.title,
                        "status": t.status,
                        "project_id": t.project_id,
                        "start_date": t.start_date.isoformat() if t.start_date else None,
                        "deadline": t.deadline.isoformat() if t.deadline else None,
                        "estimated_hours": float(t.estimated_hours) if t.estimated_hours else 0,
                    }
                    for t in tasks
                ],
            }
        except Exception as e:
            return {"error": str(e)}


def query_project_team_workload(db: Session, project_id: int) -> Dict[str, Any]:
    members = db.execute(
        select(ProjectMember, User, Role)
        .join(User, ProjectMember.user_id == User.id)
        .join(Role, User.role_id == Role.id)
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.is_active.is_(True),
        )
    ).all()

    open_tasks = db.execute(
        select(Task, ProjectMember.user_id)
        .join(TaskAssignees, Task.id == TaskAssignees.task_id)
        .join(ProjectMember, TaskAssignees.project_member_id == ProjectMember.id)
        .where(
            ProjectMember.project_id == project_id,
            Task.status.in_(["todo", "in_progress"]),
        )
    ).all()

    tasks_by_user: Dict[int, List[Task]] = {}
    for task, uid in open_tasks:
        tasks_by_user.setdefault(uid, []).append(task)

    team = []
    for _pm, member_user, role_obj in members:
        member_tasks = tasks_by_user.get(member_user.id, [])
        windows = [
            {
                "task_id": t.id,
                "title": t.title,
                "status": t.status,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "deadline": t.deadline.isoformat() if t.deadline else None,
                "estimated_hours": float(t.estimated_hours) if t.estimated_hours else 0,
            }
            for t in member_tasks
        ]
        team.append(
            {
                "user_id": member_user.id,
                "name": member_user.full_name or member_user.email,
                "role": role_obj.name if role_obj else "unknown",
                "active_tasks_count": len(member_tasks),
                "open_estimated_hours": round(
                    sum(float(t.estimated_hours or 0) for t in member_tasks), 1
                ),
                "busy_windows": windows,
            }
        )

    team.sort(key=lambda row: (row["open_estimated_hours"], row["active_tasks_count"]))
    return {
        "project_id": project_id,
        "member_count": len(team),
        "team": team,
        "overlap_rule": (
            "Hai khoảng [start_date, deadline] chồng nhau khi "
            "start_a <= deadline_b AND start_b <= deadline_a. "
            "Không gán task mới cho người có busy_windows chồng với lịch task mới."
        ),
    }


@tool
def get_project_team_workload(project_id: int, config: ToolConfig = None) -> Dict[str, Any]:
    """
    Lấy workload + lịch task đang mở (todo/in_progress) của TOÀN BỘ thành viên dự án.
    BẮT BUỘC gọi TRƯỚC khi tự gán người: so sánh workload, deadline, phát hiện chồng lịch.
    Hai task chồng lịch khi khoảng [start_date, deadline] giao nhau.

    Args:
        project_id: ID của dự án. (BẮT BUỘC)
    """
    with tool_db_session() as db:
        user = load_current_user(db, config)
        denied = deny_if_project_inaccessible(db, user, project_id)
        if denied:
            return denied

        try:
            return query_project_team_workload(db, project_id)
        except Exception as e:
            return {"error": str(e)}
