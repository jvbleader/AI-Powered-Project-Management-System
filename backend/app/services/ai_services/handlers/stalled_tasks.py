from datetime import date

from app.schemas.ai_schema import QuickResponseEntity, QuickResponseRequest, QuickResponseResponse
from app.services.ai_services.context import QuickResponseContext
from app.services.ai_services.core_types import TaskInsight
from app.services.ai_services.shared import (
    _build_response,
    _format_days_label,
    _format_task_insight,
    _primary_assignee_name,
    _task_entity,
    _task_key,
    task_is_missing_deadline,
)
from app.utils.ai_rules import (
    TOP_STALLED_ITEMS,
    days_overdue,
    days_since_signal,
    days_until_deadline,
    is_high_priority,
    is_near_due,
    is_overdue,
)


def _build_stalled_task_insights(context: QuickResponseContext) -> list[TaskInsight]:
    insights: list[TaskInsight] = []
    for task in context.leaf_tasks:
        if task.id not in context.stalled_task_ids:
            continue

        score = 20
        reasons: list[str] = []
        idle_days = days_since_signal(context.last_signal_by_task_id.get(task.id), context.now)
        if idle_days is not None:
            reasons.append(f"không có cập nhật {idle_days} ngày")

        if is_overdue(task, context.today):
            score += 25
            reasons.append(f"quá hạn {_format_days_label(days_overdue(task, context.today))}")
        elif is_near_due(task, context.today):
            days_left = days_until_deadline(task, context.today)
            if days_left is not None:
                score += 20
                reasons.append(f"còn {days_left} ngày đến hạn")

        if is_high_priority(task.priority):
            score += 15
            reasons.append("độ ưu tiên cao")

        insights.append(TaskInsight(task=task, score=score, reasons=reasons))

    insights.sort(
        key=lambda insight: (
            -insight.score,
            task_is_missing_deadline(insight.task),
            insight.task.deadline or date.max,
            insight.task.id,
        )
    )
    return insights


def build_stalled_tasks_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    insights = _build_stalled_task_insights(context)[:TOP_STALLED_ITEMS]
    if not insights:
        return _build_response(
            context,
            payload.action,
            "Không có task đứng yên đáng lo",
            "Hiện chưa có task nào thỏa điều kiện đứng yên trong nhóm cần cảnh báo sớm.",
            evidence=["Không có leaf task nào mất cập nhật từ 2 ngày trở lên và đồng thời sắp đến hạn hoặc ưu tiên cao."],
            recommendations=["Duy trì cập nhật logwork hàng ngày cho các task gần hạn."],
            entities=[
                QuickResponseEntity(type="project", id=str(p.id), label=p.name) for p in context.projects
            ],
        )

    return _build_response(
        context,
        payload.action,
        "Danh sách task đang đứng yên",
        f"Có {len(insights)} task đang mất tín hiệu cập nhật và cần được kiểm tra lại sớm.",
        evidence=[_format_task_insight(context, insight) for insight in insights],
        recommendations=[
            f"Yêu cầu {_primary_assignee_name(context, insight.task.id)} cập nhật tiến độ cho {_task_key(insight.task)}."
            for insight in insights[:3]
        ],
        entities=[_task_entity(insight.task) for insight in insights],
    )
