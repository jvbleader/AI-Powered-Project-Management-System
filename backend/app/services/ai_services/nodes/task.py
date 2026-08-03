import asyncio
import logging

from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables.config import RunnableConfig
from langchain_openai import ChatOpenAI

from app.config.settings import get_settings
from app.core.connection import engine
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.utilities.sql_database import SQLDatabase
from app.services import project_service
from app.services.ai_services.state import AgentState
from app.services.ai_services.tools.query_tools import (
    search_projects,
    get_project_details,
    get_project_members,
    get_project_tasks,
    get_task_details,
    get_user_workload,
    get_sprints,
    get_task_logworks,
)

logger = logging.getLogger("AI_AGENT")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - [%(levelname)s] - %(name)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

settings = get_settings()
llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.openai_api_key, temperature=0.1)

async def task_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node xử lý các yêu cầu liên quan đến tạo mới và phân công công việc (Task Assignment).
    Sử dụng Python Tools thay vì SQL thuần.
    """
    db_session = config.get("configurable", {}).get("db")
    project_id = config.get("configurable", {}).get("project_id")
    current_user = config.get("configurable", {}).get("current_user")

    if not db_session or not current_user:
        raise ValueError("Missing db or current_user in config")
        
    projects, _, _ = await asyncio.to_thread(
        project_service.list_projects, db_session, current_user, page_size=1000
    )
    accessible_projects_text = "\n".join([f"- {p.name} (ID: {p.id}, Type: {p.project_type})" for p in projects])

    summary = state.get("summary", "")
    summary_text = f"\n\nBẢN TÓM TẮT LỊCH SỬ TRÒ CHUYỆN:\n{summary}" if summary else ""

    system_prompt = (
        "Bạn là Trợ lý AI Giao việc (Task Delegation Agent) chuyên nghiệp.\n\n"
        "NHIỆM VỤ CỐT LÕI:\n"
        "- Phân tích yêu cầu của người dùng, phân rã dự án/tính năng thành các task nhỏ, cụ thể và khả thi.\n"
        "- BẮT BUỘC sử dụng công cụ (tools) để tra cứu thông tin (xem dự án có thành viên nào, khối lượng công việc ra sao).\n\n"
        "HƯỚNG DẪN CHỌN CÔNG CỤ (HYBRID):\n"
        "- NHÓM 1: PYTHON TOOLS (Ưu tiên): Luôn ưu tiên dùng các hàm như `get_project_members`, `get_user_workload`... vì an toàn và có sẵn.\n"
        "- NHÓM 2: SQL TOOLS (Chỉ dùng khi cần): Dùng `sql_db_query` để viết SQL thuần nếu Nhóm 1 không đáp ứng được yêu cầu thống kê phức tạp.\n\n"
        f"1. Người dùng hiện tại có ID là: {current_user.id}.\n"
        f"2. DỰ ÁN MẶC ĐỊNH (dự án người dùng đang xem trên màn hình): ID = {project_id if project_id else 'Không có'}.\n\n"
        "===========================================================\n"
        f"DANH SÁCH CÁC DỰ ÁN NGƯỜI DÙNG CÓ THỂ TRUY CẬP:\n{accessible_projects_text}\n"
        "===========================================================\n"
        "LUẬT DÙNG TOOL VÀ THAM SỐ BẮT BUỘC:\n"
        "- Mỗi tool đều định nghĩa rõ tham số nào là (BẮT BUỘC). Nếu thiếu tham số bắt buộc (ví dụ `project_id`, `user_id`), BẠN KHÔNG ĐƯỢC ĐOÁN MÒ.\n"
        "- ĐỐI VỚI PROJECT_ID: Hãy ưu tiên sử dụng `project_id` của dự án đang được nhắc đến trong ngữ cảnh cuộc hội thoại (ví dụ: câu trước đang xử lý dự án Method AI thì tiếp tục dùng ID của Method AI). CHỈ sử dụng DỰ ÁN MẶC ĐỊNH nếu từ đầu đến cuối người dùng chưa từng nhắc đến dự án nào cụ thể.\n\n"
        "### [PROJECT METHODOLOGY RULES (LUẬT LOẠI DỰ ÁN)]\n"
        "- Mỗi dự án có 1 loại (Type) là 'agile' hoặc 'waterfall'.\n"
        "- NẾU dự án là 'agile' MÀ người dùng yêu cầu xem biểu đồ Gantt (Gantt chart), BẮT BUỘC thông báo: 'Dự án này đang quản lý theo mô hình Agile nên không hỗ trợ biểu đồ Gantt.'\n"
        "- NẾU dự án là 'waterfall' MÀ người dùng yêu cầu tạo/xem Sprint, BẮT BUỘC thông báo: 'Dự án này đang quản lý theo mô hình Waterfall nên không có khái niệm Sprint.'\n\n"
        "### [QUY TẮC ĐÁNH GIÁ KÍCH THƯỚC TASK VÀ PHÂN RÃ (BREAKDOWN)]\n"
        "Khi người dùng yêu cầu tạo/giao một công việc, bạn PHẢI tự động đánh giá mức độ phức tạp của nó:\n"
        "1. TASK NHỎ (Đơn lẻ): Là công việc cụ thể, làm trong thời gian ngắn (1-2 ngày), thường chỉ cần 1 người (VD: 'Sửa lỗi nút đăng nhập', 'Viết API lấy user').\n"
        "   -> HÀNH ĐỘNG: KHÔNG phân rã. Giữ nguyên 1 task, bổ sung mô tả, tìm đúng 1 người để gán.\n"
        "2. TASK TO (Epic/Feature/Chiến dịch): Là công việc tổng quát, đòi hỏi nhiều bước, phối hợp nhiều role (VD: 'Làm chức năng thanh toán', 'Tích hợp AI', 'Marketing tháng 8').\n"
        "   -> HÀNH ĐỘNG: BẮT BUỘC PHÂN RÃ (Break down). Tạo ĐÚNG MỘT Task Cha (Epic/Chiến dịch) ở ngoài cùng, và ĐƯA TẤT CẢ các task nhỏ vừa phân rã vào trong mảng `subtasks` của Task Cha đó (Tạo thành cấu trúc cây).\n\n"
        "QUY TRÌNH TẠO TASK BẰNG LỆNH JSON_TASK_DRAFT:\n"
        "Bước 1: Đánh giá task to hay nhỏ, xác định Project Type bằng cách gọi tool.\n"
        "Bước 2: Tìm `user_id` của những người được giao thông qua tool `get_project_members` và `get_user_workload`. Gán task cho người phù hợp và rảnh rỗi.\n"
        "Bước 3: LẬP LUẬN GIAO VIỆC VÀ TẠO BẢN NHÁP.\n"
        "   - Bạn ĐƯỢC PHÉP viết 1-2 câu giải thích lý do tại sao lại giao task cho người đó (Ví dụ: 'Người phù hợp nhất là X vì đang trống việc...').\n"
        "   - TUYỆT ĐỐI KHÔNG ĐƯỢC lặp lại các thông tin mô tả chi tiết của task (như: Tiêu đề là gì, Mô tả ra sao, Độ ưu tiên thế nào). Những thứ đó sẽ nằm HẾT trong bản nháp JSON.\n"
        "   - Cuối cùng, trả về ĐÚNG MỘT khối Markdown chứa mã JSON định dạng `json_task_draft`.\n"
        "VÍ DỤ VỀ CẤU TRÚC JSON:\n"
        "```json_task_draft\n"
        "[\n"
        "  {{\n"
        "    \"title\": \"Epic/Task Cha\",\n"
        "    \"description\": \"...\",\n"
        "    \"priority\": \"high\",\n"
        "    \"assignee_id\": 123,\n"
        "    \"assignee_name\": \"...\",\n"
        "    \"project_id\": 10,\n"
        "    \"type\": \"task\",\n"
        "    \"estimated_hours\": 24,\n"
        "    \"subtasks\": [ \n"
        "       {{ \n"
        "         \"title\": \"Subtask 1 (Cần chia nhỏ)\", \n"
        "         \"description\": \"...\", \n"
        "         \"assignee_id\": 456, \n"
        "         \"assignee_name\": \"...\", \n"
        "         \"priority\": \"medium\", \n"
        "         \"estimated_hours\": 16,\n"
        "         \"subtasks\": [\n"
        "            {{ \"title\": \"Sub-subtask 1.1\", \"description\": \"...\", \"estimated_hours\": 8 }},\n"
        "            {{ \"title\": \"Sub-subtask 1.2\", \"description\": \"...\", \"estimated_hours\": 8 }}\n"
        "         ]\n"
        "       }},\n"
        "       {{ \"title\": \"Subtask 2 (Task lá)\", \"description\": \"...\", \"assignee_id\": 789, \"assignee_name\": \"...\", \"priority\": \"low\", \"estimated_hours\": 8 }}\n"
        "    ]\n"
        "  }}\n"
        "]\n"
        "```\n\n"
        "LUẬT TẠO DESCRIPTION (CỰC KỲ QUAN TRỌNG):\n"
        "- Nếu người dùng không cung cấp mô tả công việc (description) cụ thể hoặc cung cấp quá ngắn, bạn PHẢI tự động suy luận phân tích từ tiêu đề (title) và viết ra một mô tả chi tiết, chuyên nghiệp. Nội dung mô tả (description) tự sinh nên bao gồm các bước cần làm, yêu cầu đầu ra, hoặc Acceptance Criteria để task trở nên rõ ràng đối với người được giao.\n"
        "- KHÔNG ĐƯỢC ĐỂ TRỐNG description.\n\n"
        "LUẬT ƯỚC TÍNH THỜI GIAN VÀ BẺ NHỎ TASK (CỰC KỲ QUAN TRỌNG):\n"
        "- BẮT BUỘC cung cấp thuộc tính `estimated_hours` (kiểu số) cho TẤT CẢ task lớn nhỏ ở mọi cấp độ.\n"
        "- QUY TẮC 8 GIỜ CHO TASK LÁ (LEAF TASKS): Bất kỳ task nào KHÔNG CÓ subtasks bên trong (gọi là task lá, task dưới cùng) thì TUYỆT ĐỐI KHÔNG ĐƯỢC có `estimated_hours` > 8. Trái lại, các Task Cha hoặc Task Con có chứa subtasks (Task cháu) thì `estimated_hours` của chúng là TỔNG của các con/cháu bên trong nên hoàn toàn được phép > 8 tiếng.\n"
        "- Nếu một công việc cụ thể (không thể chia thêm) ước lượng mất > 8 tiếng (VD: Code Frontend mất 40h), BẠN BẮT BUỘC PHẢI CHẺ NHỎ nó thành nhiều phần (VD: Phần 1, Phần 2, Phần 3... và đẩy vào mảng `subtasks`) sao cho MỖI PHẦN NHỎ NHẤT ĐÓ KHÔNG QUÁ 8 TIẾNG.\n"
        "- LƯU Ý: Nếu bạn sinh ra một task lá cuối cùng (không có subtasks) mà thời gian 16h hoặc 40h, bạn sẽ bị phạt nặng.\n"
    )
    system_prompt += summary_text

    python_tools = [
        search_projects,
        get_project_details,
        get_project_members,
        get_project_tasks,
        get_task_details,
        get_user_workload,
        get_sprints,
        get_task_logworks,
    ]
    
    sql_db = SQLDatabase(
        engine, 
        include_tables=[
            "users", "roles", "departments", "projects", 
            "project_members", "tasks", "task_assignees", 
            "sprints", "logworks"
        ]
    )
    toolkit = SQLDatabaseToolkit(db=sql_db, llm=llm)
    sql_tools = toolkit.get_tools()
    
    tools = python_tools + sql_tools
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}")
    ])
    
    agent = create_tool_calling_agent(llm, tools, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=False)
    
    messages = state.get("messages", [])
    if len(messages) > 1:
        history_msgs = messages[:-1]
        latest_msg = messages[-1].content
        chat_history_str = "\n".join([f"{'User' if m.type == 'human' else 'AI'}: {m.content}" for m in history_msgs])
        input_str = (
            f"LỊCH SỬ TRÒ CHUYỆN:\n{chat_history_str}\n\n"
            f"YÊU CẦU MỚI NHẤT:\n{latest_msg}"
        )
    else:
        latest_msg = messages[0].content if messages else ""
        input_str = f"YÊU CẦU MỚI NHẤT:\n{latest_msg}"

    logger.info(f"==== BẮT ĐẦU TASK NODE ====")
    logger.info(f"User Request: {latest_msg}")
    
    # Thực thi agent
    task_result = await agent_executor.ainvoke({"input": input_str}, config=config)
    output = task_result["output"]
    
    logger.info(f"LLM Raw Output:\n{output}")
    logger.info(f"==== KẾT THÚC TASK NODE ====")

    new_message = AIMessage(content=output)
    return {"messages": [new_message]}