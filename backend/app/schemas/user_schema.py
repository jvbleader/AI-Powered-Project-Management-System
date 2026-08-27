from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, field_validator


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        if isinstance(v, str):
            return v.strip().lower()
        return v


class DepartmentResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    user_count: int = 0
    project_count: int = 0
    team_count: int = 0

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class UserProfile(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    phone_number: str | None = None
    avatar_url: str | None = None
    department: str | None = None
    role: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator("department", mode="before")
    @classmethod
    def extract_department_name(cls, v):
        if v and hasattr(v, "name"):
            return v.name
        return v


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    role: str = "Lập trình viên"
    password: str = "123456"
    department: Optional[str] = None


class ChangePassword(BaseModel):
    old_password: str
    new_password: str


class UpdatePhone(BaseModel):
    phone_number: str


class UpdateProfile(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None
    address: Optional[str] = None


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserRoleUpdate(BaseModel):
    role: str
    department: Optional[str] = None


class AdminResetPassword(BaseModel):
    email: EmailStr
    new_password: str


class UpdateAvatar(BaseModel):
    avatar_url: str


class PaginatedUsersResponse(BaseModel):
    items: List[UserProfile]
    total: int
    page: int
    pageSize: int
    totalPages: int
