import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from app.core.connection import Base
from app.config.settings import get_settings

settings = get_settings()

EXPIRE_DAYS = settings.refresh_token_expire_days


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(512), nullable=False, unique=True)
    jti = Column(String(255), nullable=False, unique=True)
    revoked = Column(Boolean, nullable=False, default=False, index=True)
    ip_address = Column(String(255))
    user_agent = Column(String(255))
    expires_at = Column(
        DateTime,
        nullable=False,
        index=True,
        default=datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS),
    )
    created_at = Column(DateTime, nullable=False, default=datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=datetime.now(timezone.utc))
