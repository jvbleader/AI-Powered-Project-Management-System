from sqlalchemy.orm import Session

from models.refresh_token_model import RefreshToken


def revoke_all_for_user(db: Session, user_id: int) -> None:
    db.query(RefreshToken).filter(RefreshToken.user_id == user_id).update({"revoked": True})
    db.commit()
