from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.department_model import Department
from app.models.user_model import User
from app.repositories import department_repository
from app.schemas.user_schema import DepartmentCreate, DepartmentResponse, DepartmentUpdate
from app.utils.project_helpers import is_admin_user


def _require_admin(current_user: User) -> None:
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ tài khoản Admin mới được quản trị phòng ban.",
        )


def _normalize_name(name: str | None) -> str:
    return (name or "").strip()


def _to_response(department: Department, counts: dict[str, int] | None = None) -> DepartmentResponse:
    usage = counts or {}
    return DepartmentResponse(
        id=department.id,
        name=department.name,
        description=department.description,
        created_at=department.created_at,
        updated_at=department.updated_at,
        user_count=usage.get("user_count", 0),
        project_count=usage.get("project_count", 0),
        team_count=usage.get("team_count", 0),
    )


def get_departments(db: Session) -> list[DepartmentResponse]:
    departments = department_repository.get_all(db)
    counts_by_id = department_repository.usage_counts(db)
    return [_to_response(department, counts_by_id.get(department.id)) for department in departments]


def create_department(db: Session, current_user: User, data: DepartmentCreate) -> DepartmentResponse:
    _require_admin(current_user)

    name = _normalize_name(data.name)
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên phòng ban là bắt buộc.",
        )

    if department_repository.get_by_name(db, name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên phòng ban đã tồn tại. Vui lòng chọn tên khác.",
        )

    description = (data.description or "").strip() or None
    department = department_repository.create(db, name, description)
    return _to_response(department)


def update_department(
    db: Session,
    current_user: User,
    department_id: int,
    data: DepartmentUpdate,
) -> DepartmentResponse:
    _require_admin(current_user)

    department = department_repository.get_by_id(db, department_id)
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phòng ban.")

    if "name" in data.model_fields_set:
        name = _normalize_name(data.name)
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tên phòng ban là bắt buộc.",
            )
        existing = department_repository.get_by_name(db, name, exclude_id=department.id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tên phòng ban đã tồn tại. Vui lòng chọn tên khác.",
            )
        department.name = name

    if "description" in data.model_fields_set:
        description = (data.description or "").strip() or None
        department.description = description

    department = department_repository.update(db, department)
    counts = {
        "user_count": department_repository.count_users(db, department.id),
        "project_count": department_repository.count_projects(db, department.id),
        "team_count": department_repository.count_teams(db, department.id),
    }
    return _to_response(department, counts)


def delete_department(db: Session, current_user: User, department_id: int) -> None:
    _require_admin(current_user)

    department = department_repository.get_by_id(db, department_id)
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phòng ban.")

    user_count = department_repository.count_users(db, department.id)
    project_count = department_repository.count_projects(db, department.id)
    team_count = department_repository.count_teams(db, department.id)
    if user_count or project_count or team_count:
        reasons = []
        if user_count:
            reasons.append(f"{user_count} nhân sự")
        if project_count:
            reasons.append(f"{project_count} dự án")
        if team_count:
            reasons.append(f"{team_count} nhóm")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xóa phòng ban đang được sử dụng bởi " + ", ".join(reasons) + ".",
        )

    department_repository.delete(db, department)
