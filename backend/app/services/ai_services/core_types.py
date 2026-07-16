from dataclasses import dataclass

from app.models.task_model import Task
from app.services.ai_services.context import ProjectMemberSnapshot


@dataclass
class TaskInsight:
    task: Task
    score: int
    reasons: list[str]


@dataclass
class MemberInsight:
    member: ProjectMemberSnapshot
    score: int
    reasons: list[str]
