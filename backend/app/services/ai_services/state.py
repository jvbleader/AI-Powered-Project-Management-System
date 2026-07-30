from typing import Annotated, Any, Dict, List, Optional, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    # Dùng list[BaseMessage] để lưu trữ lịch sử chat/tool calls
    messages: Annotated[list[BaseMessage], add_messages]

    # Tóm tắt hội thoại cũ (để tránh phình to context)
    summary: str

    # Thông tin cơ bản
    user_id: int
    project_id: Optional[int]

    # Dành cho Task Agent (HITL)
    # Danh sách task được draft để user xác nhận
    draft_tasks: Optional[List[Dict[str, Any]]]

    # Biến để lưu trữ phản hồi cuối cùng và quyết định router
    final_response: Optional[Any]
    router_decision: Optional[str]
