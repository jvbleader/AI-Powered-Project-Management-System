from typing import List, Literal, Optional, Union
from pydantic import BaseModel, Field
from datetime import date, datetime, timezone
from pydantic import field_validator


def _ensure_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)

class TaskAssigneeResponse(BaseModel):
    user_id: str
    name: str
    email: str

    class Config:
        from_attributes = True

class TaskAttachmentBase(BaseModel):
    file_url: str
    file_name: str

class TaskAttachmentCreate(TaskAttachmentBase):
    pass

class TaskAttachmentResponse(TaskAttachmentBase):
    id: int
    task_id: int
    uploaded_by: int
    user_name: Optional[str] = None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def attach_timezone(cls, value: datetime) -> datetime:
        return _ensure_utc_datetime(value)

    class Config:
        from_attributes = True

class LogWorkBase(BaseModel):
    work_date: date
    hours_spent: float
    work_content: str
    comment: Optional[str] = None
    progress_percent: float

    @field_validator("hours_spent")
    @classmethod
    def validate_hours_spent(cls, value: float) -> float:
        if value < 0:
            raise ValueError("Số giờ logwork không được âm.")
        return value

class LogWorkCreate(LogWorkBase):
    pass

class LogWorkResponse(LogWorkBase):
    id: int
    task_id: int
    project_member_id: int
    user_name: Optional[str] = None
    project_name: Optional[str] = None
    task_title: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def attach_timezone(cls, value: datetime) -> datetime:
        return _ensure_utc_datetime(value)

    class Config:
        from_attributes = True

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Literal["todo", "in_progress", "done"] = "todo"
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    start_date: date
    deadline: Optional[date] = None
    estimated_hours: Optional[float] = None
    sprint_id: Optional[int] = None
    parent_task_id: Optional[int] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Tiêu đề không được để trống.")
        return stripped

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            return None
        return stripped


    @field_validator("estimated_hours")
    @classmethod
    def validate_estimated_hours(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value < 0:
            raise ValueError("Thời gian ước tính không được âm.")
        return value

class TaskCreate(TaskBase):
    assignee_user_ids: List[Union[str, int]] = Field(default_factory=list)

    @field_validator("assignee_user_ids", mode="before")
    @classmethod
    def normalize_assignee_user_ids(cls, values):
        if isinstance(values, list):
            return [str(v) for v in values if v is not None]
        return values

    @field_validator("deadline")
    @classmethod
    def validate_deadline(cls, value: Optional[date], info):
        if value is None:
            return value
        start_date = info.data.get("start_date")
        if start_date and value < start_date:
            raise ValueError("Hạn chót phải sau hoặc bằng ngày bắt đầu.")
        return value

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["todo", "in_progress", "done"]] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    estimated_hours: Optional[float] = None
    sprint_id: Optional[int] = None
    parent_task_id: Optional[int] = None

    @field_validator("title")
    @classmethod
    def validate_optional_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            raise ValueError("Tiêu đề không được để trống.")
        return stripped

    @field_validator("description")
    @classmethod
    def validate_optional_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            raise ValueError("Mô tả không được để trống.")
        return stripped

    @field_validator("estimated_hours")
    @classmethod
    def validate_optional_estimated_hours(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value < 0:
            raise ValueError("Thời gian ước tính không được âm.")
        return value

class TaskResponse(TaskBase):
    id: int
    project_id: int
    created_by_member_id: int
    created_by_user_id: Optional[int] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    key: Optional[str] = None  # Ví dụ: TASK-123
    assignees: List[TaskAssigneeResponse] = []
    spent_hours: float = 0.0

    @field_validator("created_at", "updated_at", "completed_at")
    @classmethod
    def attach_timezone(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        return _ensure_utc_datetime(value)
    
    class Config:
        from_attributes = True
