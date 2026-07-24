from app.core.connection import get_db
from fastapi import Cookie, Depends, HTTPException, status
from app.models.user_model import User
from sqlalchemy.orm import Session
from app.utils.jwt_handler import decode_token
from app.core.redis_client import redis_client


def get_current_user(
    access_token: str | None = Cookie(None), 
    refresh_token: str | None = Cookie(None),
    db: Session = Depends(get_db)
):
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bạn chưa đăng nhập hoặc Cookie không hợp lệ",
        )
        
    try:
        if redis_client.exists(f"blacklist_token:{access_token}"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập đã bị thu hồi",
            )
    except Exception:
        pass

    try:
        payload = decode_token(access_token)
        user_id = payload.get("id")
        iat = payload.get("iat")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token đã hết hạn hoặc không hợp lệ",
        )
        
    try:
        logout_all_ts = redis_client.get(f"user:{user_id}:logout_all")
        if logout_all_ts and iat:
            if int(iat) < int(logout_all_ts):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Phiên đăng nhập đã bị thu hồi từ thiết bị khác",
                )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy user"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Tài khoản của bạn đã bị vô hiệu hóa"
        )
    return user
