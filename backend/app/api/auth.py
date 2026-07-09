from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status 
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.schemas.user_schema import ChangePassword, UserLogin
from app.services import auth_service
from app.utils.jwt_handler import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
)

router = APIRouter()


@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db), response: Response = None):
    auth_data = auth_service.authenticate_user(db, user)

    if user.remember_me:
        access_max_age = ACCESS_TOKEN_EXPIRE_MINUTES * 60
        refresh_max_age = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    else:
        access_max_age = None
        refresh_max_age = None

    response.set_cookie(
        key="access_token",
        value=auth_data["access_token"],
        httponly=True,
        samesite="lax",
        max_age=access_max_age,
    )

    response.set_cookie(
        key="refresh_token",
        value=auth_data["refresh_token"],
        httponly=True,
        samesite="lax",
        max_age=refresh_max_age,
    )

    return {"message": "Đăng nhập thành công", "user_id": auth_data["user_id"]}


@router.post("/logout")
def logout(
    response: Response,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    auth_service.logout_user(db, current_user.id)
    db.commit()

    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    return {"message": "Đăng xuất thành công"}


@router.get("/refresh")
def refresh_access_token(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(None),
):
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Không tìm thấy Refresh Token",
        )

    auth_data = auth_service.refresh_tokens(db, refresh_token)

    response.set_cookie(
        key="access_token",
        value=auth_data["access_token"],
        httponly=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return {"message": "Access Token mới", "user_id": auth_data["user_id"]}


@router.put("/change-password")
def change_password(
    data: ChangePassword,
    response: Response,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    auth_service.change_user_password(db, current_user, data)
    
    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    response.delete_cookie(key="refresh_token", httponly=True, samesite="lax")

    return {"message": "Đã đổi mật khẩu thành công! Vui lòng đăng nhập lại."}
