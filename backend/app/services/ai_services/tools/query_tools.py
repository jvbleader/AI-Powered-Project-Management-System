from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.connection import SessionLocal
from app.models.logworks import LogWork
from app.models.project_model import Project, ProjectMember, Role
from app.models.sprint_model import Sprint
from app.models.task_model import Task, TaskAssignees
from app.models.user_model import User

from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import tool
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session


@tool
def search_projects(
    keyword: str, status: Optional[str] = None, config: RunnableConfig = None
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
        query = select(Project).where(Project.name.ilike(f"%{keyword}%"))
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
def get_project_details(project_id: int, config: RunnableConfig = None) -> Dict[str, Any]:
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


@tool
def get_project_members(
    project_id: int,
    role: Optional[str] = None,
    search_name: Optional[str] = None,
    is_active: Optional[bool] = True,
    config: RunnableConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu danh sách thành viên trong một dự án cụ thể. Có thể lọc theo vai trò (role) hoặc tìm theo tên.

    Args:
        project_id: ID của dự án cần tra cứu. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        role: Vai trò (ví dụ: "developer", "tester", "product_owner").
        search_name: Từ khóa tìm kiếm theo tên nhân viên (ví dụ: "Thạch").
        is_active: Chỉ lấy những người đang còn làm trong dự án (mặc định là True).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return [{"error": "Database session not available."}]

    try:
        query = (
            select(ProjectMember, User, Role)
            .join(User, ProjectMember.user_id == User.id)
            .join(Role, User.role_id == Role.id)
            .where(ProjectMember.project_id == project_id)
        )

        if is_active is not None:
            query = query.where(ProjectMember.is_active == is_active)
        if role:
            query = query.where(Role.name.ilike(f"%{role}%"))
        if search_name:
            query = query.where(
                or_(User.full_name.ilike(f"%{search_name}%"), User.email.ilike(f"%{search_name}%"))
            )

        members = db.execute(query).all()
        return [
            {
                "user_id": user.id,
                "project_member_id": pm.id,
                "name": user.full_name or user.email,
                "role": role.name if role else "unknown",
            }
            for pm, user, role in members
        ]
    except Exception as e:
        return [{"error": str(e)}]


@tool
def get_project_tasks(
    project_id: int,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    is_overdue: Optional[bool] = None,
    limit: int = 50,
    config: RunnableConfig = None,
) -> List[Dict[str, Any]]:
    """
    Tra cứu danh sách công việc (tasks) trong một dự án. Rất hữu ích khi cần kiểm tra các task trễ hạn, ưu tiên cao, hoặc task của một người cụ thể.

    Args:
        project_id: ID của dự án cần tra cứu. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        status: Trạng thái (todo, in_progress, done, cancel).
        priority: Mức ưu tiên (low, medium, high, urgent).
        assignee_id: ID của User (user_id) được giao task. Dùng get_project_members để tìm ID người này trước.
        sprint_id: ID của đợt chạy nước rút (sprint).
        is_overdue: Truyền True nếu muốn lấy các task đã quá hạn deadline nhưng chưa hoàn thành (status != 'done' và deadline < current_date). Truyền False cho các task chưa quá hạn.
        limit: Số lượng kết quả trả về tối đa (mặc định 50).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return [{"error": "Database session not available."}]

    try:
        query = select(Task).where(Task.project_id == project_id)
        if status:
            query = query.where(Task.status == status)
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
            # Join with TaskAssignees and ProjectMember to filter by user_id
            query = (
                query.join(TaskAssignees, Task.id == TaskAssignees.task_id)
                .join(ProjectMember, TaskAssignees.project_member_id == ProjectMember.id)
                .where(ProjectMember.user_id == assignee_id)
            )

        tasks = db.execute(query.limit(limit)).scalars().all()
        result = []
        for t in tasks:
            assignees = []
            ta_records = (
                db.execute(
                    select(User.full_name)
                    .join(ProjectMember, User.id == ProjectMember.user_id)
                    .join(TaskAssignees, TaskAssignees.project_member_id == ProjectMember.id)
                    .where(TaskAssignees.task_id == t.id)
                )
                .scalars()
                .all()
            )

            result.append(
                {
                    "task_id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "deadline": t.deadline.isoformat() if t.deadline else None,
                    "assignees": ta_records,
                }
            )
        return result
    except Exception as e:
        return [{"error": str(e)}]


@tool
def get_task_details(task_id: int, config: RunnableConfig = None) -> Dict[str, Any]:
    """
    Xem thông tin chuyên sâu của một task cụ thể. Bao gồm mô tả, ngày tạo, người được giao và tổng số giờ đã log (chấm công).

    Args:
        task_id: ID của task cần xem chi tiết. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return {"error": "Database session not available."}
    try:
        t = db.execute(select(Task).where(Task.id == task_id)).scalar_one_or_none()
        if not t:
            return {"error": "Task not found"}

        ta_records = db.execute(
            select(ProjectMember, User)
            .join(User, ProjectMember.user_id == User.id)
            .join(TaskAssignees, TaskAssignees.assignee_id == ProjectMember.id)
            .where(TaskAssignees.task_id == task_id)
        ).all()

        assignees = []
        for pm, user in ta_records:
            assignees.append({"user_id": user.id, "name": user.full_name or user.email})

        return {
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
    except Exception as e:
        return {"error": str(e)}


@tool
def get_user_workload(
    user_id: int,
    project_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    config: RunnableConfig = None,
) -> Dict[str, Any]:
    """
    Đánh giá khối lượng công việc hiện tại của một nhân viên.
    Kiểm tra xem họ đang làm bao nhiêu task, có quá tải hay không, và TỔNG SỐ GIỜ đã log (chấm công) của họ là bao nhiêu.
    Rất hữu ích để tính toán số giờ làm việc trung bình của thành viên trong dự án.

    Args:
        user_id: ID của nhân viên. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
        project_id: (Optional) ID dự án để lọc theo dự án.
        start_date: (Optional) Chuỗi ngày YYYY-MM-DD. Lọc task bắt đầu từ ngày này.
        end_date: (Optional) Chuỗi ngày YYYY-MM-DD. Lọc task kết thúc/deadline đến ngày này.
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return {"error": "Database session not available."}

    try:
        query = (
            select(Task)
            .join(TaskAssignees, Task.id == TaskAssignees.task_id)
            .join(ProjectMember, TaskAssignees.project_member_id == ProjectMember.id)
            .where(and_(ProjectMember.user_id == user_id, Task.status.in_(["todo", "in_progress"])))
        )
        if project_id:
            query = query.where(Task.project_id == project_id)
        if start_date:
            query = query.where(Task.start_date >= datetime.strptime(start_date, "%Y-%m-%d").date())
        if end_date:
            query = query.where(Task.deadline <= datetime.strptime(end_date, "%Y-%m-%d").date())

        tasks = db.execute(query).scalars().all()

        # Lấy tổng số giờ đã log của user này (nếu có lọc theo project thì cũng tính luôn)
        lw_query = (
            select(func.sum(LogWork.hours_spent))
            .join(ProjectMember, LogWork.project_member_id == ProjectMember.id)
            .where(ProjectMember.user_id == user_id, LogWork.status == "APPROVED")
        )
        if project_id:
            lw_query = lw_query.where(ProjectMember.project_id == project_id)
        total_logged_hours = db.execute(lw_query).scalar() or 0.0

        return {
            "user_id": user_id,
            "active_tasks_count": len(tasks),
            "total_logged_hours": float(total_logged_hours),
            "tasks": [
                {"task_id": t.id, "title": t.title, "status": t.status, "project_id": t.project_id}
                for t in tasks
            ],
        }
    except Exception as e:
        return {"error": str(e)}


@tool
def get_sprints(
    project_id: int, status: Optional[str] = None, config: RunnableConfig = None
) -> List[Dict[str, Any]]:
    """
    Lấy danh sách các đợt phát triển (Sprint) của dự án.
    Sử dụng để tra cứu tiến độ tổng quan, xem sprint nào đang chạy (active), sắp tới (planning) hay đã đóng (closed).

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
def get_task_logworks(task_id: int, config: RunnableConfig = None) -> List[Dict[str, Any]]:
    """
    Tra cứu nhật ký làm việc (logworks / timesheet) của một công việc.
    Dùng để xem ai đã chấm công bao nhiêu giờ, vào ngày nào và làm những gì trên task này.

    Args:
        task_id: ID của công việc. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI người dùng).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return [{"error": "Database session not available."}]
    try:
        query = (
            select(LogWork, ProjectMember, User)
            .join(ProjectMember, LogWork.project_member_id == ProjectMember.id)
            .join(User, ProjectMember.user_id == User.id)
            .where(LogWork.task_id == task_id)
            .order_by(LogWork.work_date.desc())
        )
        logworks = db.execute(query).all()
        return [
            {
                "logwork_id": lw.id,
                "user_name": user.full_name or user.email,
                "work_date": lw.work_date.isoformat() if lw.work_date else None,
                "hours_spent": float(lw.hours_spent),
                "work_content": lw.work_content,
                "status": lw.status,
            }
            for lw, pm, user in logworks
        ]
    except Exception as e:
        return [{"error": str(e)}]


@tool
def get_project_logworks(project_id: int, config: RunnableConfig = None) -> List[Dict[str, Any]]:
    """
    Tra cứu nhật ký làm việc (logworks / timesheet) của toàn bộ dự án (tất cả các thành viên trong dự án).
    Dùng để xem tổng quan mọi người đã làm những công việc gì trong dự án.

    Args:
        project_id: ID của dự án. (BẮT BUỘC - Nếu thiếu, PHẢI HỎI LẠI NGƯỜI DÙNG CUNG CẤP TÊN DỰ ÁN).
    """
    db: Session = config.get("configurable", {}).get("db") if config else None
    if not db:
        db = SessionLocal()
    if not db:
        return [{"error": "Database session not available."}]
    try:
        query = (
            select(LogWork, ProjectMember, User, Task)
            .join(ProjectMember, LogWork.project_member_id == ProjectMember.id)
            .join(User, ProjectMember.user_id == User.id)
            .join(Task, LogWork.task_id == Task.id)
            .where(ProjectMember.project_id == project_id)
            .order_by(LogWork.work_date.desc())
            .limit(100)
        )
        logworks = db.execute(query).all()
        return [
            {
                "logwork_id": lw.id,
                "user_name": user.full_name or user.email,
                "task_name": task.title,
                "work_date": lw.work_date.isoformat() if lw.work_date else None,
                "hours_spent": float(lw.hours_spent),
                "work_content": lw.work_content,
                "status": lw.status,
            }
            for lw, pm, user, task in logworks
        ]
    except Exception as e:
        return [{"error": str(e)}]
