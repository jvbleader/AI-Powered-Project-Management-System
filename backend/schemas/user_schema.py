from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class DepartmentResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


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
    role: str = "MEMBER"
    is_admin: bool = False
    password: str = "default1234"
    department: Optional[str] = None


class ChangePassword(BaseModel):
    old_password: str
    new_password: str


class UpdatePhone(BaseModel):
    phone_number: str


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserRoleUpdate(BaseModel):
    role: str
    is_admin: bool
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
