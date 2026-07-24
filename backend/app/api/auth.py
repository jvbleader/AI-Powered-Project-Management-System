from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.schemas.user_schema import ChangePassword, UserLogin
from app.services import auth_service
from app.services.websocket_manager import manager
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
    access_token: str | None = Cookie(None),
    refresh_token: str | None = Cookie(None),
):
    if refresh_token or access_token:
        auth_service.logout_user(db, refresh_token, access_token)

    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    response.delete_cookie(key="refresh_token", httponly=True, samesite="lax")
    return {"message": "Đăng xuất thành công"}


@router.post("/logout-all")
def logout_all(
    response: Response,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    access_token: str | None = Cookie(None),
):
    auth_service.logout_all_devices(db, current_user.id, access_token)
    db.commit()

    async def send_force_logout():
        await manager.send_personal_message(
            {"type": "FORCE_LOGOUT"}, 
            current_user.id
        )
    background_tasks.add_task(send_force_logout)

    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    response.delete_cookie(key="refresh_token", httponly=True, samesite="lax")
    return {"message": "Đã đăng xuất khỏi tất cả thiết bị"}


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
    
    if "refresh_token" in auth_data and auth_data["refresh_token"]:
        response.set_cookie(
            key="refresh_token",
            value=auth_data["refresh_token"],
            httponly=True,
            samesite="lax",
            max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
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
