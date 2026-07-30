from langchain_core.messages import AIMessage

from app.services.ai_services.state import AgentState


def out_of_scope_node(state: AgentState) -> dict:
    """
    Xử lý các câu hỏi nằm ngoài phạm vi quản lý dự án (Out of Scope).
    Trả về một tin nhắn từ chối lịch sự và kết thúc luồng.

    Args:
        state: Trạng thái hiện tại của đồ thị (AgentState).

    Returns:
        dict: Chứa tin nhắn từ chối.
    """
    msg = AIMessage(
        content="Xin lỗi, câu hỏi của bạn nằm ngoài phạm vi hỗ trợ của hệ thống Quản lý Dự án."
    )
    return {"messages": [msg]}
