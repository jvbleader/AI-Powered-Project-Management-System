from langchain_core.tools import tool
from langchain_core.runnables.config import RunnableConfig
from sqlalchemy.orm import Session
from datetime import datetime
from collections import defaultdict

from app.models.user_model import User
from app.repositories import project_repository, task_repository
from app.services import project_service
from app.utils.dashboard_helpers import list_leaf_tasks, build_task_progress_map, calculate_progress_percent
from app.utils.ai_rules import get_business_today, get_business_now, is_overdue, is_task_stalled, resolve_last_signal, is_open_task, is_high_priority

def _get_db_context(config: RunnableConfig):
    db: Session = config.get("configurable", {}).get("db")
    project_id: int = config.get("configurable", {}).get("project_id")
    current_user: User = config.get("configurable", {}).get("current_user")
    if not db or not current_user:
        raise ValueError("Missing db or current_user in config")
    
    if project_id is not None:
        project = project_service.require_project_access(db, project_id, current_user)
        projects = [project]
    else:
        projects, _, _ = project_service.list_projects(db, current_user, status="ACTIVE", page_size=1000)
    
    return db, projects

@tool
def get_project_summary(config: RunnableConfig) -> str:
    """Lấy thông tin tổng quan về dự án và tiến độ hoàn thành chung."""
    try:
        db, projects = _get_db_context(config)
    except Exception as e:
        return f"Lỗi: {e}"
        
    if not projects:
        return "Người dùng chưa tham gia dự án nào đang mở."
        
    project_ids = [p.id for p in projects]
    all_tasks = task_repository.list_tasks(db, project_ids=project_ids)
    leaf_tasks = list_leaf_tasks(all_tasks)
    
    recent_logwork_rows = task_repository.list_project_logworks_with_context(db, project_ids=project_ids)
    task_progress_map = build_task_progress_map([row[0] for row in recent_logwork_rows])
    project_progress = calculate_progress_percent(all_tasks, task_progress_map)
    
    parts = ["[Tổng quan dự án]"]
    for p in projects:
        parts.append(f"- ID: {p.id}, Tên: {p.name}")
    parts.append(f"Tiến độ hoàn thành: {project_progress}%")
    parts.append(f"Có tổng cộng {len(all_tasks)} task, trong đó {len(leaf_tasks)} task chi tiết (leaf task).")
    return "\n".join(parts)

@tool
def get_stalled_tasks(config: RunnableConfig) -> str:
    """Truy vấn danh sách các task đang bị đóng băng (không có cập nhật trong thời gian dài)."""
    try:
        db, projects = _get_db_context(config)
    except Exception as e:
        return f"Lỗi: {e}"
        
    project_ids = [p.id for p in projects]
    all_tasks = task_repository.list_tasks(db, project_ids=project_ids)
    leaf_tasks = list_leaf_tasks(all_tasks)
    
    recent_logwork_rows = task_repository.list_project_logworks_with_context(db, project_ids=project_ids)
    latest_logwork_by_task_id = {}
    for logwork, task, _, _ in recent_logwork_rows:
        if task.id not in latest_logwork_by_task_id:
            latest_logwork_by_task_id[task.id] = logwork
            
    today = get_business_today()
    now = get_business_now()
    
    stalled_tasks = []
    for task in leaf_tasks:
        latest_logwork = latest_logwork_by_task_id.get(task.id)
        last_signal = resolve_last_signal(
            task.updated_at,
            latest_logwork.updated_at if latest_logwork else None,
            latest_logwork.created_at if latest_logwork else None,
        )
        if is_task_stalled(task, last_signal, today, now):
            stalled_tasks.append(task)
            
    if not stalled_tasks:
        return "Hiện tại không có task nào bị đóng băng."
        
    parts = ["[Các task đóng băng]"]
    for task in stalled_tasks:
        parts.append(f"- Task {task.id}: {task.title} (Status: {task.status})")
    return "\n".join(parts)

