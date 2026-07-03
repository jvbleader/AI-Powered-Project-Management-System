from datetime import datetime, timezone

from database.connection import Base
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String


class LogWork(Base):
    __tablename__ = "logworks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    project_member_id = Column(Integer, ForeignKey("project_members.id"), nullable=False)
    work_date = Column(Date, nullable=False)
    hours_spent = Column(Numeric, nullable=False)
    work_content = Column(String, nullable=False)
    comment = Column(String)
    progress_percent = Column(Numeric, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))