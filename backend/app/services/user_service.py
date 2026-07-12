from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user_model import User
from app.repositories import (
    department_repository,
    project_repository,
    refresh_token_repository,
    user_repository,
)
from app.schemas.user_schema import (
    AdminResetPassword,
    UpdateAvatar,
    UpdatePhone,
    UserCreate,
    UserRoleUpdate,
    UserStatusUpdate,
)
from app.utils.project_helpers import (
    is_admin_user,
    list_accessible_project_ids,
    user_can_access_team_directory,
)
from app.utils.password_hash import hash_password


def _is_admin_user(user: User) -> bool:
    return bool(user and (getattr(user, "is_admin", False) or getattr(user, "role", None) == "ADMIN"))


def update_phone(db: Session, current_user: User, data: UpdatePhone) -> User:
    phone = data.phone_number.strip() if data.phone_number else None

    if phone and (len(phone) < 10 or len(phone) > 11):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Số điện thoại không hợp lệ",
        )

    current_user.phone_number = phone
    current_user.updated_at = datetime.now(timezone.utc)
    return user_repository.commit_and_refresh(db, current_user)

def update_avatar(db: Session, current_user: User, data: UpdateAvatar) -> User:
    current_user.avatar_url = data.avatar_url
    current_user.updated_at = datetime.now(timezone.utc)
    return user_repository.commit_and_refresh(db, current_user)

def create_user(db: Session, current_user: User, data: UserCreate) -> User:
    if not _is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện hành động này.",
        )

    existing_user = user_repository.get_by_email(db, data.email.lower())
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email đã được sử dụng.",
        )

    hashed_pass = hash_password(data.password)

    department_id = None
    if data.department and data.department.strip():
        dept_name = data.department.strip()
        dept = department_repository.get_by_name(db, dept_name)
        if not dept:
            dept = department_repository.create(db, dept_name)
        department_id = dept.id

    new_user = User(
        full_name=data.name.strip(),
        email=data.email.strip().lower(),
        password_hash=hashed_pass,
        role=data.role,
        is_admin=data.is_admin or data.role == "ADMIN",
        department_id=department_id,
    )
    return user_repository.create(db, new_user)

def get_users(
    db: Session,
    current_user: User,
    search: str | None = None,
    status_filter: str | None = None,
    role: str | None = None,
    department: str | None = None,
    page: int = 1,
    page_size: int = 10,
):
    visible_user_ids: list[int] | None = None

    if not is_admin_user(current_user):
        if user_can_access_team_directory(db, current_user):
            accessible_project_ids = list_accessible_project_ids(db, current_user)
            visible_user_ids = project_repository.list_project_user_ids(db, accessible_project_ids)
            visible_user_ids = sorted({*visible_user_ids, current_user.id})
        else:
            visible_user_ids = [current_user.id]

    return user_repository.get_users(
        db=db,
        search=search,
        status=status_filter,
        role=role,
        department=department,
        user_ids=visible_user_ids,
        page=page,
        page_size=page_size,
    )

def update_user_status(db: Session, current_user: User, user_id: int, data: UserStatusUpdate) -> User:
    if not _is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện hành động này.",
        )

    user = user_repository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    user.is_active = data.is_active
    user.updated_at = datetime.now(timezone.utc)

    if not data.is_active:
        refresh_token_repository.revoke_all_for_user(db, user.id)

    return user_repository.commit_and_refresh(db, user)

def update_user_role(db: Session, current_user: User, user_id: int, data: UserRoleUpdate) -> User:
    if not _is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện hành động này.",
        )

    user = user_repository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    user.role = data.role
    user.is_admin = data.is_admin or data.role == "ADMIN"

    if data.department and data.department.strip():
        dept_name = data.department.strip()
        dept = department_repository.get_by_name(db, dept_name)
        if not dept:
            dept = department_repository.create(db, dept_name)
        user.department_id = dept.id

    user.updated_at = datetime.now(timezone.utc)
    return user_repository.commit_and_refresh(db, user)

def reset_password(db: Session, current_user: User, data: AdminResetPassword) -> None:
    if not _is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện hành động này.",
        )

    user = user_repository.get_by_email(db, data.email.lower())
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    hashed_pass = hash_password(data.new_password)
    user.password_hash = hashed_pass
    user.updated_at = datetime.now(timezone.utc)
    user_repository.commit_and_refresh(db, user)
