from typing import List, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.task_model import Task
from app.models.user_model import User
from app.repositories import task_repository, project_repository

def execute_create_tasks(db: Session, current_user: User, project_id: int | None, tasks_data: List[Dict[str, Any]], parent_task_id: int | None = None, _is_recursive: bool = False) -> List[Task]:
    """
    Thực thi việc tạo các task sau khi người dùng (Project Manager) đã confirm bản nháp.
    - tasks_data là danh sách các dict chứa thông tin: title, description, assignee_id, priority, type, project_id...
    - Hỗ trợ tạo task đệ quy cho cấu trúc cây WBS (waterfall) qua mảng 'subtasks'.
    """
    created_tasks = []
    
    for td in tasks_data:
        # Lấy project_id từ payload chung hoặc từ từng task
        pid = project_id or td.get("project_id")
        if not pid:
            raise ValueError(f"Không xác định được dự án (project_id) để tạo task: '{td.get('title')}'.")
            
        # Kiểm tra quyền tạo trong project này
        creator_member = project_repository.get_project_member(db, int(pid), current_user.id)
        if not creator_member:
            raise ValueError(f"Bạn không phải là thành viên của dự án (ID: {pid}).")

        # Chuẩn bị dữ liệu cho bảng tasks
        task_data = {
            "project_id": pid,
            "title": td.get("title", "Không có tiêu đề"),
            "description": td.get("description", ""),
            "created_by_member_id": creator_member.id,
            "status": td.get("status", "todo"),
            "priority": td.get("priority", "medium"),
            "start_date": datetime.now(timezone.utc).date()
        }
        
        # parent_task_id argument overrides payload if provided (for recursive calls)
        pid_parent = parent_task_id or td.get("parent_task_id")
        if pid_parent:
            task_data["parent_task_id"] = pid_parent

        if td.get("estimated_hours") is not None:
            try:
                task_data["estimated_hours"] = float(td["estimated_hours"])
            except ValueError:
                pass

        if td.get("start_date"):
            try:
                task_data["start_date"] = datetime.strptime(td["start_date"], "%Y-%m-%d").date()
            except ValueError:
                pass
                
        if td.get("deadline"):
            try:
                task_data["deadline"] = datetime.strptime(td["deadline"], "%Y-%m-%d").date()
            except ValueError:
                pass
        
        # 1. Tạo task chính
        task = task_repository.create_task(db, task_data)
        
        # 2. Xử lý người được giao (Assignee)
        assignee_user_id = td.get("assignee_id")
        assignee_name = td.get("assignee_name")
        assignee_member = None

        if assignee_user_id:
            try:
                assignee_user_id = int(assignee_user_id)
                # Đổi từ user_id sang project_member_id
                assignee_member = project_repository.get_project_member(db, int(pid), assignee_user_id)
            except (ValueError, TypeError):
                pass # Bỏ qua nếu assignee_id không hợp lệ

        if not assignee_member and assignee_name:
            from app.models.project_model import ProjectMember
            from app.models.user_model import User
            # Tìm theo tên nếu assignee_id lỗi hoặc không có
            member_with_user = db.query(ProjectMember).join(User, ProjectMember.user_id == User.id).filter(
                ProjectMember.project_id == int(pid),
                User.full_name.ilike(f"%{assignee_name.strip()}%")
            ).first()
            if member_with_user:
                assignee_member = member_with_user

        if assignee_member:
            task_repository.add_task_assignee(
                db=db,
                task_id=task.id,
                project_member_id=assignee_member.id,
                assigned_by=creator_member.id
            )
        
        created_tasks.append(task)
        
        # 3. Đệ quy tạo subtasks (nếu có)
        subtasks_data = td.get("subtasks")
        if subtasks_data and isinstance(subtasks_data, list):
            sub_created = execute_create_tasks(db, current_user, int(pid), subtasks_data, parent_task_id=task.id, _is_recursive=True)
            created_tasks.extend(sub_created)
        
    # Commit changes chỉ ở level gốc
    if not _is_recursive:
        db.commit()
    return created_tasks