@tool
def get_overdue_tasks(config: RunnableConfig) -> str:
    """Truy vấn danh sách các task đã trễ hạn (overdue)."""
    try:
        db, projects = _get_db_context(config)
    except Exception as e:
        return f"Lỗi: {e}"
        
    project_ids = [p.id for p in projects]
    all_tasks = task_repository.list_tasks(db, project_ids=project_ids)
    leaf_tasks = list_leaf_tasks(all_tasks)
    
    today = get_business_today()
    overdue_tasks = [task for task in leaf_tasks if is_overdue(task, today)]
    
    if not overdue_tasks:
        return "Tuyệt vời, không có task nào trễ hạn."
        
    parts = ["[Các task trễ hạn]"]
    for task in overdue_tasks:
        deadline = task.deadline.strftime("%Y-%m-%d") if task.deadline else "None"
        parts.append(f"- Task {task.id}: {task.title} (Status: {task.status}, Deadline: {deadline})")
    return "\n".join(parts)

@tool
def get_my_tasks(config: RunnableConfig) -> str:
    """Truy vấn danh sách các task đang mở (chưa hoàn thành) của chính bạn (người đang hỏi)."""
    try:
        db, projects = _get_db_context(config)
        current_user = config.get("configurable", {}).get("current_user")
    except Exception as e:
        return f"Lỗi: {e}"
        
    project_ids = [p.id for p in projects]
    all_tasks = task_repository.list_tasks(db, project_ids=project_ids)
    leaf_tasks = list_leaf_tasks(all_tasks)
    
    assignee_rows = task_repository.list_task_assignee_users(db, [task.id for task in leaf_tasks])
    my_task_ids = set()
    for task_id, user_id, _, _ in assignee_rows:
        if user_id == current_user.id:
            my_task_ids.add(task_id)
            
    my_open_tasks = [task for task in leaf_tasks if task.id in my_task_ids and is_open_task(task)]
    
    if not my_open_tasks:
        return "Bạn không có task nào đang mở hiện tại."
        
    parts = ["[Danh sách task của bạn]"]
    for task in my_open_tasks:
        deadline = task.deadline.strftime("%Y-%m-%d") if task.deadline else "Không có"
        parts.append(f"- Task {task.id}: {task.title} (Status: {task.status}, Deadline: {deadline})")
    return "\n".join(parts)

@tool
def get_member_workload(config: RunnableConfig) -> str:
    """Kiểm tra khối lượng công việc của các thành viên trong dự án xem ai rảnh, ai quá tải."""
    from app.utils.ai_rules import is_member_overloaded
    try:
        db, projects = _get_db_context(config)
    except Exception as e:
        return f"Lỗi: {e}"
        
    project_ids = [p.id for p in projects]
    all_tasks = task_repository.list_tasks(db, project_ids=project_ids)
    leaf_tasks = list_leaf_tasks(all_tasks)
    
    assignee_rows = task_repository.list_task_assignee_users(db, [task.id for task in all_tasks])
    assignees_by_task_id = defaultdict(list)
    for task_id, user_id, full_name, email in assignee_rows:
        assignees_by_task_id[task_id].append({"user_id": user_id, "name": (full_name or email).strip()})
        
    member_rows = []
    for pid in project_ids:
        member_rows.extend(project_repository.list_project_members(db, pid))
        
    member_by_user_id = {}
    for pm, user, role in member_rows:
        if user.id not in member_by_user_id:
            member_by_user_id[user.id] = {"name": (user.full_name or user.email).strip(), "role_name": role.name}
            
    open_tasks_by_user_id = defaultdict(list)
    high_priority_open_task_count_by_user_id = defaultdict(int)
    
    for task in leaf_tasks:
        if not is_open_task(task):
            continue
        for assignee in assignees_by_task_id.get(task.id, []):
            uid = assignee["user_id"]
            open_tasks_by_user_id[uid].append(task)
            if is_high_priority(task.priority):
                high_priority_open_task_count_by_user_id[uid] += 1
                
    parts = ["[Khối lượng công việc thành viên]"]
    for uid, member in member_by_user_id.items():
        open_tasks = open_tasks_by_user_id.get(uid, [])
        high_priority = high_priority_open_task_count_by_user_id.get(uid, 0)
        is_overloaded = is_member_overloaded(len(open_tasks), high_priority)
        status = "QUÁ TẢI" if is_overloaded else ("RẢNH" if len(open_tasks) == 0 else "BÌNH THƯỜNG")
        parts.append(f"- {member['name']} ({member['role_name']}, ID: {uid}): Đang có {len(open_tasks)} task mở ({high_priority} ưu tiên cao) -> {status}")
        
    if len(parts) == 1:
        return "Không có thông tin thành viên dự án."
    return "\n".join(parts)
