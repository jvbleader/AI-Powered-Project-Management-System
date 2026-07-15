from fastapi import HTTPException

from app.schemas.ai_schema import QuickResponseRequest, QuickResponseResponse
from app.services.ai_services.context import QuickResponseContext
from app.services.ai_services.shared import (
    _build_response,
    _format_days_label,
    _member_entity,
    _primary_assignee_name,
    _task_entity,
    _task_key,
)
from app.utils.ai_rules import days_overdue, days_since_signal, is_near_due, normalize_priority
from app.utils.dashboard_helpers import normalize_task_status


def build_task_health_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    if payload.task_id is None:
        raise HTTPException(status_code=400, detail="Task ID là bắt buộc cho action task_health.")

    task_id = payload.task_id
    task = context.task_by_id.get(task_id) if task_id else None
    if not task or task.project_id not in [p.id for p in context.projects]:
        raise HTTPException(status_code=404, detail="Không tìm thấy task trong dự án đã chọn.")

    priority = normalize_priority(task.priority)
    assignee = context.get_primary_assignee(task.id)
    stalled = task.id in context.stalled_task_ids
    overdue = task.id in context.overdue_task_ids
    near_due = is_near_due(task, context.today)

    severity = "healthy"
    if overdue and stalled:
        severity = "critical"
    elif overdue:
        severity = "risk"
    elif stalled and near_due:
        severity = "critical"
    elif stalled or near_due or priority in {"high", "critical"}:
        severity = "watch"

    evidence = [
        f"Trạng thái hiện tại: {normalize_task_status(task.status)}.",
        f"Độ ưu tiên: {priority}.",
    ]
    if task.deadline:
        evidence.append(f"Hạn chót: {task.deadline.strftime('%d/%m/%Y')}.")
    if stalled:
        idle_days = days_since_signal(context.last_signal_by_task_id.get(task.id), context.now)
        if idle_days is not None:
            evidence.append(f"Task không có cập nhật {idle_days} ngày.")
    if overdue:
        evidence.append(f"Task đã quá hạn {_format_days_label(days_overdue(task, context.today))}.")
    if assignee:
        evidence.append(f"Người phụ trách hiện tại: {assignee.name}.")

    recommendations = []
    if severity == "critical":
        recommendations.append(f"Cần kiểm tra ngay {_task_key(task)} với {_primary_assignee_name(context, task.id)}.")
    elif severity == "risk":
        recommendations.append(f"Nên chốt cách gỡ vướng cho {_task_key(task)} trong hôm nay.")
    elif severity == "watch":
        recommendations.append(f"Theo dõi sát cập nhật tiếp theo của {_task_key(task)} trước hạn chót.")
    else:
        recommendations.append(f"Tiếp tục duy trì nhịp cập nhật đều cho {_task_key(task)}.")

    title = f"Sức khỏe nhanh của {_task_key(task)}"
    summary = f"{_task_key(task)} đang ở mức {severity} theo bộ rule deadline, cập nhật gần nhất và mức ưu tiên."
    entities = [_task_entity(task)]
    if assignee and assignee.user_id in context.member_by_user_id:
        entities.append(_member_entity(context.member_by_user_id[assignee.user_id]))

    return _build_response(
        context,
        payload.action,
        title,
        summary,
        evidence=evidence,
        recommendations=recommendations,
        entities=entities,
    )
