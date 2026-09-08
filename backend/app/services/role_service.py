from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.project_model import Role
from app.models.user_model import User
from app.repositories import role_repository
from app.schemas.project_schema import RoleCreate, RoleDetailResponse, RoleUpdate
from app.utils.project_helpers import is_admin_user


def _require_admin(current_user: User) -> None:
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ tài khoản Admin mới được quản trị vai trò.",
        )


def _normalize_name(name: str | None) -> str:
    return (name or "").strip()


def _to_response(role: Role, user_count: int = 0) -> RoleDetailResponse:
    return RoleDetailResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_admin=bool(role.is_admin),
        created_at=role.created_at,
        updated_at=role.updated_at,
        user_count=user_count,
    )


def list_roles(db: Session) -> list[RoleDetailResponse]:
    roles = role_repository.get_all(db)
    counts = role_repository.usage_counts(db)
    return [_to_response(role, counts.get(role.id, 0)) for role in roles]


def create_role(db: Session, current_user: User, data: RoleCreate) -> RoleDetailResponse:
    _require_admin(current_user)

    name = _normalize_name(data.name)
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên vai trò là bắt buộc.",
        )

    if role_repository.get_by_name(db, name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên vai trò đã tồn tại. Vui lòng chọn tên khác.",
        )

    description = (data.description or "").strip() or None
    role = role_repository.create(db, name, description, bool(data.is_admin))
    return _to_response(role)


def update_role(
    db: Session,
    current_user: User,
    role_id: int,
    data: RoleUpdate,
) -> RoleDetailResponse:
    _require_admin(current_user)

    role = role_repository.get_by_id(db, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy vai trò.")

    if "name" in data.model_fields_set:
        name = _normalize_name(data.name)
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tên vai trò là bắt buộc.",
            )
        existing = role_repository.get_by_name(db, name, exclude_id=role.id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tên vai trò đã tồn tại. Vui lòng chọn tên khác.",
            )
        role.name = name

    if "description" in data.model_fields_set:
        role.description = (data.description or "").strip() or None

    if "is_admin" in data.model_fields_set and data.is_admin is not None:
        if role.is_admin and not data.is_admin and role_repository.count_admin_roles(db, exclude_id=role.id) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phải giữ ít nhất một vai trò Admin trong hệ thống.",
            )
        role.is_admin = data.is_admin

    role = role_repository.update(db, role)
    return _to_response(role, role_repository.count_users(db, role.id))


def delete_role(db: Session, current_user: User, role_id: int) -> None:
    _require_admin(current_user)

    role = role_repository.get_by_id(db, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy vai trò.")

    user_count = role_repository.count_users(db, role.id)
    if user_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể xóa vai trò đang được gán cho {user_count} nhân sự.",
        )

    if role.is_admin and role_repository.count_admin_roles(db, exclude_id=role.id) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xóa vai trò Admin cuối cùng trong hệ thống.",
        )

    role_repository.delete(db, role)
