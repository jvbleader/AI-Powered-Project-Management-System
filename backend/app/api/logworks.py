from typing import List, Optional
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.connection import get_db
from app.models.logworks import LogWork
from app.models.notification_model import Notification
from app.models.project_model import Project, ProjectMember
from app.models.task_model import Task
from app.models.user_model import User
from app.schemas.task_schema import LogWorkResponse, LogWorkUpdate
from app.services.websocket_manager import manager
from app.utils.project_helpers import (
    has_companywide_project_access,
    user_can_manage_project,
    user_role_requires_manager_scope,
)

router = APIRouter(prefix="/api/v1/logworks", tags=["Logworks"])


@router.get("/pending", response_model=List[LogWorkResponse])
def get_pending_logworks(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    # Determine which projects this user can approve logworks for
    if has_companywide_project_access(current_user):
        # Company-wide access (Directors, Head of Dev) can see all pending logworks
        pending_logworks = (
            db.query(LogWork)
            .filter(LogWork.status == "PENDING")
            .order_by(LogWork.created_at.desc())
            .all()
        )
    else:
        # PM/Leaders can see logworks for projects they manage or are active members of
        manager_projects = (
            db.query(Project.id).filter(Project.manager_id == current_user.id).subquery()
        )

        if user_role_requires_manager_scope(current_user):
            member_projects = (
                db.query(ProjectMember.project_id)
                .filter(ProjectMember.user_id == current_user.id, ProjectMember.is_active == True)
                .subquery()
            )

            project_filter = or_(
                Task.project_id.in_(manager_projects), Task.project_id.in_(member_projects)
            )
        else:
            project_filter = Task.project_id.in_(manager_projects)

        pending_logworks = (
            db.query(LogWork)
            .join(Task, LogWork.task_id == Task.id)
            .filter(LogWork.status == "PENDING", project_filter)
            .order_by(LogWork.created_at.desc())
            .all()
        )

    # Attach extra context for response
    for lw in pending_logworks:
        member = db.query(ProjectMember).filter(ProjectMember.id == lw.project_member_id).first()
        if member:
            user = db.query(User).filter(User.id == member.user_id).first()
            if user:
                lw.user_name = user.full_name
                lw.user_id = user.id
            project = db.query(Project).filter(Project.id == member.project_id).first()
            if project:
                lw.project_name = project.name
                lw.project_id = project.id

        task = db.query(Task).filter(Task.id == lw.task_id).first()
        if task:
            lw.task_title = task.title

    return pending_logworks


@router.patch("/{logwork_id}/approve", response_model=LogWorkResponse)
def approve_logwork(
    logwork_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logwork = db.query(LogWork).filter(LogWork.id == logwork_id).first()
    if not logwork:
        raise HTTPException(status_code=404, detail="Logwork không tồn tại")

    task = db.query(Task).filter(Task.id == logwork.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task không tồn tại")

    # Check permission
    if not user_can_manage_project(db, task.project_id, current_user):
        raise HTTPException(status_code=403, detail="Không có quyền duyệt logwork này")

    logwork.status = "APPROVED"
    db.commit()
    db.refresh(logwork)

    member = db.query(ProjectMember).filter(ProjectMember.id == logwork.project_member_id).first()
    if member:
        user = db.query(User).filter(User.id == member.user_id).first()
        if user:
            logwork.user_name = user.full_name

            if user.id != current_user.id:
                notification = Notification(
                    user_id=user.id,
                    type="LOGWORK_APPROVED",
                    title="Logwork đã được duyệt",
                    content=f"Logwork {logwork.hours_spent}h của bạn ở '{task.title}' đã được duyệt.",
                    link=f"/projects/{task.project_id}?highlightTaskId={task.id}",
                )
                db.add(notification)
                db.commit()
                db.refresh(notification)

                async def send_ws():
                    await manager.send_personal_message(
                        {
                            "type": "NEW_NOTIFICATION",
                            "data": {
                                "id": notification.id,
                                "type": notification.type,
                                "title": notification.title,
                                "content": notification.content,
                                "link": notification.link,
                                "is_read": False,
                                "created_at": notification.created_at.isoformat(),
                            },
                        },
                        user.id,
                    )

                background_tasks.add_task(send_ws)

    return logwork


@router.patch("/{logwork_id}/reject", response_model=LogWorkResponse)
def reject_logwork(
    logwork_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logwork = db.query(LogWork).filter(LogWork.id == logwork_id).first()
    if not logwork:
        raise HTTPException(status_code=404, detail="Logwork không tồn tại")

    task = db.query(Task).filter(Task.id == logwork.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task không tồn tại")

    # Check permission
    if not user_can_manage_project(db, task.project_id, current_user):
        raise HTTPException(status_code=403, detail="Không có quyền duyệt logwork này")

    logwork.status = "REJECTED"
    db.commit()
    db.refresh(logwork)

    member = db.query(ProjectMember).filter(ProjectMember.id == logwork.project_member_id).first()
    if member:
        user = db.query(User).filter(User.id == member.user_id).first()
        if user:
            logwork.user_name = user.full_name

            if user.id != current_user.id:
                notification = Notification(
                    user_id=user.id,
                    type="LOGWORK_REJECTED",
                    title="Logwork bị từ chối",
                    content=f"Logwork {logwork.hours_spent}h của bạn ở '{task.title}' đã bị từ chối.",
                    link=f"/projects/{task.project_id}?highlightTaskId={task.id}",
                )
                db.add(notification)
                db.commit()
                db.refresh(notification)

                async def send_ws():
                    await manager.send_personal_message(
                        {
                            "type": "NEW_NOTIFICATION",
                            "data": {
                                "id": notification.id,
                                "type": notification.type,
                                "title": notification.title,
                                "content": notification.content,
                                "link": notification.link,
                                "is_read": False,
                                "created_at": notification.created_at.isoformat(),
                            },
                        },
                        user.id,
                    )

                background_tasks.add_task(send_ws)

    return logwork


@router.get("", response_model=dict)
def get_logworks(
    project_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(LogWork).join(Task, LogWork.task_id == Task.id).join(ProjectMember, LogWork.project_member_id == ProjectMember.id)
    
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if user_id:
        query = query.filter(ProjectMember.user_id == user_id)
    if status_filter and status_filter != "ALL":
        query = query.filter(LogWork.status == status_filter)
    if from_date:
        query = query.filter(LogWork.work_date >= from_date)
    if to_date:
        query = query.filter(LogWork.work_date <= to_date)
        
    # Check permissions: can only see own logworks unless manager/admin
    if not (has_companywide_project_access(current_user) or user_role_requires_manager_scope(current_user)):
        query = query.filter(ProjectMember.user_id == current_user.id)
        
    total = query.count()
    items = query.order_by(LogWork.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    for lw in items:
        member = db.query(ProjectMember).filter(ProjectMember.id == lw.project_member_id).first()
        if member:
            user = db.query(User).filter(User.id == member.user_id).first()
            if user:
                lw.user_name = user.full_name
                lw.user_id = user.id
            project = db.query(Project).filter(Project.id == member.project_id).first()
            if project:
                lw.project_name = project.name
        task = db.query(Task).filter(Task.id == lw.task_id).first()
        if task:
            lw.task_title = task.title

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1
    }

@router.put("/{logwork_id}", response_model=LogWorkResponse)
def update_logwork(
    logwork_id: int,
    data: LogWorkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logwork = db.query(LogWork).filter(LogWork.id == logwork_id).first()
    if not logwork:
        raise HTTPException(status_code=404, detail="Logwork không tồn tại")
        
    member = db.query(ProjectMember).filter(ProjectMember.id == logwork.project_member_id).first()
    if not member or member.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền sửa logwork này")
        
    if data.hours_spent is not None:
        logwork.hours_spent = data.hours_spent
    if data.title is not None:
        logwork.title = data.title
    if data.work_content is not None:
        logwork.work_content = data.work_content
    if data.comment is not None:
        logwork.comment = data.comment
    if data.progress_percent is not None:
        logwork.progress_percent = data.progress_percent
        
    db.commit()
    db.refresh(logwork)
    
    # Attach extra context for response
    logwork.user_name = current_user.full_name
    project = db.query(Project).filter(Project.id == member.project_id).first()
    if project:
        logwork.project_name = project.name
    task = db.query(Task).filter(Task.id == logwork.task_id).first()
    if task:
        logwork.task_title = task.title
        
    return logwork

@router.delete("/{logwork_id}")
def delete_logwork(
    logwork_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logwork = db.query(LogWork).filter(LogWork.id == logwork_id).first()
    if not logwork:
        raise HTTPException(status_code=404, detail="Logwork không tồn tại")
        
    member = db.query(ProjectMember).filter(ProjectMember.id == logwork.project_member_id).first()
    if not member or member.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền xóa logwork này")
        
    # Return deleted object with context so frontend can handle it
    deleted_data = {
        "id": logwork.id,
        "task_id": logwork.task_id,
        "project_member_id": logwork.project_member_id
    }
    
    db.delete(logwork)
    db.commit()
    
    return deleted_data
