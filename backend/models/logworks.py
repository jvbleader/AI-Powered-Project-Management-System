from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from database.connection import Base


class LogWork(Base):
    __tablename__ = "logworks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    project_member_id = Column(Integer, ForeignKey("project_members.id"), nullable=False)
    work_date = Column(Date, nullable=False, index=True)
    hours_spent = Column(Numeric, nullable=False)
    work_content = Column(Text, nullable=False)
    comment = Column(Text)
    progress_percent = Column(Numeric, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))