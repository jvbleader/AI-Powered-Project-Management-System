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
    get_project_logworks,
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

async def qna_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node xử lý các câu hỏi dạng tra cứu thông tin (QnA) trong hệ thống AI-Powered Project Management.
    Sử dụng các Tool Python thay vì SQL thuần để đảm bảo an toàn.
    """
    db_session = config.get("configurable", {}).get("db")
    project_id = config.get("configurable", {}).get("project_id")
    current_user = config.get("configurable", {}).get("current_user")

    if not db_session or not current_user:
        raise ValueError("Missing db or current_user in config")
        
    projects, _, _ = await asyncio.to_thread(
        project_service.list_projects, db_session, current_user, page_size=1000
    )
    accessible_project_ids = [p.id for p in projects]
    accessible_projects_text = "\n".join([f"- {p.name} (ID: {p.id}, Type: {p.project_type})" for p in projects])

    summary = state.get("summary", "")
    summary_text = f"\n\nBẢN TÓM TẮT LỊCH SỬ TRÒ CHUYỆN:\n{summary}" if summary else ""

    system_prompt = (
        "### [ROLE & OBJECTIVE]\n"
        "Bạn là Trợ lý AI Quản lý Dự án cấp cao (Data Analyst). Nhiệm vụ của bạn là sử dụng các công cụ (tools) được cung cấp để tra cứu thông tin, trả lời các câu hỏi về tiến độ, công việc, và nhân sự một cách chuẩn xác 100%.\n\n"
        
        "### [CONTEXT]\n"
        f"- Người dùng hiện tại (Current User ID): {current_user.id}\n"
        f"- Dự án mặc định (đang xem trên màn hình): ID = {project_id if project_id else 'Không có'}\n"
        f"- Danh sách dự án được phép truy cập:\n{accessible_projects_text}\n"
        f"- Danh sách ID dự án hợp lệ: {accessible_project_ids}\n\n"
        
        "### [EXECUTION RULES (LUẬT THỰC THI CHỌN TOOL)]\n"
        "Bạn được cung cấp 2 nhóm công cụ (Hybrid):\n"
        "1. NHÓM PYTHON TOOLS (Ưu tiên số 1): Gồm các hàm `search_projects`, `get_project_tasks`, `get_task_logworks`, v.v. HÃY LUÔN ƯU TIÊN dùng nhóm này cho các câu hỏi phổ biến (tìm task, xem tiến độ, lọc người). Nó an toàn và chạy nhanh.\n"
        "2. NHÓM SQL TOOLS (Ưu tiên số 2): Gồm các hàm `sql_db_query`, `sql_db_schema`... CHỈ SỬ DỤNG nhóm này để TỰ VIẾT LỆNH SQL khi và chỉ khi người dùng hỏi các câu mang tính thống kê phức tạp (ví dụ: đếm, tính tổng, tính trung bình, group by) mà Python Tools không hỗ trợ.\n\n"
        "LƯU Ý KHI DÙNG SQL TOOLS:\n"
        "- Chỉ được dùng lệnh SELECT (READ-ONLY).\n"
        "- Đảm bảo lọc theo đúng `project_id` nếu cần thiết để không lộ dữ liệu dự án khác.\n\n"
        "THAM SỐ BẮT BUỘC & XỬ LÝ NGỮ CẢNH:\n"
        "- Khi người dùng cung cấp TÊN DỰ ÁN (ví dụ: 'Method'), bạn hãy tìm kiếm mờ (fuzzy match) trong 'Danh sách dự án được phép truy cập'. Ví dụ 'Method' có thể khớp với 'Method AI'. ĐỪNG BẮT BẺ YÊU CẦU PHẢI CHÍNH XÁC 100%.\n"
        "- Nếu người dùng hỏi thông tin về một dự án cụ thể NHƯNG dự án đó (hoặc tên gần giống) KHÔNG NẰM TRONG 'Danh sách dự án được phép truy cập', BẠN KHÔNG CẦN GỌI TOOL. Hãy từ chối khéo léo bằng cách thông báo: 'Dự án [Tên dự án] không tồn tại hoặc bạn không có quyền truy cập vào dự án này.' TUYỆT ĐỐI KHÔNG trả lời rằng 'câu hỏi nằm ngoài phạm vi hỗ trợ'.\n"
        "- Nếu người dùng yêu cầu 'Liệt kê danh sách tất cả các dự án mà tôi đang tham gia', BẠN KHÔNG CẦN DÙNG BẤT KỲ TOOL NÀO. Hãy trả lời trực tiếp dựa trên 'Danh sách dự án được phép truy cập' ở phần [CONTEXT].\n"
        "- Mỗi Python tool đều định nghĩa rõ tham số nào là (BẮT BUỘC). Nếu thiếu (ví dụ `project_id`), PHẢI HỎI LẠI NGƯỜI DÙNG thay vì đoán bừa. ĐẶC BIỆT LƯU Ý: Khi hỏi lại, HÃY YÊU CẦU NGƯỜI DÙNG CUNG CẤP **TÊN DỰ ÁN** (tuyệt đối không hỏi ID vì người dùng không thể nhớ ID). Sau khi người dùng cung cấp Tên dự án, bạn hãy tự đối chiếu với 'Danh sách dự án được phép truy cập' để lấy ra ID.\n"
        "- Khi người dùng hỏi họ có đang tham gia/được phân công vào MỘT DỰ ÁN CỤ THỂ nào đó không, BẮT BUỘC phải dùng tool `get_project_members` để kiểm tra danh sách thành viên của dự án đó, TUYỆT ĐỐI không được tự ý kết luận.\n\n"
        
        "### [PROJECT METHODOLOGY RULES (LUẬT LOẠI DỰ ÁN)]\n"
        "- Mỗi dự án có 1 loại (Type) là 'agile' hoặc 'waterfall'.\n"
        "- NẾU dự án là 'agile' MÀ người dùng yêu cầu xem biểu đồ Gantt (Gantt chart), BẮT BUỘC thông báo: 'Dự án này đang quản lý theo mô hình Agile nên không hỗ trợ biểu đồ Gantt.'\n"
        "- NẾU dự án là 'waterfall' MÀ người dùng yêu cầu xem Sprint, BẮT BUỘC thông báo: 'Dự án này đang quản lý theo mô hình Waterfall nên không có khái niệm Sprint.'\n\n"
        
        "### [OUTPUT FORMAT (ĐỊNH DẠNG ĐẦU RA)]\n"
        "- Trình bày bằng Tiếng Việt thân thiện, rõ ràng.\n"
        "- TUYỆT ĐỐI KHÔNG SỬ DỤNG BẢNG (TABLE). Bắt buộc phải dùng danh sách gạch đầu dòng (bullet points).\n"
        "- CHỈ trả lời đúng trọng tâm. Nếu người dùng hỏi lọc theo một điều kiện (ví dụ: 'ai đang ôm quá 5 task'), CHỈ liệt kê những người thỏa mãn điều kiện đó. TUYỆT ĐỐI KHÔNG liệt kê những người không thỏa mãn (như 0 task, 1 task) để tránh rác thông tin.\n"
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
        get_project_logworks,
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
            f"CÂU HỎI MỚI NHẤT:\n{latest_msg}"
        )
    else:
        latest_msg = messages[0].content if messages else ""
        input_str = f"CÂU HỎI MỚI NHẤT:\n{latest_msg}"

    logger.info(f"==== BẮT ĐẦU QNA NODE ====")
    logger.info(f"User Request: {latest_msg}")
    
    # Thực thi agent
    qna_result = await agent_executor.ainvoke({"input": input_str}, config=config)
    output = qna_result["output"]
    
    logger.info(f"LLM Raw Output:\n{output}")
    logger.info(f"==== KẾT THÚC QNA NODE ====")

    new_message = AIMessage(content=output)
    return {"messages": [new_message]}
