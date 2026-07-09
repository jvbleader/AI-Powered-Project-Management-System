from typing import Optional, List
from pydantic import BaseModel
from datetime import date, datetime

class TaskAssigneeResponse(BaseModel):
    user_id: str
    name: str
    email: str

    class Config:
        from_attributes = True

class TaskCommentBase(BaseModel):
    content: str

class TaskCommentCreate(TaskCommentBase):
    pass

class TaskCommentResponse(TaskCommentBase):
    id: int
    task_id: int
    project_member_id: int
    user_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class LogWorkBase(BaseModel):
    work_date: date
    hours_spent: float
    work_content: str
    comment: Optional[str] = None
    progress_percent: float

class LogWorkCreate(LogWorkBase):
    pass

class LogWorkResponse(LogWorkBase):
    id: int
    task_id: int
    project_member_id: int
    user_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "todo"
    priority: Optional[str] = "medium"
    deadline: Optional[date] = None
    estimated_hours: Optional[float] = None
    sprint_id: Optional[int] = None
    parent_task_id: Optional[int] = None

class TaskCreate(TaskBase):
    assignee_user_ids: Optional[List[str]] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[date] = None
    estimated_hours: Optional[float] = None
    sprint_id: Optional[int] = None
    parent_task_id: Optional[int] = None

class TaskResponse(TaskBase):
    id: int
    project_id: int
    created_by_member_id: int
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    key: Optional[str] = None  # Ví dụ: TASK-123
    assignees: List[TaskAssigneeResponse] = []
    
    class Config:
        from_attributes = True
