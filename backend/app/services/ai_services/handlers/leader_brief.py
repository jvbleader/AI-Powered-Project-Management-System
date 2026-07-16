from app.schemas.ai_schema import QuickResponseEntity, QuickResponseRequest, QuickResponseResponse
from app.services.ai_services.context import QuickResponseContext
from app.services.ai_services.handlers.critical_overdue import _build_overdue_task_insights
from app.services.ai_services.handlers.follow_up_members import _build_follow_up_member_insights
from app.services.ai_services.handlers.stalled_tasks import _build_stalled_task_insights
from app.services.ai_services.shared import _build_response, _member_entity, _task_entity, _task_key
from app.utils.ai_rules import is_open_task


def build_leader_brief_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    overdue_insights = _build_overdue_task_insights(context)
    stalled_insights = _build_stalled_task_insights(context)
    member_insights = _build_follow_up_member_insights(context)
    open_tasks = [task for task in context.leaf_tasks if is_open_task(task)]

    summary_parts = [
        f"Đến ngày {context.today.strftime('%d/%m/%Y')}, (các) dự án đang có {len(open_tasks)} task mở và mức hoàn thành ước tính {context.project_progress}%.",
    ]
    if overdue_insights:
        summary_parts.append(
            f"Hiện có {len(overdue_insights)} task quá hạn, nổi bật nhất là {_task_key(overdue_insights[0].task)}."
        )
    else:
        summary_parts.append("Hiện chưa có task quá hạn trong nhóm leaf task.")

    if stalled_insights:
        summary_parts.append(
            f"Có {len(stalled_insights)} task đang đứng yên và cần kiểm tra lại tiến độ trong ngày."
        )
    else:
        summary_parts.append("Chưa phát hiện task đứng yên đáng lo theo rule hiện tại.")

    if member_insights:
        summary_parts.append(
            f"Cần follow-up {len(member_insights)} thành viên, ưu tiên {member_insights[0].member.name}."
        )
    else:
        summary_parts.append("Không có thành viên nào vượt ngưỡng follow-up gấp.")

    recommendations = []
    if overdue_insights:
        recommendations.append(
            f"Ưu tiên xử lý {_task_key(overdue_insights[0].task)} trước để giảm rủi ro chậm tiến độ."
        )
    if member_insights:
        recommendations.append(
            f"Nhắc {member_insights[0].member.name} cập nhật logwork và trạng thái task ngày hôm nay."
        )
    if not recommendations:
        recommendations.append("Tiếp tục giữ nhịp cập nhật task và logwork hàng ngày.")

    evidence = [
        f"Project progress ước tính: {context.project_progress}%.",
        f"Task quá hạn: {len(overdue_insights)}.",
        f"Task đứng yên: {len(stalled_insights)}.",
        f"Logwork coverage hôm nay: {context.logwork_coverage}%.",
    ]

    entities = [QuickResponseEntity(type="project", id=str(p.id), label=p.name) for p in context.projects]
    if overdue_insights:
        entities.append(_task_entity(overdue_insights[0].task))
    if member_insights:
        entities.append(_member_entity(member_insights[0].member))

    return _build_response(
        context,
        payload.action,
        "Cập nhật nhanh cho leader",
        " ".join(summary_parts),
        evidence=evidence,
        recommendations=recommendations,
        entities=entities,
    )
