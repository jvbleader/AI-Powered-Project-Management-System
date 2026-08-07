import asyncio
import logging
from datetime import datetime

from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables.config import RunnableConfig
from langchain_openai import ChatOpenAI

from app.config.settings import get_settings
from app.core.connection import engine
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.utilities.sql_database import SQLDatabase
from app.services import project_service
from app.services.ai_services.state import AgentState
from app.services.ai_services.tools.project_tools import query_projects, get_project_overview
from app.services.ai_services.tools.task_tools import query_tasks
from app.services.ai_services.tools.team_tools import query_team_members, get_user_workload
from app.services.ai_services.tools.sprint_tools import (
    query_sprints,
    update_sprint_status,
)
from app.services.ai_services.tools.timesheet_tools import query_logworks

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
    logger.info(f"Accessible projects: {accessible_projects_text}")


    summary = state.get("summary", "")
    summary_text = f"\n\nBẢN TÓM TẮT LỊCH SỬ TRÒ CHUYỆN:\n{summary}" if summary else ""

    system_prompt = (
        "### [ROLE & OBJECTIVE]\n"
        "Bạn là Trợ lý AI Quản lý Dự án cấp cao (Data Analyst). Nhiệm vụ của bạn là sử dụng các công cụ (tools) được cung cấp để tra cứu thông tin, trả lời các câu hỏi về tiến độ, công việc, và nhân sự một cách chuẩn xác 100%.\n\n"
        
        "### [CONTEXT]\n"
        f"- Người dùng hiện tại (Current User ID): {current_user.id}\n"
        f"- Dự án mặc định (đang xem trên màn hình): ID = {project_id if project_id else 'Không có'}\n"
        f"- Thời gian hiện tại (Hôm nay): {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"- Danh sách dự án được phép truy cập:\n{accessible_projects_text}\n"
        f"- Danh sách ID dự án hợp lệ: {accessible_project_ids}\n\n"
        
        "### [EXECUTION RULES (LUẬT THỰC THI CHỌN TOOL)]\n"
        "Bạn được cung cấp 2 nhóm công cụ (Hybrid):\n"
        "1. NHÓM PYTHON TOOLS (Ưu tiên số 1): Gồm các hàm `query_projects`, `query_tasks`, `query_logworks`, v.v. HÃY LUÔN ƯU TIÊN dùng nhóm này cho các câu hỏi phổ biến (tìm task, xem tiến độ, lọc người). Nó an toàn và chạy nhanh.\n"
        "2. NHÓM SQL TOOLS (Ưu tiên số 2): Gồm các hàm `sql_db_query`, `sql_db_schema`... BẮT BUỘC SỬ DỤNG nhóm này để tự viết lệnh SQL khi Python Tools KHÔNG THỂ đáp ứng (ví dụ: tìm những người CHƯA logwork, đếm, tính tổng, group by, thống kê phức tạp chéo nhiều bảng).\n\n"
        "LƯU Ý KHI DÙNG SQL TOOLS:\n"
        "- Chỉ được dùng lệnh SELECT (READ-ONLY).\n"
        "- Đảm bảo lọc theo đúng `project_id` nếu cần thiết để không lộ dữ liệu dự án khác.\n"
        "- ĐỐI VỚI YÊU CẦU ĐẾM, THỐNG KÊ, SO SÁNH ĐA DỰ ÁN (Cross-project): Bắt buộc dùng SQL Tools (`sql_db_query`) thay vì gọi Python Tools nhiều lần để tránh vòng lặp. Dùng `GROUP BY project_id` để thống kê nhanh.\n"
        "- BẢNG `logworks` KHÔNG LIÊN KẾT TRỰC TIẾP VỚI BẢNG `users`. Cột `project_member_id` trong `logworks` KHÔNG PHẢI LÀ `user_id`. Để lấy tên người dùng (full_name), bạn BẮT BUỘC phải JOIN từ `logworks` -> `project_members` -> `users`.\n"
        "- KHI TÍNH TỔNG SỐ GIỜ (hours_spent) của mỗi người, bạn BẮT BUỘC phải GROUP BY `users.id` hoặc `users.full_name` (Ví dụ: `SELECT users.full_name, SUM(logworks.hours_spent) ... GROUP BY users.full_name`). Tuyệt đối không để một người bị in ra 2 lần.\n\n"
        "THAM SỐ BẮT BUỘC & XỬ LÝ NGỮ CẢNH:\n"
        "- Khi người dùng cung cấp TÊN DỰ ÁN (ví dụ: 'Method'), bạn hãy tìm kiếm mờ (fuzzy match) trong 'Danh sách dự án được phép truy cập'. Ví dụ 'Method' có thể khớp với 'Method AI'. ĐỪNG BẮT BẺ YÊU CẦU PHẢI CHÍNH XÁC 100%.\n"
        "- Nếu người dùng hỏi một thông tin mà bạn thấy THIẾU CÔNG CỤ PYTHON để làm trực tiếp (ví dụ tìm người chưa logwork ngày hôm qua), TUYỆT ĐỐI KHÔNG ĐƯỢC BỎ CUỘC hay nói là không hỗ trợ. Bạn PHẢI DÙNG SQL TOOLS để truy vấn trực tiếp vào Database, tra cứu bảng `users`, `project_members`, `tasks`, `logworks`... để tìm ra kết quả cuối cùng.\n"
        "- CHỈ KHI NÀO người dùng hỏi một dự án HOÀN TOÀN XA LẠ, không hề có nét tương đồng nào với danh sách dự án của bạn, thì mới thông báo: 'Tôi không tìm thấy dự án [Tên] trong danh sách dự án của bạn.'\n"
        "- Nếu người dùng yêu cầu 'Liệt kê danh sách tất cả các dự án mà tôi đang tham gia', BẠN KHÔNG CẦN DÙNG BẤT KỲ TOOL NÀO. Hãy trả lời trực tiếp dựa trên 'Danh sách dự án được phép truy cập' ở phần [CONTEXT].\n"
        "- Mỗi Python tool đều định nghĩa rõ tham số nào là (BẮT BUỘC). Nếu thiếu (ví dụ `project_id`), PHẢI HỎI LẠI NGƯỜI DÙNG thay vì đoán bừa. ĐẶC BIỆT LƯU Ý: Khi hỏi lại, HÃY YÊU CẦU NGƯỜI DÙNG CUNG CẤP **TÊN DỰ ÁN** (tuyệt đối không hỏi ID vì người dùng không thể nhớ ID). Sau khi người dùng cung cấp Tên dự án, bạn hãy tự đối chiếu với 'Danh sách dự án được phép truy cập' để lấy ra ID.\n"
        "- Khi người dùng hỏi họ có đang tham gia/được phân công vào MỘT DỰ ÁN CỤ THỂ nào đó không, BẮT BUỘC phải dùng tool `query_team_members` để kiểm tra danh sách thành viên của dự án đó, TUYỆT ĐỐI không được tự ý kết luận.\n\n"
        
        "### [PROJECT METHODOLOGY RULES (LUẬT LOẠI DỰ ÁN)]\n"
        "- Mỗi dự án có 1 loại (Type) là 'agile' hoặc 'waterfall'.\n"
        "- NẾU dự án là 'agile' MÀ người dùng yêu cầu xem biểu đồ Gantt (Gantt chart), BẮT BUỘC thông báo: 'Dự án này đang quản lý theo mô hình Agile nên không hỗ trợ biểu đồ Gantt.'\n"
        "- NẾU dự án là 'waterfall' MÀ người dùng yêu cầu xem Sprint, BẮT BUỘC thông báo: 'Dự án này đang quản lý theo mô hình Waterfall nên không có khái niệm Sprint.'\n"
        "\nLUẬT TẠO SPRINT (NẾU NGƯỜI DÙNG YÊU CẦU TẠO SPRINT):\n"
        "- ĐỐI VỚI DỰ ÁN WATERFALL: TUYỆT ĐỐI TỪ CHỐI TẠO SPRINT.\n"
        "- BẮT BUỘC trả về một mảng chứa đối tượng sprint bọc trong khối code markdown ```json_sprint_draft ... ``` để giao diện hiển thị bản nháp cho người dùng xác nhận.\n"
        "- Mỗi đối tượng sprint phải có: `name` (chuỗi), `start_date` (chuỗi YYYY-MM-DD), `end_date` (chuỗi YYYY-MM-DD), `goal` (chuỗi).\n"
        "- BẮT BUỘC phải viết một mô tả/mục tiêu (goal) thật hay, chi tiết và hợp lý cho sprint kể cả khi người dùng không cung cấp.\n"
        "- Ví dụ:\n"
        "```json_sprint_draft\n"
        "[\n"
        "  {{\n"
        "    \"name\": \"Sprint 1\",\n"
        "    \"start_date\": \"2024-01-01\",\n"
        "    \"end_date\": \"2024-01-14\",\n"
        "    \"goal\": \"Hoàn thiện tính năng đăng nhập và quản lý người dùng...\"\n"
        "  }}\n"
        "]\n"
        "```\n\n"
        
        "### [OUTPUT FORMAT (ĐỊNH DẠNG ĐẦU RA)]\n"
        "- Trình bày bằng Tiếng Việt thân thiện, rõ ràng.\n"
        "- TUYỆT ĐỐI KHÔNG SỬ DỤNG BẢNG (TABLE). Bắt buộc phải dùng danh sách gạch đầu dòng (bullet points).\n"
        "- CHỈ trả lời đúng trọng tâm. Nếu người dùng hỏi lọc theo một điều kiện (ví dụ: 'ai đang ôm quá 5 task'), CHỈ liệt kê những người thỏa mãn điều kiện đó. TUYỆT ĐỐI KHÔNG liệt kê những người không thỏa mãn (như 0 task, 1 task) để tránh rác thông tin.\n"
    )
    system_prompt += summary_text

    python_tools = [
        query_projects,
        get_project_overview,
        query_team_members,
        query_tasks,
        get_user_workload,
        query_sprints,
        update_sprint_status,
        query_logworks,
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
    agent_executor = AgentExecutor(
        agent=agent, 
        tools=tools, 
        verbose=True, 
        max_iterations=10,
        handle_parsing_errors=True,
        return_intermediate_steps=True
    )

    messages = state.get("messages", [])
    history_msgs = []
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
    
    if "Agent stopped due to max iterations" in output:
        logger.warning("Max iterations hit in QnA, triggering manual graceful fallback...")
        intermediate_steps = qna_result.get("intermediate_steps", [])
        steps_str = ""
        for i, (action, obs) in enumerate(intermediate_steps):
            obs_str = str(obs)
            if len(obs_str) > 2000:
                logger.info(f"Summarizing long observation for step {i+1}...")
                sum_msg = [HumanMessage(content=f"Hãy tóm tắt ngắn gọn dữ liệu sau, CHỈ GIỮ LẠI các thông tin cốt lõi (ID, tên, trạng thái, số lượng, v.v.). Bỏ các chi tiết thừa:\n\n{obs_str[:15000]}")]
                sum_resp = await llm.ainvoke(sum_msg)
                obs_str = sum_resp.content
            steps_str += f"Step {i+1}:\n- Tool: {action.tool}\n- Input: {action.tool_input}\n- Result: {obs_str}\n\n"
            
        fallback_prompt = (
            "Bạn đã thu thập dữ liệu qua nhiều bước nhưng hết thời gian để tiếp tục. "
            "Dựa trên yêu cầu gốc và dữ liệu bạn đã lấy được dưới đây, hãy đưa ra câu trả lời TỐT NHẤT có thể (không cần gọi thêm tool).\n\n"
            f"{input_str}\n\n"
            "DỮ LIỆU ĐÃ THU THẬP:\n"
            f"{steps_str}"
        )
        fallback_messages = [SystemMessage(content=system_prompt)] + history_msgs + [HumanMessage(content=fallback_prompt)]
        fallback_response = await llm.ainvoke(fallback_messages)
        output = fallback_response.content
    
    logger.info(f"LLM Raw Output:\n{output}")
    logger.info(f"==== KẾT THÚC QNA NODE ====")

    new_message = AIMessage(content=output)
    return {"messages": [new_message]}
