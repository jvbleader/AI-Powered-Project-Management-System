from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.connection import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    is_admin = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)


class Project(Base):
    __tablename__ = "projects"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    project_type = Column(String(50), nullable=False, default="agile")
    description = Column(Text)
    status = Column(String(50), nullable=False, default="active", index=True)
    start_date = Column(Date, nullable=True, index=True)
    end_date = Column(Date, nullable=True, index=True)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    manager = relationship("User", foreign_keys=[manager_id])


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True, nullable=False, index=True)
