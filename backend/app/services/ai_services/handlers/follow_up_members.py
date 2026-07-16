from app.schemas.ai_schema import QuickResponseEntity, QuickResponseRequest, QuickResponseResponse
from app.services.ai_services.context import QuickResponseContext
from app.services.ai_services.core_types import MemberInsight
from app.services.ai_services.shared import _build_response, _member_entity
from app.utils.ai_rules import TOP_FOLLOW_UP_MEMBERS


def _build_follow_up_member_insights(context: QuickResponseContext) -> list[MemberInsight]:
    insights: list[MemberInsight] = []
    for member in context.project_members:
        score = 0
        reasons: list[str] = []
        assigned_open_tasks = context.open_tasks_by_user_id.get(member.user_id, [])
        overdue_count = sum(1 for task in assigned_open_tasks if task.id in context.overdue_task_ids)
        stalled_count = sum(1 for task in assigned_open_tasks if task.id in context.stalled_task_ids)

        if member.user_id in context.missing_logwork_user_ids:
            score += 40
            reasons.append("chưa logwork hôm nay")

        if overdue_count:
            score += overdue_count * 20
            reasons.append(f"{overdue_count} task đang quá hạn")

        if stalled_count:
            score += stalled_count * 15
            reasons.append(f"{stalled_count} task đang đứng yên")

        if len(assigned_open_tasks) >= 4:
            score += 10
            reasons.append(f"đang giữ {len(assigned_open_tasks)} task mở")

        if score >= 40:
            insights.append(MemberInsight(member=member, score=score, reasons=reasons))

    insights.sort(key=lambda insight: (-insight.score, insight.member.name.lower()))
    return insights


def build_follow_up_members_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    insights = _build_follow_up_member_insights(context)[:TOP_FOLLOW_UP_MEMBERS]
    if not insights:
        return _build_response(
            context,
            payload.action,
            "Chưa có ai cần follow-up gấp",
            "Không có thành viên nào vượt ngưỡng follow-up theo rule hiện tại.",
            evidence=["Tất cả thành viên đều đã logwork hôm nay, hoặc không giữ task quá hạn/đứng yên đáng kể."],
            recommendations=["Tiếp tục nhắc nhẹ theo lịch logwork thông thường."],
            entities=[
                QuickResponseEntity(type="project", id=str(p.id), label=p.name) for p in context.projects
            ],
        )

    return _build_response(
        context,
        payload.action,
        "Thành viên nên được nhắc hôm nay",
        f"Có {len(insights)} thành viên vượt ngưỡng follow-up do thiếu logwork hoặc đang giữ task cần can thiệp.",
        evidence=[
            f"{insight.member.name}: {'; '.join(insight.reasons[:3])}."
            for insight in insights
        ],
        recommendations=[
            f"Nhắc {insight.member.name} cập nhật trạng thái và logwork trong hôm nay."
            for insight in insights[:3]
        ],
        entities=[_member_entity(insight.member) for insight in insights],
    )
