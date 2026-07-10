from typing import Optional
from pydantic import BaseModel
from datetime import date, datetime

class SprintBase(BaseModel):
    name: str
    goal: Optional[str] = None
    start_date: date
    end_date: date
    status: Optional[str] = "planning"
    review_note: Optional[str] = None

class SprintCreate(SprintBase):
    pass

class SprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None
    review_note: Optional[str] = None

class SprintResponse(SprintBase):
    id: int
    project_id: int
    created_by_member_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
