from typing import Literal
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from pydantic import BaseModel, Field
from langgraph.prebuilt import create_react_agent

from app.config.settings import get_settings
from app.services.ai_services.state import AgentState
from app.services.ai_services.tools.read_tools import (
    get_project_summary, 
    get_stalled_tasks, 
    get_overdue_tasks, 
    get_member_workload,
    get_my_tasks
)
from app.schemas.ai_schema import QuickResponseResponse, QuickResponseAction
from datetime import datetime

settings = get_settings()
llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.openai_api_key, temperature=0.1)

class RouterSchema(BaseModel):
    next_node: Literal["qna", "task", "out_of_scope"] = Field(
        description="The next node to route to. 'qna' for answering questions about the project, 'task' for delegating or creating tasks, 'out_of_scope' for irrelevant questions."
    )

def supervisor_node(state: AgentState) -> dict:
    """Xác định luồng xử lý: QnA hay Task Assignment"""
    messages = state["messages"]
    system_prompt = (
        "Bạn là Điều phối viên (Supervisor) cấp cao của hệ thống Quản lý dự án thông minh.\n"
        "Nhiệm vụ ĐỘC QUYỀN của bạn là phân tích ngữ nghĩa, ý định của người dùng và quyết định luồng xử lý chính xác nhất.\n\n"
        "HÃY PHÂN LOẠI DỰA TRÊN 3 NHÓM Ý ĐỊNH SAU:\n\n"
        "1. XEM & PHÂN TÍCH DỮ LIỆU (Router trả về: 'qna')\n"
        "   - Bao gồm các hành động: Tra cứu, thống kê, hỏi đáp, xin lời khuyên, xem báo cáo.\n"
        "   - Mục tiêu: Người dùng muốn biết thông tin có sẵn, chưa muốn thay đổi hệ thống.\n"
        "   - Dấu hiệu nhận biết: Các câu hỏi có từ khóa 'có những gì', 'còn bao nhiêu', 'ai rảnh', 'tiến độ', 'việc gì trước', 'tóm tắt'.\n\n"
        "2. THỰC THI HÀNH ĐỘNG MỚI (Router trả về: 'task')\n"
        "   - Bao gồm các hành động: Tạo công việc mới, phân công lại người phụ trách, chia nhỏ dự án.\n"
        "   - Mục tiêu: Người dùng yêu cầu hệ thống phải sinh ra hoặc thay đổi dữ liệu công việc thực tế.\n"
        "   - Dấu hiệu nhận biết: Động từ mang tính sai khiến mạnh: 'tạo giúp tôi', 'giao việc này cho', 'chia nhỏ task này', 'lên kế hoạch cho'.\n\n"
        "3. NGOÀI PHẠM VI (Router trả về: 'out_of_scope')\n"
        "   - Khi câu hỏi hoàn toàn không liên quan đến công việc, quản lý dự án, phần mềm (ví dụ: thời tiết, giải trí, chào hỏi vu vơ).\n\n"
        "LƯU Ý QUAN TRỌNG: Hãy suy luận dựa trên Ý ĐỊNH THỰC SỰ của câu. Ví dụ: Nếu người dùng hỏi 'Nên làm gì hôm nay?', đó là ý định TÌM LỜI KHUYÊN (qna), không phải là tạo task."
    )
    
    router_llm = llm.with_structured_output(RouterSchema)
    response = router_llm.invoke([SystemMessage(content=system_prompt)] + messages)
    return {"router_decision": response.next_node}


# --- QnA Agent ---
class QnAOutputSchema(BaseModel):
    title: str = Field(description="Tiêu đề ngắn gọn của câu trả lời")
    summary: str = Field(description="Câu trả lời chi tiết và súc tích")
    evidence: list[str] = Field(default_factory=list, description="Dẫn chứng cụ thể bằng số liệu hoặc ID")
    recommendations: list[str] = Field(default_factory=list, description="Đề xuất hành động")

