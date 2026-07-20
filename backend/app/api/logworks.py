from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.connection import get_db
from app.api.auth import get_current_user
from app.models.user_model import User
from app.models.logworks import LogWork
from app.models.task_model import Task
from app.models.project_model import ProjectMember, Project
from app.schemas.task_schema import LogWorkResponse
from sqlalchemy import or_
from app.utils.project_helpers import has_companywide_project_access, user_role_requires_manager_scope, user_can_manage_project

router = APIRouter(prefix="/api/v1/logworks", tags=["Logworks"])

@router.get("/pending", response_model=List[LogWorkResponse])
def get_pending_logworks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Determine which projects this user can approve logworks for
    if has_companywide_project_access(current_user):
        # Company-wide access (Directors, Head of Dev) can see all pending logworks
        pending_logworks = db.query(LogWork).filter(
            LogWork.status == "PENDING"
        ).order_by(LogWork.created_at.desc()).all()
    else:
        # PM/Leaders can see logworks for projects they manage or are active members of
        manager_projects = db.query(Project.id).filter(Project.manager_id == current_user.id).subquery()
        
        if user_role_requires_manager_scope(current_user):
            member_projects = db.query(ProjectMember.project_id).filter(
                ProjectMember.user_id == current_user.id,
                ProjectMember.is_active == True
            ).subquery()
            
            project_filter = or_(
                Task.project_id.in_(manager_projects),
                Task.project_id.in_(member_projects)
            )
        else:
            project_filter = Task.project_id.in_(manager_projects)

        pending_logworks = db.query(LogWork).join(Task, LogWork.task_id == Task.id).filter(
            LogWork.status == "PENDING",
            project_filter
        ).order_by(LogWork.created_at.desc()).all()
    
    # Attach extra context for response
    for lw in pending_logworks:
        member = db.query(ProjectMember).filter(ProjectMember.id == lw.project_member_id).first()
        if member:
            user = db.query(User).filter(User.id == member.user_id).first()
            if user:
                lw.user_name = user.full_name
            project = db.query(Project).filter(Project.id == member.project_id).first()
            if project:
                lw.project_name = project.name
                
        task = db.query(Task).filter(Task.id == lw.task_id).first()
        if task:
            lw.task_title = task.title
                
    return pending_logworks

@router.patch("/{logwork_id}/approve", response_model=LogWorkResponse)
def approve_logwork(
    logwork_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
            
    return logwork

@router.patch("/{logwork_id}/reject", response_model=LogWorkResponse)
def reject_logwork(
    logwork_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
            
    return logwork
