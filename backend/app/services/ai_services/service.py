import json
import logging
import re

from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session, joinedload

from app.core.connection import SessionLocal
from app.models.ai_model import AiDraft
from app.models.user_model import User
from app.repositories import ai_repository
from app.schemas.ai_schema import ClassifyIntentResponse, QuickResponseRequest
from app.services.ai_services.graph import project_graph
from app.services.ai_services.nodes import supervisor_node

logger = logging.getLogger("AI_AGENT")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - [%(levelname)s] - %(name)s - %(message)s')
    logger.addHandler(ch)


def handle_classify_intent(
    db: Session,
    current_user: User,
    payload: QuickResponseRequest,
) -> ClassifyIntentResponse:
    initial_state = {
        "messages": [HumanMessage(content=payload.prompt)],
        "user_id": current_user.id,
        "project_id": payload.project_id,
    }

    decision_dict = supervisor_node(initial_state)
    intent = decision_dict.get("router_decision", "out_of_scope")
    logger.info("=========================================")
    logger.info("[SUPERVISOR] Phân loại ý định người dùng:")
    logger.info(f"- Prompt: {payload.prompt}")
    logger.info(f"- Kết quả phân loại: {intent}")
    logger.info("=========================================")

    if intent == "out_of_scope":
        return ClassifyIntentResponse(intent=intent)
    return ClassifyIntentResponse(intent=intent)


async def stream_chat_sse(
    session_id: str,
    message: str,
    current_user_id: int,
    project_id: int | None = None,
):
    """
    SSE stream dùng SessionLocal riêng — không dùng session từ Depends(get_db).
    FastAPI đóng request DB khi StreamingResponse bắt đầu gửi, gây 'read of closed file'.
    """
    db = SessionLocal()
    try:
        current_user = (
            db.query(User)
            .options(joinedload(User.role_ref), joinedload(User.department))
            .filter(User.id == current_user_id)
            .first()
        )
        if not current_user:
            yield f"data: {json.dumps({'error': 'User not found'})}\n\n"
            return

        if not session_id.isdigit():
            session = ai_repository.create_session(db, current_user.id, "Đoạn chat mới")
            db_session_id = session.id
            yield f"data: {json.dumps({'new_session_id': str(db_session_id)})}\n\n"
        else:
            db_session_id = int(session_id)
            session = ai_repository.get_session_by_id_and_user(db, db_session_id, current_user.id)
            if not session:
                session = ai_repository.create_session(db, current_user.id, "Đoạn chat mới")
                db_session_id = session.id
                yield f"data: {json.dumps({'new_session_id': str(db_session_id)})}\n\n"

        ai_repository.create_message(db, db_session_id, "user", message)

        initial_state = {
            "messages": [HumanMessage(content=message)],
            "user_id": current_user.id,
            "project_id": project_id,
        }

        thread_id = str(db_session_id)
        config = {
            "configurable": {
                "thread_id": thread_id,
                "db": db,
                "project_id": project_id,
                "conversation_project_id": getattr(session, "project_id", None),
                "current_user": current_user,
            }
        }

        logger.info(f"Starting chat stream for session {thread_id}, user {current_user.id}")

        full_ai_response = ""
        try:
            if hasattr(project_graph.checkpointer, "asetup"):
                await project_graph.checkpointer.asetup()
            elif hasattr(project_graph.checkpointer, "setup"):
                await project_graph.checkpointer.setup()

            async for event in project_graph.astream_events(initial_state, config, version="v2"):
                kind = event["event"]
                name = event.get("name", "")
                tags = event.get("tags", [])

                if "supervisor_llm" in tags or "summarizer_llm" in tags:
                    continue

                logger.debug(f"[RAW EVENT] kind={kind}, name={event.get('name')}")

                if kind == "on_chat_model_start":
                    logger.info(f"\n🤔 [AI ĐANG SUY NGHĨ] Gọi LLM ({event.get('name')})...")
                elif kind == "on_chat_model_end":
                    logger.info(f"💡 [LLM PHẢN HỒI XONG] ({event.get('name')})")
                elif kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"].content
                    if chunk:
                        full_ai_response += chunk
                        yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                elif kind == "on_tool_start":
                    tool_name = event.get("name", "unknown_tool")
                    tool_input = event.get("data", {}).get("input", {})
                    logger.info(f"\n🚀 [TOOL BẮT ĐẦU] {tool_name}")
                    try:
                        in_str = json.dumps(tool_input, indent=2, ensure_ascii=False)
                        for line in in_str.split("\n"):
                            logger.info(f"   ▶ {line}")
                    except Exception:
                        logger.info(f"   ▶ Input: {tool_input}")

                    yield f"data: {json.dumps({'tool_call': 'phân tích'})}\n\n"
                elif kind == "on_tool_end":
                    tool_name = event.get("name", "unknown_tool")
                    tool_output = event.get("data", {}).get("output", "")
                    logger.info(f"✅ [TOOL KẾT THÚC] {tool_name}")

                    try:
                        out_str = json.dumps(tool_output, indent=2, ensure_ascii=False)
                    except Exception:
                        out_str = str(tool_output)

                    lines = out_str.split("\n")
                    if len(lines) > 20:
                        lines = (
                            lines[:20] + ["  ... (truncated) ...", "]"]
                            if out_str.startswith("[")
                            else lines[:20] + ["  ... (truncated) ...", "}"]
                        )

                    logger.info("   ◀ Output:")
                    for line in lines:
                        logger.info(f"       {line}")
                    logger.info("")
                elif kind == "on_chain_start":
                    if name in ["qna_agent", "task_agent", "out_of_scope_agent"]:
                        logger.info(f"\n🧠 [AGENT XỬ LÝ] Đang chạy agent: {name}")
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

            final_state = await project_graph.aget_state(config)
            if final_state and final_state.values and "messages" in final_state.values:
                last_msg = final_state.values["messages"][-1]
                if getattr(last_msg, "type", "") == "ai" and last_msg.content:
                    final_content = last_msg.content
                    if final_content != full_ai_response:
                        full_ai_response = final_content
                        yield f"data: {json.dumps({'replace': full_ai_response})}\n\n"

            if full_ai_response:
                clean_response = re.sub(
                    r"```(json_(?:task_draft|sprint_draft|sprint_status_draft))_(?:confirmed|rejected)\b",
                    r"```\1",
                    full_ai_response,
                )
                db_msg = ai_repository.create_message(db, db_session_id, "assistant", clean_response)
                drafts = create_message_drafts(db, db_msg.id, clean_response)
                yield f"data: {json.dumps({'message_id': db_msg.id, 'drafts': drafts})}\n\n"

            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Error in stream_chat_sse")
            # A failed stream is not a completed assistant response.  Let the
            # client present an error/retry affordance and keep history clean.
            yield f"data: {json.dumps({'error': 'AI stream failed'})}\n\n"
            yield "data: [DONE]\n\n"
    finally:
        db.close()


