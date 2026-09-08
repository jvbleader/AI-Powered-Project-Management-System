from typing import Literal

from langchain_core.messages import HumanMessage, RemoveMessage
from langchain_openai import ChatOpenAI

from app.core.config import get_settings
from app.services.ai_services.intent_guards import RECENT_HISTORY_LIMIT
from app.services.ai_services.state import AgentState

settings = get_settings()
llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.openai_api_key, temperature=0).with_config(tags=["summarizer_llm"])


def summarizer_node(state: AgentState):
    summary = state.get("summary", "")
    messages = state["messages"]

    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].type == "human":
            last_human_idx = i
            break

    if last_human_idx <= 0:
        return {}

    # Giữ 20 tin gần nhất; chỉ tóm tắt phần cũ hơn. Không cắt giữa lượt hiện tại.
    keep_from = min(max(0, len(messages) - RECENT_HISTORY_LIMIT), last_human_idx)
    if keep_from <= 0:
        return {}

    stale = messages[:keep_from]
    summary_prompt = (
        "Dưới đây là tóm tắt lịch sử cuộc hội thoại trước đó:\n"
        f"{summary}\n\n"
        "Và đây là các tin nhắn cũ (đã vượt quá 20 tin gần nhất):\n"
    )
    for m in stale:
        if m.content:
            content = str(m.content)
            if len(content) > 800:
                content = content[:800] + "…"
            summary_prompt += f"{m.type}: {content}\n"

    summary_prompt += (
        "\nHãy tóm tắt NGẮN các thực thể (tên dự án, ID, nhân sự) để làm bối cảnh phụ. "
        "Đây chỉ là ngữ cảnh phụ (~15%) — KHÔNG viết lại câu trả lời cũ, KHÔNG chép checklist/bản nháp. "
        "Giữ nguyên ID và tên gốc."
    )

    response = llm.invoke([HumanMessage(content=summary_prompt)])
    delete_messages = [RemoveMessage(id=m.id) for m in stale if getattr(m, "id", None)]

    return {"summary": response.content, "messages": delete_messages}


def should_summarize(state: AgentState) -> Literal["summarize_conversation", "__end__"]:
    """
    Tóm tắt khi vượt quá 20 tin gần nhất. 20 tin mới nhất được giữ nguyên trong state.
    """
    messages = state["messages"]
    if len(messages) > RECENT_HISTORY_LIMIT:
        return "summarize_conversation"
    return "__end__"
