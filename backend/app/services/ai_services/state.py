from typing import Annotated, Any, Optional, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    summary: str
    user_id: int
    project_id: Optional[int]
    final_response: Optional[Any]
    router_decision: Optional[str]
