from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class QuickResponseAction(str, Enum):
    DAILY_PRIORITY = "daily_priority"
    STALLED_TASKS = "stalled_tasks"
    CRITICAL_OVERDUE = "critical_overdue"
    FOLLOW_UP_MEMBERS = "follow_up_members"
    LEADER_BRIEF = "leader_brief"
    TASK_HEALTH = "task_health"
    GENERAL_QNA = "general_qna"
    OUT_OF_SCOPE = "out_of_scope"


class QuickResponseRequest(BaseModel):
    action: Optional[QuickResponseAction] = None
    prompt: Optional[str] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None


class QuickResponseEntity(BaseModel):
    type: Literal["task", "user", "project"]
    id: str
    label: str
    meta: Optional[str] = None


class QuickResponseResponse(BaseModel):
    action: QuickResponseAction
    title: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    entities: list[QuickResponseEntity] = Field(default_factory=list)
    generated_at: datetime
    data_freshness_note: str