def get_user_sessions(db: Session, current_user: User):
    return ai_repository.get_sessions_by_user(db, current_user.id)


def create_user_session(db: Session, current_user: User, title: str):
    return ai_repository.create_session(db, current_user.id, title)


def get_user_session_messages(db: Session, current_user: User, session_id: int):
    session = ai_repository.get_session_by_id_and_user(db, session_id, current_user.id)
    if not session:
        return []
    messages = ai_repository.get_messages_by_session(db, session_id)
    drafts_by_message = ai_repository.get_drafts_by_message_ids(db, [message.id for message in messages])
    return [
        {
            "id": message.id,
            "sender": message.sender,
            "content": message.content,
            "created_at": message.created_at,
            "drafts": serialize_drafts(drafts_by_message.get(message.id, [])),
        }
        for message in messages
    ]


_DRAFT_BLOCK_RE = re.compile(
    r"```(json_task_draft|json_sprint_draft|json_sprint_status_draft)\s*(.*?)\s*```",
    re.DOTALL,
)


def serialize_drafts(drafts: list[AiDraft]) -> list[dict]:
    return [
        {"id": draft.id, "fence": draft.fence, "block_index": draft.block_index,
         "payload": draft.payload, "status": draft.status}
        for draft in drafts
    ]


def create_message_drafts(db: Session, message_id: int, content: str) -> list[dict]:
    drafts: list[AiDraft] = []
    for block_index, match in enumerate(_DRAFT_BLOCK_RE.finditer(content)):
        payload = match.group(2).strip()
        try:
            json.loads(payload)
        except json.JSONDecodeError:
            continue
        drafts.append(AiDraft(message_id=message_id, fence=match.group(1), block_index=block_index, payload=payload, status="pending"))
    if drafts:
        db.add_all(drafts)
        db.commit()
        for draft in drafts:
            db.refresh(draft)
    return serialize_drafts(drafts)


def update_user_session(db: Session, current_user: User, session_id: int, title: str):
    session = ai_repository.get_session_by_id_and_user(db, session_id, current_user.id)
    if session:
        return ai_repository.update_session(db, session, title)
    return None


def update_message_content(db: Session, current_user: User, message_id: int, new_content: str):
    message = ai_repository.get_message_by_id(db, message_id)
    if not message:
        return None

    session = ai_repository.get_session_by_id_and_user(db, message.conversation_id, current_user.id)
    if not session:
        return None

    return ai_repository.update_message_content(db, message, new_content)


def delete_user_session(db: Session, current_user: User, session_id: int):
    session = ai_repository.get_session_by_id_and_user(db, session_id, current_user.id)
    if session:
        ai_repository.delete_messages_by_session(db, session_id)
        ai_repository.delete_session(db, session_id)
        return True
    return False
