from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String

from database.connection import Base


class ProjectStatus(Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    COMPLETED = "completed"


class Role(Base):
    __tablename__ = "roles"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    name = Column(String(255), nullable=False)


class Project(Base):
    __tablename__ = "projects"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    name = Column(String(255), nullable=False)
    description = Column(String(255))
    status = Column(String(50), nullable=False, default="active")
    start_date = Column(Date, default=lambda: datetime.now(timezone.utc).date())
    end_date = Column(Date, nullable=True)
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
