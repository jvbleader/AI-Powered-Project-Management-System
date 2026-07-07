from datetime import datetime, timezone

from sqlalchemy import (Column, Date, DateTime, ForeignKey, Integer, String,
                        Text)

from app.core.connection import Base


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    goal = Column(Text, nullable=True)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    status = Column(String(50), nullable=False, default="planning", index=True)
    review_note = Column(Text)
    created_by_member_id = Column(Integer, ForeignKey("project_members.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
