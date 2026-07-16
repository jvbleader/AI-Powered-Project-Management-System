from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator


class ProjectMetricsResponse(BaseModel):
    completedTasks: int = 0
    overdueTasks: int = 0
    logworkCoverage: int = 0
    velocity: int = 0
    totalTasks: int = 0


class ProjectMemberResponse(BaseModel):
    id: int
    userId: int
    userName: str
    userEmail: str
    roleId: int
    roleName: str
    joinedAt: datetime
    isActive: bool = True

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    status: str
    progress: int = 0
    managerId: Optional[int] = None
    managerName: Optional[str] = None
    memberIds: List[int] = []
    startDate: date
    endDate: Optional[date] = None
    createdBy: int
    createdAt: datetime
    updatedAt: datetime
    metrics: ProjectMetricsResponse = ProjectMetricsResponse()

    class Config:
        from_attributes = True


class ProjectDetailResponse(ProjectResponse):
    members: List[ProjectMemberResponse] = []


class ProjectCreate(BaseModel):
    name: str
    description: str
    start_date: date
    end_date: date
    manager_id: int

    @field_validator("name", "description")
    @classmethod
    def strip_and_validate(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Trường này không được để trống.")
        return stripped

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, end_date: date, info):
        start_date = info.data.get("start_date")
        if start_date and end_date < start_date:
            raise ValueError("Ngày kết thúc phải sau ngày bắt đầu.")
        return end_date


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectMemberCreate(BaseModel):
    user_id: int
    role_id: int


class ProjectMemberUpdate(BaseModel):
    role_id: int


class RoleResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class PaginatedProjectsResponse(BaseModel):
    items: List[ProjectResponse]
    total: int
    page: int
    pageSize: int
    totalPages: int
