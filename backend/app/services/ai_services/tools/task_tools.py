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
    keyword: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    is_overdue: Optional[bool] = None,
    managed_only: Optional[bool] = None,
    leaf_only: Optional[bool] = None,
    exclude_done: Optional[bool] = None,
    limit: int = 200,
    config: ToolConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu danh sách công việc (tasks) HOẶC chi tiết của MỘT task cụ thể theo ID hoặc Tên/Keyword.
    - Có `project_id`: chỉ trong 1 dự án.
    - Có `keyword`: tìm kiếm task theo tiêu đề/tên (VD: keyword="Thiết kế API xác thực OTP").
    - `managed_only=True`: chỉ các dự án thuộc phạm vi quản lý.
      Với PM/PO/GM (và Leader) = mọi dự án đang join, không lọc theo projects.manager_id.
    - `leaf_only=True`: CHỈ lấy các subtask/task thực thi ở tầng lá (không lấy các task cha/hạng mục tổng quan).
      RẤT KHUYÊN DÙNG khi hỏi danh sách việc cần làm hàng ngày của cá nhân ("hôm nay tôi cần làm gì", "task của tôi").
    - `exclude_done=True`: LOẠI BỎ các task đã hoàn thành (status == 'done'). BẮT BUỘC dùng khi hỏi các task "cần làm" / "chưa xong".
    - Không có project_id và managed_only=False/None: quét mọi dự án accessible.

    Cách hiểu câu hỏi thường gặp:
    - "hôm nay tôi có những task nào cần làm / task của tôi / việc của tôi / tôi đang phụ trách việc gì": BẮT BUỘC truyền assignee_id = Current User ID, project_id, leaf_only=True và exclude_done=True.
    - "tìm task tên X / trực thuộc task X": truyền keyword="X" kèm project_id để tìm task cha đã tồn tại.
    - "task quá hạn của tôi" (cá nhân): is_overdue=True + assignee_id = Current User ID.
    - "task quá hạn trong dự án tôi quản lý" / "task quá hạn / dự án tôi quản lý":
      is_overdue=True + managed_only=True (không gắn assignee trừ khi user nói "được giao cho tôi").
    - "task quá hạn" chung, không nói "tôi quản lý": is_overdue=True, bỏ trống project_id.

    Args:
        project_id: (Tùy chọn) ID dự án. Bỏ trống để quét nhiều dự án.
        task_id: (Tùy chọn) ID task cụ thể. Nếu có task_id thì BẮT BUỘC có project_id.
        keyword: (Tùy chọn) Từ khóa hoặc tên task cần tìm kiếm trong dự án.
        status: Trạng thái (todo, in_progress, done).
        priority: Mức ưu tiên (low, medium, high, urgent).
        assignee_id: ID User được giao task. BẮT BUỘC dùng Current User ID khi hỏi task "của tôi", "tôi cần làm gì", "việc của tôi".
        leaf_only: (Tùy chọn) True = chỉ lấy task thực thi/subtask tầng lá (bỏ qua task cha/hạng mục tổng hợp).
        exclude_done: (Tùy chọn) True = loại bỏ task đã xong (status == 'done').
        sprint_id: ID sprint.
        is_overdue: True = task quá hạn chưa hoàn thành.
        managed_only: True = chỉ dự án user quản lý (manager).
        limit: Số kết quả tối đa (mặc định 200).
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
            if keyword and keyword.strip():
                query = query.where(Task.title.ilike(f"%{keyword.strip()}%"))
            if status:
                query = query.where(Task.status == status)
            elif exclude_done:
                query = query.where(Task.status != "done")
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
                    .distinct()
                )

            if leaf_only:
                parent_subq = select(Task.parent_task_id).where(Task.parent_task_id.isnot(None))
                query = query.where(Task.id.not_in(parent_subq))

            today = datetime.now(timezone.utc).date()
            rows = db.execute(query.limit(limit)).all()

            # Tra cứu toàn bộ cây phả hệ (ancestor tree path) cho mọi cấp độ
            all_parent_lookup: Dict[int, tuple[str, Optional[int]]] = {
                t.id: (t.title, t.parent_task_id) for t, _ in rows
            }
            parent_ids = {t.parent_task_id for t, _ in rows if t.parent_task_id}
            if parent_ids:
                curr_missing = parent_ids - set(all_parent_lookup.keys())
                while curr_missing:
                    p_rows = db.execute(
                        select(Task.id, Task.title, Task.parent_task_id).where(Task.id.in_(curr_missing))
                    ).all()
                    if not p_rows:
                        break
                    new_missing = set()
                    for pid, ptitle, pparent in p_rows:
                        all_parent_lookup[pid] = (ptitle, pparent)
                        if pparent and pparent not in all_parent_lookup:
                            new_missing.add(pparent)
                    curr_missing = new_missing

            def compute_hierarchy(tid: int, ttitle: str, pid: Optional[int]) -> tuple[int, str, Optional[str]]:
                path_titles = [ttitle]
                curr_p = pid
                visited = {tid}
                parent_title = None
                if curr_p and curr_p in all_parent_lookup:
                    parent_title = all_parent_lookup[curr_p][0]

                while curr_p and curr_p in all_parent_lookup and curr_p not in visited:
                    visited.add(curr_p)
                    ptitle, next_p = all_parent_lookup[curr_p]
                    path_titles.append(ptitle)
                    curr_p = next_p

                path_titles.reverse()
                level = len(path_titles) - 1
                tree_path = " > ".join(path_titles)
                return level, tree_path, parent_title

            # Xác định các task có chứa subtask con bên dưới
            all_parent_ids_in_db = set(
                db.execute(select(Task.parent_task_id).where(Task.parent_task_id != None)).scalars().all()
            )

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
                level, tree_path, p_title = compute_hierarchy(t.id, t.title, t.parent_task_id)
                has_children = t.id in all_parent_ids_in_db
                level_label = "Task gốc (Hạng mục chính)" if level == 0 else f"Subtask cấp {level}"
                task_type_label = "Hạng mục cha (Chứa subtask)" if has_children else ("Subtask thực thi" if t.parent_task_id else "Task đơn lẻ")

                item_dict = {
                    "task_id": t.id,
                    "project_id": t.project_id,
                    "project_name": project_name,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "level": level,
                    "level_label": level_label,
                    "has_subtasks": has_children,
                    "is_leaf": not has_children,
                    "task_type_label": task_type_label,
                    "tree_path": tree_path,
                    "is_subtask": bool(t.parent_task_id),
                    "sprint_id": t.sprint_id,
                    "start_date": t.start_date.isoformat() if t.start_date else None,
                    "deadline": t.deadline.isoformat() if t.deadline else None,
                    "duration_days": (t.deadline - t.start_date).days if (t.deadline and t.start_date) else None,
                    "is_overdue": bool(t.deadline and t.deadline < today and t.status != "done"),
                    "days_remaining_or_overdue": (t.deadline - today).days if t.deadline else None,
                    "assignees": assignees,
                }
                if not leaf_only:
                    item_dict["parent_task_id"] = t.parent_task_id
                    item_dict["parent_task_title"] = p_title

                result.append(item_dict)
            return result
        except Exception as e:
            return [{"error": str(e)}]
