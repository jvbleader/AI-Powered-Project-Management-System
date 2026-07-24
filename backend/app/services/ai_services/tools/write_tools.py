from typing import List, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.task_model import Task
from app.models.user_model import User
from app.repositories import task_repository, project_repository

def execute_create_tasks(db: Session, current_user: User, project_id: int, tasks_data: List[Dict[str, Any]]) -> List[Task]:
    """
    Thực thi việc tạo các task sau khi người dùng (Project Manager) đã confirm bản nháp.
    - tasks_data là danh sách các dict chứa thông tin: title, description, assignee_id, priority, type...
    """
    # Lấy project_member của người dùng hiện tại (người tạo task)
    creator_member = project_repository.get_project_member(db, project_id, current_user.id)
    if not creator_member:
        raise ValueError("Bạn không phải là thành viên của dự án này.")
        
    created_tasks = []
    
    for td in tasks_data:
        # Chuẩn bị dữ liệu cho bảng tasks
        task_data = {
            "project_id": project_id,
            "title": td.get("title", "Không có tiêu đề"),
            "description": td.get("description", ""),
            "created_by_member_id": creator_member.id,
            "status": "todo",
            "priority": td.get("priority", "medium"),
            "start_date": datetime.now(timezone.utc).date()
        }
        
        # 1. Tạo task chính
        task = task_repository.create_task(db, task_data)
        
        # 2. Xử lý người được giao (Assignee)
        assignee_user_id = td.get("assignee_id")
        if assignee_user_id:
            try:
                assignee_user_id = int(assignee_user_id)
                # Đổi từ user_id sang project_member_id
                assignee_member = project_repository.get_project_member(db, project_id, assignee_user_id)
                if assignee_member:
                    task_repository.add_task_assignee(
                        db=db,
                        task_id=task.id,
                        project_member_id=assignee_member.id,
                        assigned_by=creator_member.id
                    )
            except (ValueError, TypeError):
                pass # Bỏ qua nếu assignee_id không hợp lệ
        
        created_tasks.append(task)
        
    # Commit changes
    db.commit()
    return created_tasks
