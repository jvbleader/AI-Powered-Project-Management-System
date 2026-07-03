from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String

from database.connection import Base


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    goal = Column(String(255), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(50), nullable=False, default="planning")
    review_note = Column(String)
    created_by_member_id = Column(Integer, ForeignKey("project_members.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
