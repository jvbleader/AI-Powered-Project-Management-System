from datetime import date

from app.schemas.ai_schema import QuickResponseEntity, QuickResponseRequest, QuickResponseResponse
from app.services.ai_services.context import QuickResponseContext
from app.services.ai_services.core_types import TaskInsight
from app.services.ai_services.shared import (
    _build_response,
    _format_days_label,
    _format_task_insight,
    _task_entity,
    _task_key,
)
from app.utils.ai_rules import (
    TOP_OVERDUE_ITEMS,
    days_overdue,
    normalize_priority,
)


def _build_overdue_task_insights(context: QuickResponseContext) -> list[TaskInsight]:
    insights: list[TaskInsight] = []
    for task in context.leaf_tasks:
        if task.id not in context.overdue_task_ids:
            continue

        overdue_days = min(25, days_overdue(task, context.today) * 5)
        score = overdue_days
        reasons = [f"quá hạn {_format_days_label(days_overdue(task, context.today))}"]

        priority = normalize_priority(task.priority)
        if priority == "critical":
            score += 25
            reasons.append("độ ưu tiên critical")
        elif priority == "high":
            score += 15
            reasons.append("độ ưu tiên cao")

        if task.id in context.stalled_task_ids:
            score += 15
            reasons.append("đang đứng yên")

        assignee = context.get_primary_assignee(task.id)
        if assignee and context.is_member_overloaded(assignee.user_id):
            score += 10
            reasons.append(f"{assignee.name} đang quá tải")

        insights.append(TaskInsight(task=task, score=score, reasons=reasons))

    insights.sort(
        key=lambda insight: (
            -insight.score,
            -(days_overdue(insight.task, context.today)),
            insight.task.deadline or date.max,
            insight.task.id,
        )
    )
    return insights


def build_critical_overdue_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    insights = _build_overdue_task_insights(context)[:TOP_OVERDUE_ITEMS]
    if not insights:
        return _build_response(
            context,
            payload.action,
            "Không có task trễ hạn",
            "Không phát hiện leaf task nào đang quá hạn trong dự án này.",
            recommendations=["Tiếp tục giữ nhịp cập nhật và theo dõi những task gần hạn."],
            entities=[
                QuickResponseEntity(type="project", id=str(p.id), label=p.name) for p in context.projects
            ],
        )

    return _build_response(
        context,
        payload.action,
        "Task trễ hạn đáng lo nhất",
        f"Có {len(insights)} task quá hạn nổi bật nhất theo số ngày trễ, mức ưu tiên và tải của người phụ trách.",
        evidence=[_format_task_insight(context, insight) for insight in insights],
        recommendations=[
            f"Ưu tiên gỡ vướng {_task_key(insight.task)} trước vì đây là task trễ hạn có độ rủi ro cao."
            for insight in insights[:3]
        ],
        entities=[_task_entity(insight.task) for insight in insights],
    )
