from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.project_schema import RoleCreate, RoleDetailResponse, RoleUpdate
from app.services import role_service

router = APIRouter(tags=["Role"])


@router.get("/api/roles", response_model=list[RoleDetailResponse])
def list_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return role_service.list_roles(db)


@router.post("/api/roles", response_model=RoleDetailResponse, status_code=status.HTTP_201_CREATED)
def create_role(
    data: RoleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return role_service.create_role(db, current_user, data)


@router.patch("/api/roles/{role_id}", response_model=RoleDetailResponse)
def update_role(
    role_id: int,
    data: RoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return role_service.update_role(db, current_user, role_id, data)


@router.delete("/api/roles/{role_id}")
def delete_role(
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role_service.delete_role(db, current_user, role_id)
    return {"message": "Đã xóa vai trò."}
