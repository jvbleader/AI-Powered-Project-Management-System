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
    TOP_PRIORITY_ITEMS,
    days_overdue,
    days_since_signal,
    days_until_deadline,
    is_near_due,
    is_open_task,
    is_overdue,
    normalize_priority,
)


def _build_daily_priority_insights(context: QuickResponseContext) -> list[TaskInsight]:
    insights: list[TaskInsight] = []
    for task in context.leaf_tasks:
        if not is_open_task(task):
            continue

        score = 0
        reasons: list[str] = []
        assignee = context.get_primary_assignee(task.id)

        if is_overdue(task, context.today):
            overdue_days = days_overdue(task, context.today)
            score += 60
            reasons.append(f"quá hạn {_format_days_label(overdue_days)}")
        elif is_near_due(task, context.today):
            days_left = days_until_deadline(task, context.today)
            if days_left is not None:
                score += 30
                reasons.append(f"còn {days_left} ngày đến hạn")

        if task.id in context.stalled_task_ids:
            idle_days = days_since_signal(context.last_signal_by_task_id.get(task.id), context.now)
            score += 25
            if idle_days is not None:
                reasons.append(f"không có cập nhật {idle_days} ngày")

        priority = normalize_priority(task.priority)
        if priority == "critical":
            score += 25
            reasons.append("độ ưu tiên critical")
        elif priority == "high":
            score += 15
            reasons.append("độ ưu tiên cao")

        if assignee and context.is_member_overloaded(assignee.user_id):
            score += 10
            reasons.append(f"{assignee.name} đang quá tải")

        if assignee and assignee.user_id in context.missing_logwork_user_ids:
            score += 10
            reasons.append(f"{assignee.name} chưa logwork hôm nay")

        if score > 0:
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


def build_daily_priority_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    insights = _build_daily_priority_insights(context)[:TOP_PRIORITY_ITEMS]
    if not insights:
        open_tasks = [task for task in context.leaf_tasks if is_open_task(task)]
        if not open_tasks:
            return _build_response(
                context,
                payload.action,
                "Không còn việc mở cần theo sát",
                "Dự án hiện không còn leaf task nào đang mở cần ưu tiên trong hôm nay.",
                recommendations=["Tiếp tục duy trì cập nhật logwork và theo dõi các dấu mốc mới."],
                entities=[
                    QuickResponseEntity(type="project", id=str(p.id), label=p.name) for p in context.projects
                ],
            )

        return _build_response(
            context,
            payload.action,
            "Chưa có điểm nóng rõ ràng",
            "Hôm nay chưa có task nào vượt ngưỡng cần can thiệp ngay theo bộ rule hiện tại.",
            evidence=[f"Còn {len(open_tasks)} task mở nhưng chưa có task nào vừa quá hạn vừa đứng yên."],
            recommendations=["Tiếp tục ưu tiên theo hạn chót gần nhất và giữ đều logwork trong ngày."],
            entities=[
                QuickResponseEntity(type="project", id=str(p.id), label=p.name) for p in context.projects
            ],
        )

    evidence = [_format_task_insight(context, insight) for insight in insights]
    recommendations = [
        f"Follow up {_task_key(insight.task)} với {_primary_assignee_name(context, insight.task.id)} trong hôm nay."
        for insight in insights
    ]
    return _build_response(
        context,
        payload.action,
        "3 việc nên theo sát hôm nay",
        f"Có {len(insights)} task đang nổi lên rõ nhất theo rule overdue, stalled, priority và tải của người xử lý.",
        evidence=evidence,
        recommendations=recommendations,
        entities=[_task_entity(insight.task) for insight in insights],
    )
