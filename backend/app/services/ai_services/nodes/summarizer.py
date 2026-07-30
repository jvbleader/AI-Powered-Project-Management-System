from typing import Literal

from langchain_core.messages import HumanMessage, RemoveMessage
from langchain_openai import ChatOpenAI

from app.services.ai_services.state import AgentState

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_config(tags=["summarizer_llm"])


def summarizer_node(state: AgentState):
    summary = state.get("summary", "")
    messages = state["messages"]

    # Tìm HumanMessage cuối cùng (bắt đầu của lượt chat hiện tại)
    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].type == "human":
            last_human_idx = i
            break

    if last_human_idx <= 0:
        return {}  # Không có gì để tóm tắt hoặc chỉ có 1 lượt

    summary_prompt = (
        "Dưới đây là tóm tắt lịch sử cuộc hội thoại trước đó:\n"
        f"{summary}\n\n"
        "Và đây là các tin nhắn cũ:\n"
    )
    for m in messages[:last_human_idx]:
        if m.content:
            summary_prompt += f"{m.type}: {m.content}\n"

    summary_prompt += (
        "\nHãy tóm tắt ngắn gọn lại toàn bộ lịch sử này để làm ngữ cảnh cho AI trong các lượt chat tiếp theo. "
        "YÊU CẦU QUAN TRỌNG: Những thành phần nào (tên dự án, mã task, tên nhân sự, hoặc chủ đề cụ thể) "
        "được người dùng nhắc đến nhiều lần hoặc nhấn mạnh thì phải được giữ lại và ghi chú thật chi tiết (giữ nguyên ID, Tên gốc)."
    )

    response = llm.invoke([HumanMessage(content=summary_prompt)])

    # Xoá các tin nhắn cũ (chỉ giữ lại toàn bộ lượt chat hiện tại từ last_human_idx)
    delete_messages = [RemoveMessage(id=m.id) for m in messages[:last_human_idx]]

    return {"summary": response.content, "messages": delete_messages}


def should_summarize(state: AgentState) -> Literal["summarize_conversation", "__end__"]:
    """
    Xác định xem có cần tóm tắt lịch sử hội thoại hay không.
    Nếu lịch sử (messages) dài hơn 6 tin nhắn, luồng sẽ chuyển sang node summarizer.

    Args:
        state: Trạng thái hiện tại của đồ thị (AgentState).

    Returns:
        Literal["summarize_conversation", "__end__"]: Node tiếp theo.
    """
    messages = state["messages"]
    if len(messages) > 20:
        return "summarize_conversation"
    return "__end__"
