from datetime import datetime, timezone
import math

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from database.connection import get_db
from dependencies import get_current_user
from utils.password_hash import hash_password
from models.user_model import User
from models.department_model import Department
from models.refresh_token_model import RefreshToken
from schemas.user_schema import (
    UpdatePhone,
    UpdateAvatar,
    UserProfile,
    UserCreate,
    UserStatusUpdate,
    UserRoleUpdate,
    AdminResetPassword,
    PaginatedUsersResponse,
    DepartmentResponse,
)

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
    phone = data.phone_number.strip()

    if phone and (len(phone) < 10 or len(phone) > 11):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Số điện thoại không hợp lệ",
        )

    db.query(User).filter(User.id == current_user.id).update(
        {
            User.phone_number: phone if phone else None,
            User.updated_at: datetime.now(timezone.utc),
        }
    )
    db.commit()
    db.refresh(current_user)

    return current_user


@router.put("/me/avatar", response_model=UserProfile)
def update_avatar(
    data: UpdateAvatar,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(User).filter(User.id == current_user.id).update(
        {
            User.avatar_url: data.avatar_url,
            User.updated_at: datetime.now(timezone.utc),
        }
    )
    db.commit()
    db.refresh(current_user)

    return current_user


@router.get("/api/departments", response_model=list[DepartmentResponse])
def get_departments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    departments = db.query(Department).all()
    return departments


@router.post("/api/users", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện hành động này.",
        )

    existing_user = db.query(User).filter(User.email == data.email.lower()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email đã được sử dụng.",
        )

    hashed_pass = hash_password(data.password)

    department_id = None
    if data.department and data.department.strip():
        dept_name = data.department.strip()
        dept = db.query(Department).filter(Department.name == dept_name).first()
        if not dept:
            dept = Department(name=dept_name)
            db.add(dept)
            db.commit()
            db.refresh(dept)
        department_id = dept.id

    new_user = User(
        full_name=data.name.strip(),
        email=data.email.strip().lower(),
        password_hash=hashed_pass,
        role=data.role,
        is_admin=data.is_admin,
        department_id=department_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.get("/api/users", response_model=PaginatedUsersResponse)
def get_users(
    search: str = Query(None),
    status: str = Query(None),
    role: str = Query(None),
    department: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(User)

    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                User.email.ilike(search_term),
                User.full_name.ilike(search_term),
            )
        )

    if status and status != "ALL":
        if status == "ACTIVE":
            query = query.filter(User.is_active == True)
        elif status == "INACTIVE":
            query = query.filter(User.is_active == False)

    if role and role != "ALL":
        query = query.filter(User.role == role)

    if department and department != "ALL":
        if department == "UNASSIGNED":
            query = query.filter(User.department_id == None)
        else:
            query = query.join(User.department).filter(Department.name == department)

    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    users = query.order_by(desc(User.created_at), desc(User.id)).offset((page - 1) * page_size).limit(page_size).all()

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
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện hành động này.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    user.is_active = data.is_active
    user.updated_at = datetime.now(timezone.utc)

    if not data.is_active:
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})

    db.commit()
    db.refresh(user)
    return user


@router.patch("/api/users/{user_id}/role", response_model=UserProfile)
def update_user_role(
    user_id: int,
    data: UserRoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện hành động này.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    user.role = data.role
    user.is_admin = data.is_admin

    if data.department and data.department.strip():
        dept_name = data.department.strip()
        dept = db.query(Department).filter(Department.name == dept_name).first()
        if not dept:
            dept = Department(name=dept_name)
            db.add(dept)
            db.commit()
            db.refresh(dept)
        user.department_id = dept.id

    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@router.post("/api/users/reset-password")
def reset_password(
    data: AdminResetPassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện hành động này.",
        )

    user = db.query(User).filter(User.email == data.email.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    hashed_pass = hash_password(data.new_password)
    user.password_hash = hashed_pass
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Đổi mật khẩu thành công."}
