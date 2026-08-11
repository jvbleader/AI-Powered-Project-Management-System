from typing import Literal

from langgraph.checkpoint.redis import AsyncRedisSaver
from langgraph.graph import END, START, StateGraph

from app.core.config import get_settings
from app.services.ai_services.nodes import (
    out_of_scope_node,
    qna_node,
    should_summarize,
    summarizer_node,
    supervisor_node,
    task_node,
)
from app.services.ai_services.state import AgentState


def route_from_supervisor(
    state: AgentState,
) -> Literal["task_agent", "qna_agent", "out_of_scope_agent"]:
    """
    Xác định node tiếp theo sẽ được thực thi dựa trên quyết định của supervisor.

    Args:
        state: Trạng thái hiện tại của đồ thị (AgentState).

    Returns:
        Literal["task_agent", "qna_agent", "out_of_scope_agent"]: Tên của node tiếp theo.
    """
    decision = state.get("router_decision", "qna")
    if decision == "task":
        return "task_agent"
    elif decision == "qna":
        return "qna_agent"
    else:
        # Out of scope -> Reject directly
        return "out_of_scope_agent"


builder = StateGraph(AgentState)

builder.add_node("supervisor", supervisor_node)
builder.add_node("qna_agent", qna_node)
builder.add_node("task_agent", task_node)
builder.add_node("out_of_scope_agent", out_of_scope_node)
builder.add_node("summarize_conversation", summarizer_node)

builder.add_edge(START, "supervisor")

builder.add_conditional_edges(
    "supervisor",
    route_from_supervisor,
    {
        "qna_agent": "qna_agent",
        "task_agent": "task_agent",
        "out_of_scope_agent": "out_of_scope_agent",
    },
)

# Route to summarizer if conversation is too long
builder.add_conditional_edges("qna_agent", should_summarize)
builder.add_conditional_edges("task_agent", should_summarize)

builder.add_edge("out_of_scope_agent", END)
builder.add_edge("summarize_conversation", END)

settings = get_settings()
redis_url = f"redis://{settings.redis_host}:{settings.redis_port}/0"

# Cấu hình Redis Checkpointer
redis_saver = AsyncRedisSaver(redis_url)
project_graph = builder.compile(checkpointer=redis_saver)
