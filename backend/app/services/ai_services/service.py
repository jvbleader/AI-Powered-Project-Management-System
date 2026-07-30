import json
import logging

from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from app.models.user_model import User
from app.repositories import ai_repository
from app.schemas.ai_schema import ClassifyIntentResponse, QuickResponseRequest
from app.services.ai_services.graph import project_graph
from app.services.ai_services.nodes import supervisor_node

logger = logging.getLogger(__name__)


def handle_classify_intent(
    db: Session,
    current_user: User,
    payload: QuickResponseRequest,
) -> ClassifyIntentResponse:
    initial_state = {
        "messages": [HumanMessage(content=payload.prompt)],
        "user_id": current_user.id,
        "project_id": payload.project_id,
        "draft_tasks": None,
    }

    decision_dict = supervisor_node(initial_state)
    intent = decision_dict.get("router_decision", "out_of_scope")
    return ClassifyIntentResponse(intent=intent)


async def stream_chat_sse(
    session_id: str, message: str, db: Session, current_user: User, project_id: int | None = None
):
    if not session_id.isdigit():
        yield f"data: {json.dumps({'error': 'Invalid session ID'})}\n\n"
        return

    db_session_id = int(session_id)
    ai_repository.create_message(db, db_session_id, "user", message)

    initial_state = {
        "messages": [HumanMessage(content=message)],
        "user_id": current_user.id,
        "project_id": project_id,
    }

    config = {
        "configurable": {
            "thread_id": session_id,
            "db": db,
            "project_id": project_id,
            "current_user": current_user,
        }
    }

    logger.info(f"Starting chat stream for session {session_id}, user {current_user.id}")

    full_ai_response = ""
    try:
        if hasattr(project_graph.checkpointer, "asetup"):
            await project_graph.checkpointer.asetup()
        elif hasattr(project_graph.checkpointer, "setup"):
            await project_graph.checkpointer.setup()

        async for event in project_graph.astream_events(initial_state, config, version="v2"):
            kind = event["event"]
            tags = event.get("tags", [])

            if "supervisor_llm" in tags or "summarizer_llm" in tags:
                continue

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"].content
                if chunk:
                    full_ai_response += chunk
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            elif kind == "on_tool_start":
                yield f"data: {json.dumps({'tool_call': 'phân tích'})}\n\n"
            elif kind == "on_chain_end" and event.get("name") in [
                "out_of_scope_agent",
                "out_of_scope_node",
                "out_of_scope",
            ]:
                chunk_str = (
                    "Xin lỗi, câu hỏi của bạn nằm ngoài phạm vi hỗ trợ của hệ thống Quản lý Dự án."
                )
                full_ai_response += chunk_str
                yield f"data: {json.dumps({'chunk': chunk_str})}\n\n"

        if not full_ai_response:
            logger.error("full_ai_response is empty. Falling back to aget_state")
            final_state = await project_graph.aget_state(config)
            if final_state and final_state.values and "messages" in final_state.values:
                last_msg = final_state.values["messages"][-1]
                logger.error(f"Last message type: {getattr(last_msg, 'type', 'unknown')}, content: {last_msg.content}")
                if getattr(last_msg, "type", "") == "ai" and last_msg.content:
                    full_ai_response = last_msg.content
                    yield f"data: {json.dumps({'chunk': full_ai_response})}\n\n"
            else:
                logger.error("final_state or messages is empty")

        if full_ai_response:
            ai_repository.create_message(db, db_session_id, "assistant", full_ai_response)

        yield "data: [DONE]\n\n"
    except Exception as e:
        logger.exception("Error in stream_chat_sse")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


def get_user_sessions(db: Session, current_user: User):
    return ai_repository.get_sessions_by_user(db, current_user.id)


def create_user_session(db: Session, current_user: User, title: str):
    return ai_repository.create_session(db, current_user.id, title)


def get_user_session_messages(db: Session, current_user: User, session_id: int):
    session = ai_repository.get_session_by_id_and_user(db, session_id, current_user.id)
    if not session:
        return []
    return ai_repository.get_messages_by_session(db, session_id)


def update_user_session(db: Session, current_user: User, session_id: int, title: str):
    session = ai_repository.get_session_by_id_and_user(db, session_id, current_user.id)
    if session:
        return ai_repository.update_session(db, session, title)
    return None


def delete_user_session(db: Session, current_user: User, session_id: int):
    session = ai_repository.get_session_by_id_and_user(db, session_id, current_user.id)
    if session:
        ai_repository.delete_messages_by_session(db, session.id)
        ai_repository.delete_session(db, session)
        return True
    return False