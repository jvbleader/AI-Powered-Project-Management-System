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


def _require_admin(current_user: User) -> None:
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ tài khoản Admin mới được quản trị người dùng.",
        )


def _resolve_department_id(db: Session, department_name: str | None) -> int:
    if not department_name or not department_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phòng ban là bắt buộc.",
        )

    dept_name = department_name.strip()
    department = department_repository.get_by_name(db, dept_name)
    if not department:
        department = department_repository.create(db, dept_name)
    return department.id


def _resolve_role_id(db: Session, role_name: str) -> int:
    role = project_repository.get_role_by_name(db, role_name.strip())
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vai trò không hợp lệ.",
        )
    return role.id


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
    _require_admin(current_user)

    existing_user = user_repository.get_by_email(db, data.email.lower())
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email đã được sử dụng.",
        )

    new_user = User(
        full_name=data.name.strip(),
        email=data.email.strip().lower(),
        password_hash=hash_password(data.password),
        department_id=_resolve_department_id(db, data.department),
        team_id=None,
        role_id=_resolve_role_id(db, data.role),
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
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
    _require_admin(current_user)

    user = user_repository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    user.is_active = data.is_active
    user.updated_at = datetime.now(timezone.utc)

    if not data.is_active:
        refresh_token_repository.revoke_all_for_user(db, user.id)

    return user_repository.commit_and_refresh(db, user)


def update_user_role(db: Session, current_user: User, user_id: int, data: UserRoleUpdate) -> User:
    _require_admin(current_user)

    user = user_repository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    user.role_id = _resolve_role_id(db, data.role)
    user.department_id = _resolve_department_id(db, data.department)
    user.updated_at = datetime.now(timezone.utc)
    return user_repository.commit_and_refresh(db, user)


def reset_password(db: Session, current_user: User, data: AdminResetPassword) -> None:
    _require_admin(current_user)

    user = user_repository.get_by_email(db, data.email.lower())
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    user.password_hash = hash_password(data.new_password)
    user.updated_at = datetime.now(timezone.utc)
    user_repository.commit_and_refresh(db, user)