def qna_node(state: AgentState, config: RunnableConfig) -> dict:
    """Agent chuyên hỏi đáp - Sử dụng Tool Calling đàng hoàng"""
    qna_tools = [get_project_summary, get_stalled_tasks, get_overdue_tasks, get_my_tasks]
    
    system_prompt = (
        "Bạn là trợ lý AI quản lý dự án xuất sắc.\n"
        "Hãy sử dụng các CÔNG CỤ (TOOLS) được cấp để truy vấn dữ liệu dự án (Tiến độ, Task đóng băng, Task trễ hạn) "
        "nhằm trả lời chính xác câu hỏi của người dùng. Tuyệt đối không bịa đặt số liệu.\n"
        "LƯU Ý QUAN TRỌNG: Hãy liệt kê TOÀN BỘ kết quả một cách ĐẦY ĐỦ, KHÔNG CẮT GIẢM (không chỉ lấy top 3 hay top 5)."
    )
    
    # 1. Khởi chạy ReAct Agent để tự suy luận và gọi Tool
    react_agent = create_react_agent(llm, tools=qna_tools, prompt=system_prompt)
    react_result = react_agent.invoke({"messages": state["messages"]}, config=config)
    
    # 2. Lấy câu trả lời cuối cùng của Agent (sau khi đã gọi tool xong)
    final_ai_msg = react_result["messages"][-1].content
    
    # 3. Format lại thành JSON chuẩn QuickResponseResponse
    formatter = llm.with_structured_output(QnAOutputSchema)
    formatted = formatter.invoke([
        SystemMessage(content="Định dạng lại văn bản sau thành JSON theo chuẩn hệ thống:"), 
        HumanMessage(content=final_ai_msg)
    ])
    
    final_resp = QuickResponseResponse(
        action=QuickResponseAction.GENERAL_QNA,
        title=formatted.title,
        summary=formatted.summary,
        evidence=formatted.evidence,
        recommendations=formatted.recommendations,
        generated_at=datetime.utcnow(),
        data_freshness_note="Dữ liệu được truy xuất tự động thông qua AI Tools."
    )
    return {"final_response": final_resp}

# --- Task Assignment Agent ---
class DraftTaskSchema(BaseModel):
    title: str
    description: str
    assignee_id: int
    priority: str

class TaskOutputSchema(BaseModel):
    title: str
    summary: str
    draft_tasks: list[DraftTaskSchema] = Field(description="Danh sách các task đề xuất tạo")

def task_node(state: AgentState, config: RunnableConfig) -> dict:
    """Agent chuyên chia task - Sử dụng Tool kiểm tra workload"""
    task_tools = [get_member_workload]
    
    system_prompt = (
        "Bạn là trợ lý giao việc (Task Delegation Agent).\n"
        "1. HÃY GỌI TOOL `get_member_workload` để xem ai đang rảnh rỗi và ai đang quá tải.\n"
        "2. Dựa vào yêu cầu người dùng, phân rã công việc thành các task nhỏ.\n"
        "3. Đề xuất giao task cho những người đang rảnh (hoặc theo chỉ định của người dùng).\n"
        "KHÔNG GIAO CHO NGƯỜI ĐANG QUÁ TẢI nếu không bắt buộc."
    )
    
    # 1. Agent tự suy nghĩ và gọi Tool kiểm tra nhân sự
    react_agent = create_react_agent(llm, tools=task_tools, prompt=system_prompt)
    react_result = react_agent.invoke({"messages": state["messages"]}, config=config)
    final_ai_msg = react_result["messages"][-1].content
    
    # 2. Format lại thành JSON Draft Proposal
    formatter = llm.with_structured_output(TaskOutputSchema)
    formatted = formatter.invoke([
        SystemMessage(content="Định dạng văn bản sau thành JSON, đảm bảo draft_tasks chứa danh sách task nháp:"),
        HumanMessage(content=final_ai_msg)
    ])
    
    final_resp = QuickResponseResponse(
        action=QuickResponseAction.TASK_ASSIGNMENT,
        title=formatted.title,
        summary=formatted.summary,
        generated_at=datetime.utcnow(),
        data_freshness_note="Bản nháp - CHỜ PHÊ DUYỆT (REQUIRES_CONFIRMATION)."
    )
    
    drafts = [d.dict() for d in formatted.draft_tasks]
    return {"final_response": final_resp, "draft_tasks": drafts}


# --- Out of Scope Node ---
def out_of_scope_node(state: AgentState) -> dict:
    """Xử lý triệt để các câu hỏi ngoài lề (Không gọi LLM)"""
    final_resp = QuickResponseResponse(
        action=QuickResponseAction.OUT_OF_SCOPE,
        title="Ngoài phạm vi hỗ trợ",
        summary="Hệ thống này không hỗ trợ trả lời câu hỏi này.",
        generated_at=datetime.utcnow(),
        data_freshness_note=""
    )
    return {"final_response": final_resp}

