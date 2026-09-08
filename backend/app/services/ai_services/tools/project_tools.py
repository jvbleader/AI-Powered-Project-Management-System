from typing import Any, Dict, List, Optional

from langchain_core.tools import tool
from sqlalchemy import func, select

from app.models.project_model import Project, ProjectMember
from app.models.sprint_model import Sprint
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
                has_companywide_project_access,
                is_admin_user,
                user_role_requires_manager_scope,
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
    Lấy nội dung và tiến độ hiện tại của một dự án: mô tả, lịch, số task theo trạng thái,
    danh sách việc chưa xong, và sprint (nếu Agile).
    BẮT BUỘC gọi tool này TRƯỚC khi lập bản nháp sprint / task / cây task.

    Args:
        project_id: ID của dự án. (BẮT BUỘC)
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

            from datetime import datetime, timezone
            today = datetime.now(timezone.utc).date()

            status_rows = db.execute(
                select(Task.status, func.count(Task.id))
                .where(Task.project_id == project_id)
                .group_by(Task.status)
            ).all()
            task_status_counts = {row[0]: int(row[1]) for row in status_rows}
            total_tasks = sum(task_status_counts.values())
            done_tasks = task_status_counts.get("done", 0)
            in_progress_tasks = task_status_counts.get("in_progress", 0)
            todo_tasks = task_status_counts.get("todo", 0)
            progress_percent = round((done_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0.0

            priority_rows = db.execute(
                select(Task.priority, func.count(Task.id))
                .where(Task.project_id == project_id)
                .group_by(Task.priority)
            ).all()
            priority_counts = {row[0]: int(row[1]) for row in priority_rows}

            overdue_count = db.execute(
                select(func.count(Task.id))
                .where(
                    Task.project_id == project_id,
                    Task.status != "done",
                    Task.deadline != None,
                    Task.deadline < today,
                )
            ).scalar() or 0

            open_tasks = db.execute(
                select(Task)
                .where(Task.project_id == project_id, Task.status != "done")
                .order_by(Task.id.asc())
                .limit(200)
            ).scalars().all()

            manager_name = None
            if project.manager_id:
                manager = db.execute(
                    select(User).where(User.id == project.manager_id)
                ).scalar_one_or_none()
                if manager:
                    manager_name = manager.full_name or manager.email

            open_task_ids = [t.id for t in open_tasks]
            assignee_map: Dict[int, List[str]] = {}
            if open_task_ids:
                assignee_rows = db.execute(
                    select(TaskAssignees.task_id, User.full_name)
                    .join(ProjectMember, TaskAssignees.project_member_id == ProjectMember.id)
                    .join(User, ProjectMember.user_id == User.id)
                    .where(TaskAssignees.task_id.in_(open_task_ids))
                ).all()
                for tid, name in assignee_rows:
                    if name:
                        assignee_map.setdefault(tid, []).append(name)

            project_duration_days = (project.end_date - project.start_date).days if (project.end_date and project.start_date) else None
            project_days_remaining = (project.end_date - today).days if project.end_date else None

            # Quét toàn bộ cây phân cấp công việc (Tree Hierarchy) của dự án
            all_project_tasks = db.execute(
                select(Task.id, Task.title, Task.parent_task_id)
                .where(Task.project_id == project_id)
                .order_by(Task.id.asc())
            ).all()
            task_title_map = {row[0]: row[1] for row in all_project_tasks}
            task_parent_map = {row[0]: row[2] for row in all_project_tasks}

            def get_task_hierarchy(tid: int):
                depth = 0
                curr = task_parent_map.get(tid)
                parent_title = task_title_map.get(curr) if curr else None
                ancestors = []
                while curr is not None:
                    depth += 1
                    if curr in task_title_map:
                        ancestors.append(f"[ID: {curr}] {task_title_map[curr]}")
                    curr = task_parent_map.get(curr)
                path_str = " -> ".join(reversed(ancestors)) if ancestors else "Task gốc (Hạng mục chính)"
                return depth, parent_title, path_str

            # Phân loại và lập danh sách task chi tiết kèm tất cả task báo động ở mọi cấp độ
            serialized_open_tasks = []
            alarm_tasks = []
            for t in open_tasks:
                depth, p_title, path_str = get_task_hierarchy(t.id)
                is_overdue = bool(t.deadline and t.deadline < today and t.status != "done")
                days_rem = (t.deadline - today).days if t.deadline else None
                task_data = {
                    "task_id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "parent_task_id": t.parent_task_id,
                    "parent_task_title": p_title,
                    "tree_path": path_str,
                    "tree_depth": depth,
                    "is_subtask": depth > 0,
                    "task_level_name": "Task gốc (Hạng mục chính)" if depth == 0 else f"Subtask cấp {depth}",
                    "sprint_id": t.sprint_id,
                    "start_date": t.start_date.isoformat() if t.start_date else None,
                    "deadline": t.deadline.isoformat() if t.deadline else None,
                    "duration_days": (t.deadline - t.start_date).days if (t.deadline and t.start_date) else None,
                    "is_overdue": is_overdue,
                    "days_remaining_or_overdue": days_rem,
                    "estimated_hours": float(t.estimated_hours) if t.estimated_hours else 0,
                    "assignees": assignee_map.get(t.id, []),
                }
                serialized_open_tasks.append(task_data)

                # Điều kiện báo động (Alarm Task) ở TẤT CẢ các cấp (cả task gốc lẫn mọi subtask sâu nhất)
                if (
                    (t.priority in ("critical", "high") and t.status in ("todo", "in_progress"))
                    or is_overdue
                    or (days_rem is not None and days_rem <= 3 and t.status != "done")
                ):
                    alarm_tasks.append(task_data)

            # Thống kê số lượng task báo động theo từng nhân sự
            alarm_by_user: Dict[str, List[Dict[str, Any]]] = {}
            for at in alarm_tasks:
                assignees = at.get("assignees") or []
                if not assignees:
                    alarm_by_user.setdefault("Chưa phân công", []).append(at)
                else:
                    for name in assignees:
                        alarm_by_user.setdefault(name, []).append(at)

            alarm_tasks_by_assignee = sorted(
                [
                    {
                        "assignee_name": name,
                        "alarm_task_count": len(user_tasks),
                        "task_ids": [t["task_id"] for t in user_tasks],
                    }
                    for name, user_tasks in alarm_by_user.items()
                ],
                key=lambda x: x["alarm_task_count"],
                reverse=True,
            )

            overview: Dict[str, Any] = {
                "project_id": project.id,
                "name": project.name,
                "status": project.status,
                "project_type": project.project_type,
                "description": project.description or "",
                "manager_name": manager_name,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "end_date": project.end_date.isoformat() if project.end_date else None,
                "duration_days": project_duration_days,
                "days_remaining_to_deadline": project_days_remaining,
                "is_project_overdue": bool(project.end_date and project.end_date < today and project.status != "completed"),
                "total_tasks": total_tasks,
                "completed_tasks": done_tasks,
                "in_progress_tasks": in_progress_tasks,
                "todo_tasks": todo_tasks,
                "progress_percent": progress_percent,
                "overdue_tasks_count": overdue_count,
                "task_status_counts": task_status_counts,
                "priority_breakdown": priority_counts,
                "tree_summary": {
                    "total_root_tasks": sum(1 for row in all_project_tasks if row[2] is None),
                    "total_subtasks": sum(1 for row in all_project_tasks if row[2] is not None),
                },
                "total_alarm_tasks_count": len(alarm_tasks),
                "alarm_tasks_by_assignee": alarm_tasks_by_assignee,
                "alarm_tasks": alarm_tasks,
                "open_tasks": serialized_open_tasks,
            }

            if (project.project_type or "").lower() == "agile":
                sprints = db.execute(
                    select(Sprint)
                    .where(Sprint.project_id == project_id)
                    .order_by(Sprint.start_date.asc(), Sprint.id.asc())
                ).scalars().all()
                overview["sprints"] = [
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

            return overview
        except Exception as e:
            return {"error": str(e)}
