from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (Boolean, Column, Date, DateTime, ForeignKey, Integer, String,
                        Text)

from app.core.connection import Base


class ProjectStatus(Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    COMPLETED = "completed"
    AT_RISK = "at_risk"


class Role(Base):
    __tablename__ = "roles"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    name = Column(String(255), nullable=False, unique=True)


class Project(Base):
    __tablename__ = "projects"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(50), nullable=False, default="active", index=True)
    start_date = Column(Date, default=lambda: datetime.now(timezone.utc).date(), index=True)
    end_date = Column(Date, nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True, nullable=False, index=True)
