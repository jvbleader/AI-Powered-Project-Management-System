import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from database.connection import get_db
from dependencies import get_current_user
from models.refresh_token_model import RefreshToken
from models.user_model import User
from schemas.user_schema import ChangePassword, UserLogin
from utils.jwt_handler import ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS, create_access_token, create_refresh_token, decode_token
from utils.password_hash import hash_password, verify_password

router = APIRouter()


@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db), response: Response = None):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )

    password_user = verify_password(user.password, db_user.password_hash)
    if not password_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )

    access_token = create_access_token(data={"id": db_user.id})
    refresh_token = create_refresh_token(data={"id": db_user.id})

    if refresh_token:
        jti = uuid.uuid4().hex
        new_rf_token = RefreshToken(
            user_id=db_user.id, token_hash=refresh_token, jti=jti
        )
        db.add(new_rf_token)
        db.commit()

    if user.remember_me:
        access_max_age = ACCESS_TOKEN_EXPIRE_MINUTES * 60
        refresh_max_age = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    else:
        access_max_age = None
        refresh_max_age = None

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        # secure=True,
        samesite="lax",
        max_age=access_max_age,
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        # secure=True,
        samesite="lax",
        max_age=refresh_max_age,
    )

    return {"message": "Đăng nhập thành công", "user_id": db_user.id}


@router.post("/logout")
def logout(
    response: Response,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).update(
        {RefreshToken.revoked: True}
    )
    db.commit()

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

    try:
        payload = decode_token(refresh_token)
        user_id = payload.get("id")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    db_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == refresh_token, RefreshToken.revoked == False
        )
        .first()
    )

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh Token không hợp lệ hoặc đã bị thu hồi",
        )

    new_access_token = create_access_token(data={"id": user_id})
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        # secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return {"message": "Access Token mới", "user_id": user_id}


@router.put("/change-password")
def change_password(
    data: ChangePassword,
    response: Response,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_correct_old_password = verify_password(
        data.old_password, current_user.password_hash
    )
    if not is_correct_old_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không đúng",
        )

    hashed_new_pass = hash_password(data.new_password)
    db.query(User).filter(User.id == current_user.id).update(
        {User.password_hash: hashed_new_pass}
    )

    db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).update(
        {RefreshToken.revoked: True}
    )
    db.commit()

    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    response.delete_cookie(key="refresh_token", httponly=True, samesite="lax")

    return {"message": "Đã đổi mật khẩu thành công! Vui lòng đăng nhập lại."}
