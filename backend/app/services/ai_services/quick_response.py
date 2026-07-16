from sqlalchemy.orm import Session

from app.models.user_model import User
from app.schemas.ai_schema import QuickResponseAction, QuickResponseRequest, QuickResponseResponse
from app.services.ai_services.context import load_quick_response_context
from app.services.ai_services.handlers.critical_overdue import build_critical_overdue_response
from app.services.ai_services.handlers.daily_priority import build_daily_priority_response
from app.services.ai_services.handlers.follow_up_members import build_follow_up_members_response
from app.services.ai_services.handlers.leader_brief import build_leader_brief_response
from app.services.ai_services.handlers.stalled_tasks import build_stalled_tasks_response
from app.services.ai_services.handlers.task_health import build_task_health_response
from app.services.ai_services.llm import classify_intent, generate_general_response
from app.services.ai_services.shared import _build_response


def handle_quick_response(
    db: Session,
    current_user: User,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    context = load_quick_response_context(db, current_user, payload.project_id)

    if payload.prompt and not payload.action:
        action = classify_intent(payload.prompt)
        try:
            payload.action = QuickResponseAction(action)
        except ValueError:
            payload.action = QuickResponseAction.GENERAL_QNA
            
        if payload.action == QuickResponseAction.OUT_OF_SCOPE:
            return _build_response(
                context=context,
                action=QuickResponseAction.OUT_OF_SCOPE,
                title="Ngoài phạm vi hỗ trợ",
                summary="Tôi chỉ là trợ lý hỗ trợ các thông tin liên quan đến dự án, không hỗ trợ các lĩnh vực ngoài. Vui lòng nhập lại câu hỏi khác.",
            )

        if payload.action == QuickResponseAction.GENERAL_QNA:
            llm_response = generate_general_response(payload.prompt, context)
            return _build_response(
                context=context,
                action=QuickResponseAction.GENERAL_QNA,
                title=llm_response.title,
                summary=llm_response.summary,
                evidence=llm_response.evidence,
                recommendations=llm_response.recommendations,
            )

    if not payload.action:
        payload.action = QuickResponseAction.DAILY_PRIORITY

    handlers = {
        QuickResponseAction.DAILY_PRIORITY: build_daily_priority_response,
        QuickResponseAction.STALLED_TASKS: build_stalled_tasks_response,
        QuickResponseAction.CRITICAL_OVERDUE: build_critical_overdue_response,
        QuickResponseAction.FOLLOW_UP_MEMBERS: build_follow_up_members_response,
        QuickResponseAction.LEADER_BRIEF: build_leader_brief_response,
        QuickResponseAction.TASK_HEALTH: build_task_health_response,
    }

    handler = handlers.get(payload.action, build_daily_priority_response)
    return handler(context, payload)
