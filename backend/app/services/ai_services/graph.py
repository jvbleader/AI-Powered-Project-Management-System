from langgraph.graph import StateGraph, START, END
from app.services.ai_services.state import AgentState
from app.services.ai_services.agents import supervisor_node, qna_node, task_node, out_of_scope_node

def route_from_supervisor(state: AgentState):
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

builder.add_edge(START, "supervisor")

builder.add_conditional_edges(
    "supervisor",
    route_from_supervisor,
    {
        "qna_agent": "qna_agent",
        "task_agent": "task_agent",
        "out_of_scope_agent": "out_of_scope_agent"
    }
)

builder.add_edge("qna_agent", END)
builder.add_edge("task_agent", END)
builder.add_edge("out_of_scope_agent", END)

# Cấu hình checkpointer nếu cần thiết sau này
project_graph = builder.compile()