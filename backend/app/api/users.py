from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.user_schema import (
    AdminResetPassword,
    DepartmentResponse,
    PaginatedUsersResponse,
    UpdateAvatar,
    UpdatePhone,
    UserCreate,
    UserProfile,
    UserRoleUpdate,
    UserStatusUpdate,
)
from app.services import department_service, user_service

router = APIRouter()


@router.get("/me", response_model=UserProfile)
def profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me/phone", response_model=UserProfile)
def update_phone(
    data: UpdatePhone,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return user_service.update_phone(db, current_user, data)


@router.put("/me/avatar", response_model=UserProfile)
def update_avatar(
    data: UpdateAvatar,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return user_service.update_avatar(db, current_user, data)


@router.get("/api/departments", response_model=list[DepartmentResponse])
def get_departments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return department_service.get_departments(db)


@router.post("/api/users", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return user_service.create_user(db, current_user, data)


@router.get("/api/users", response_model=PaginatedUsersResponse)
def get_users(
    search: str = Query(None),
    status_filter: str = Query(None, alias="status"),
    role: str = Query(None),
    department: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users, total, total_pages = user_service.get_users(
        db=db,
        search=search,
        status_filter=status_filter,
        role=role,
        department=department,
        page=page,
        page_size=page_size,
    )
    return {
        "items": users,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
    }


@router.patch("/api/users/{user_id}/status", response_model=UserProfile)
def update_user_status(
    user_id: int,
    data: UserStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return user_service.update_user_status(db, current_user, user_id, data)


@router.patch("/api/users/{user_id}/role", response_model=UserProfile)
def update_user_role(
    user_id: int,
    data: UserRoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return user_service.update_user_role(db, current_user, user_id, data)


@router.post("/api/users/reset-password")
def reset_password(
    data: AdminResetPassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_service.reset_password(db, current_user, data)
    return {"message": "Đổi mật khẩu thành công."}
