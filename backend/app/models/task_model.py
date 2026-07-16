from datetime import datetime, timezone

from sqlalchemy import (Column, Date, DateTime, ForeignKey, Integer, Numeric,
                        String, Text, func)

from app.core.connection import Base
from app.models.logworks import LogWork
from sqlalchemy.orm import object_session

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    sprint_id = Column(Integer, ForeignKey("sprints.id"))
    parent_task_id = Column(Integer, ForeignKey("tasks.id"))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    created_by_member_id = Column(Integer, ForeignKey("project_members.id"), nullable=False)
    status = Column(String(50), nullable=False, default="todo", index=True)
    priority = Column(String(50), nullable=False, default="medium", index=True)
    start_date = Column(Date, nullable=False, index=True)
    deadline = Column(Date, index=True)
    estimated_hours = Column(Numeric)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @property
    def spent_hours(self) -> float:
        session = object_session(self)
        if not session:
            return 0.0
        total = session.query(func.sum(LogWork.hours_spent)).filter(LogWork.task_id == self.id).scalar()
        return float(total or 0.0)
    
class TaskAssignees(Base):
    __tablename__ = "task_assignees"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    project_member_id = Column(Integer, ForeignKey("project_members.id"), nullable=False)
    assigned_by_member_id = Column(Integer, ForeignKey("project_members.id"), nullable=False)
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class TaskComment(Base):
    __tablename__ = "task_comments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    project_member_id = Column(Integer, ForeignKey("project_members.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
