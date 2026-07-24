from sqlalchemy.orm import Session
from langchain_core.messages import HumanMessage

from app.models.user_model import User
from app.schemas.ai_schema import QuickResponseRequest, QuickResponseResponse, ClassifyIntentResponse
from app.services.ai_services.agents import supervisor_node, qna_node, task_node, out_of_scope_node

def handle_classify_intent(
    db: Session,
    current_user: User,
    payload: QuickResponseRequest,
) -> ClassifyIntentResponse:
    initial_state = {
        "messages": [HumanMessage(content=payload.prompt)] if payload.prompt else [HumanMessage(content="Tóm tắt dự án giúp tôi.")],
        "user_id": current_user.id,
        "project_id": payload.project_id,
        "draft_tasks": None
    }
    
    decision_dict = supervisor_node(initial_state)
    intent = decision_dict.get("router_decision", "out_of_scope")
    return ClassifyIntentResponse(intent=intent)

def handle_execute_ai(
    db: Session,
    current_user: User,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    initial_state = {
        "messages": [HumanMessage(content=payload.prompt)] if payload.prompt else [HumanMessage(content="Tóm tắt dự án giúp tôi.")],
        "user_id": current_user.id,
        "project_id": payload.project_id,
        "draft_tasks": None
    }
    
    config = {"configurable": {"db": db, "project_id": payload.project_id, "current_user": current_user}}
    intent = payload.intent
    
    if intent == "qna":
        final_state = qna_node(initial_state, config)
    elif intent == "task":
        final_state = task_node(initial_state, config)
    else:
        final_state = out_of_scope_node(initial_state)
        
    final_resp: QuickResponseResponse = final_state.get("final_response")
    
    draft_tasks = final_state.get("draft_tasks")
    if draft_tasks:
        final_resp.summary += f"\n\n[BẢN NHÁP CẦN XÁC NHẬN]: Đã tạo {len(draft_tasks)} tasks nháp. Vui lòng phê duyệt để lưu vào hệ thống."
        
    return final_resp

