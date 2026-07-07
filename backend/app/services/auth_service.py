import uuid
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user_model import User
from app.models.refresh_token_model import RefreshToken
from app.schemas.user_schema import UserLogin, ChangePassword
from app.repositories import user_repository, refresh_token_repository
from app.utils.password_hash import hash_password, verify_password
from app.utils.jwt_handler import create_access_token, create_refresh_token, decode_token


class AuthService:
    @staticmethod
    def authenticate_user(db: Session, user: UserLogin) -> dict:
        db_user = user_repository.get_by_email(db, user.email)
        if not db_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email hoặc mật khẩu không chính xác",
            )

        is_password_valid = verify_password(user.password, db_user.password_hash)
        if not is_password_valid:
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
            refresh_token_repository.create(db, new_rf_token)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user_id": db_user.id,
        }

    @staticmethod
    def refresh_tokens(db: Session, refresh_token: str) -> dict:
        try:
            payload = decode_token(refresh_token)
            user_id = payload.get("id")
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

        db_token = refresh_token_repository.get_valid_token(db, refresh_token)

        if not db_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh Token không hợp lệ hoặc đã bị thu hồi",
            )

        new_access_token = create_access_token(data={"id": user_id})
        return {
            "access_token": new_access_token,
            "user_id": user_id,
        }

    @staticmethod
    def logout_user(db: Session, user_id: int) -> None:
        refresh_token_repository.revoke_all_for_user(db, user_id)

    @staticmethod
    def change_user_password(
        db: Session, current_user: User, data: ChangePassword
    ) -> None:
        is_correct_old_password = verify_password(
            data.old_password, current_user.password_hash
        )
        if not is_correct_old_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mật khẩu hiện tại không đúng",
            )

        hashed_new_pass = hash_password(data.new_password)
        user_repository.update_password(db, current_user.id, hashed_new_pass)
        refresh_token_repository.revoke_all_for_user(db, current_user.id)
