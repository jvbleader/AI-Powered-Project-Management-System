from fastapi import Depends, HTTPException, status, Cookie
from sqlalchemy.orm import Session

from database.connection import get_db
from utils.jwt_handler import decode_token
from models.user_model import User


def get_current_user(
    access_token: str | None = Cookie(None), db: Session = Depends(get_db)
):
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bạn chưa đăng nhập hoặc Cookie không hợp lệ",
        )

    try:
        payload = decode_token(access_token)
        user_id = payload.get("id")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token đã hết hạn hoặc không hợp lệ",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy user"
        )
    return user
