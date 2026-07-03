import os
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from database.connection import Base

EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS"))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    refresh_token = Column(String(512), nullable=False)
    jti = Column(String(255), nullable=False, unique=True)
    revoked = Column(Boolean, nullable=False, default=False)
    ip_address = Column(String(255))
    user_agent = Column(String(255))
    expires_at = Column(
        DateTime,
        nullable=False,
        default=datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS),
    )
    created_at = Column(DateTime, nullable=False, default=datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=datetime.now(timezone.utc))
