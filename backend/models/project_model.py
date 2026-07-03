from sqlalchemy import ForeignKey
from sqlalchemy import Column, String, Boolean, Datetime
from database.connection import Base
from enum import Enum
from datetime import datetime


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
    status = Column(Enum(""), nullable=False, default="active")
    start_date = Column(Datetime, default=datetime.now(timezone.utc))
    end_date = Column(Datetime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(Datetime, default=datetime.now(timezone.utc))
    updated_at = Column(Datetime)


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    joined_at = Column(Datetime, default=datetime.now(timezone.utc))
