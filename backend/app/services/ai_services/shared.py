from app.models.task_model import Task
from app.schemas.ai_schema import (
    QuickResponseAction,
    QuickResponseEntity,
    QuickResponseResponse,
)
from app.services.ai_services.context import ProjectMemberSnapshot, QuickResponseContext
from app.services.ai_services.core_types import TaskInsight

DATA_FRESHNESS_NOTE = ""


def _build_response(
    context: QuickResponseContext,
    action: QuickResponseAction,
    title: str,
    summary: str,
    evidence: list[str] | None = None,
    recommendations: list[str] | None = None,
    entities: list[QuickResponseEntity] | None = None,
) -> QuickResponseResponse:
    return QuickResponseResponse(
        action=action,
        title=title,
        summary=summary,
        evidence=evidence or [],
        recommendations=recommendations or [],
        entities=entities or [],
        generated_at=context.now,
        data_freshness_note=DATA_FRESHNESS_NOTE,
    )


def _task_key(task: Task) -> str:
    return f"TASK-{task.id}"


def _task_title(task: Task) -> str:
    return task.title.strip() if task.title else _task_key(task)


def _task_entity(task: Task) -> QuickResponseEntity:
    return QuickResponseEntity(
        type="task",
        id=str(task.id),
        label=_task_key(task),
        meta=_task_title(task),
    )


def _member_entity(member: ProjectMemberSnapshot) -> QuickResponseEntity:
    return QuickResponseEntity(
        type="user",
        id=str(member.user_id),
        label=member.name,
        meta=member.email,
    )


def _primary_assignee_name(context: QuickResponseContext, task_id: int) -> str:
    assignee = context.get_primary_assignee(task_id)
    return assignee.name if assignee else "người phụ trách hiện tại"


def _format_days_label(days: int, singular: str = "ngày") -> str:
    return f"{days} {singular}"


def _format_task_insight(context: QuickResponseContext, insight: TaskInsight) -> str:
    task = insight.task
    assignee = context.get_primary_assignee(task.id)
    owner_label = f" | phụ trách: {assignee.name}" if assignee else ""
    return f"{_task_key(task)} - {_task_title(task)}{owner_label}: {'; '.join(insight.reasons[:3])}."


def task_is_missing_deadline(task: Task) -> bool:
    return task.deadline is None
