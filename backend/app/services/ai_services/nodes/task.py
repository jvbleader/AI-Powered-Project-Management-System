import asyncio
import logging
import json
import re
from datetime import datetime

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
from app.services.ai_services.tools.project_tools import query_projects, get_project_overview
from app.services.ai_services.tools.task_tools import query_tasks
from app.services.ai_services.tools.team_tools import query_team_members, get_user_workload
from app.services.ai_services.tools.timesheet_tools import query_logworks
from app.services.ai_services.tools.sprint_tools import (
    query_sprints,
    update_sprint_status,
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
    project_type_map = {p.id: p.project_type.lower() for p in projects}

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
        f"2. DỰ ÁN MẶC ĐỊNH (dự án người dùng đang xem trên màn hình): ID = {project_id if project_id else 'Không có'}.\n"
        f"3. THỜI GIAN HIỆN TẠI (Hôm nay): {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}.\n\n"
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
        "Khi người dùng yêu cầu tạo/giao một công việc lớn, cách phân rã (breakdown) sẽ phụ thuộc vào LOẠI DỰ ÁN (Agile hay Waterfall):\n"
        "- NẾU DỰ ÁN LÀ WATERFALL (WBS): BẮT BUỘC PHÂN RÃ THÀNH CẤU TRÚC CÂY. Tạo ĐÚNG MỘT Task Cha ở ngoài cùng, và ĐƯA TẤT CẢ các task nhỏ vừa phân rã vào trong mảng `subtasks` của Task Cha đó.\n"
        "- NẾU DỰ ÁN LÀ AGILE: KHÔNG ĐƯỢC DÙNG CẤU TRÚC CÂY (Không dùng `subtasks`). Mọi task sau khi phân rã phải là một danh sách phẳng (flat list) gồm các task độc lập, ngang hàng nhau (như User Story/Task trong Backlog).\n\n"
        "QUY TRÌNH TẠO TASK BẰNG LỆNH JSON_TASK_DRAFT:\n"
        "Bước 1: Đánh giá task to hay nhỏ, xác định Project Type bằng cách gọi tool.\n"
        "Bước 2: Phân công người phụ trách (assignee) dựa theo LOẠI DỰ ÁN và yêu cầu:\n"
        "   - NẾU DỰ ÁN LÀ AGILE: MẶC ĐỊNH KHÔNG GÁN CHO AI (để null `assignee_id` và `assignee_name`) nếu người dùng không yêu cầu đích danh. CHỈ GÁN khi người dùng CHỈ ĐỊNH ĐÍCH DANH ai làm.\n"
        "   - NẾU DỰ ÁN LÀ WATERFALL: LUÔN LUÔN PHẢI GÁN cho 1 người. Nếu người dùng không chỉ định, hãy tự chọn 1 người phù hợp nhất (ưu tiên người dùng hiện tại hoặc người đang rảnh việc) để gán.\n"
        "   - Để tìm người, dùng tool `query_team_members` và `get_user_workload`.\n"
        "   - LƯU Ý TRÙNG TÊN: Nếu người dùng yêu cầu giao task cho một người cụ thể bằng tên (VD: 'giao cho Anh'), nhưng tool `query_team_members` trả về NHIỀU người có tên giống hoặc gần giống nhau, BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý CHỌN ĐẠI. Bạn PHẢI dừng việc tạo task và HỎI LẠI người dùng để họ chọn chính xác. Hãy liệt kê danh sách những người trùng tên kèm theo vai trò (role) để người dùng dễ phân biệt.\n"
        "Bước 3: LẬP LUẬN GIAO VIỆC VÀ TẠO BẢN NHÁP.\n"
        "   - Bạn ĐƯỢC PHÉP viết 1-2 câu giải thích lý do tại sao lại giao task cho người đó (Ví dụ: 'Người phù hợp nhất là X vì đang trống việc...').\n"
        "   - Cuối cùng, TRONG CÙNG MỘT CÂU TRẢ LỜI, BẮT BUỘC trả về ĐÚNG MỘT khối Markdown chứa mã JSON định dạng `json_task_draft`.\n"
        "   - ⛔ LỆNH CẤM: TUYỆT ĐỐI KHÔNG ĐƯỢC nói kiểu 'Bây giờ tôi sẽ tạo bản nháp' rồi kết thúc câu trả lời mà không có JSON. BẮT BUỘC PHẢI CHỨA JSON TRONG MỌI TRƯỜNG HỢP.\n"
        "VÍ DỤ VỀ CẤU TRÚC JSON:\n"
        "```json_task_draft\n"
        "[\n"
        "  {{\n"
        "    \"title\": \"Epic/Task Cha\",\n"
        "    \"description\": {{\n"
        "      \"objective\": \"(Mục tiêu task)\",\n"
        "      \"criteria\": \"(Tiêu chí/Điều kiện)\",\n"
        "      \"implementation\": \"(Cách làm/Hướng dẫn)\",\n"
        "      \"output\": \"(Kết quả đầu ra)\",\n"
        "      \"acceptance_criteria\": \"(Tiêu chí chấp nhận)\"\n"
        "    }},\n"
        "    \"priority\": \"high\",\n"
        "    \"assignee_id\": 123,\n"
        "    \"assignee_name\": \"...\",\n"
        "    \"project_id\": 10,\n"
        "    \"type\": \"task\",\n"
        "    \"estimated_hours\": 24,\n"
        "    \"start_date\": \"YYYY-MM-DD\",\n"
        "    \"deadline\": \"YYYY-MM-DD\",\n"
        "    \"subtasks\": [ \n"
        "       {{ \n"
        "         \"title\": \"Subtask 1 (Cần chia nhỏ)\", \n"
        "         \"description\": {{ ... }}, \n"
        "         \"assignee_id\": 456, \n"
        "         \"assignee_name\": \"...\", \n"
        "         \"priority\": \"medium\", \n"
        "         \"estimated_hours\": 16,\n"
        "         \"subtasks\": [\n"
        "            {{ \"title\": \"Sub-subtask 1.1\", \"description\": {{ ... }}, \"estimated_hours\": 8 }},\n"
        "            {{ \"title\": \"Sub-subtask 1.2\", \"description\": {{ ... }}, \"estimated_hours\": 8 }}\n"
        "         ]\n"
        "       }},\n"
        "       {{ \"title\": \"Subtask 2 (Task lá)\", \"description\": {{ ... }}, \"assignee_id\": 789, \"assignee_name\": \"...\", \"priority\": \"low\", \"estimated_hours\": 8 }}\n"
        "    ]\n"
        "  }}\n"
        "]\n"
        "```\n\n"
        "LUẬT TẠO TIÊU ĐỀ VÀ MÔ TẢ (CỰC KỲ QUAN TRỌNG - NẾU VI PHẠM SẼ BỊ PHẠT):\n"
        "- TUYỆT ĐỐI KHÔNG sinh ra các Task mang tính chất chung chung, lý thuyết vòng đời (VD: 'Kiểm tra tính năng', 'Xử lý lỗi', 'Phát triển chức năng', 'Phân tích yêu cầu').\n"
        "- BẮT BUỘC PHẢI CHIA NHỎ THEO CÁC CHỨC NĂNG NGHIỆP VỤ (Functional Breakdown) sát với thực tế, nhưng KHÔNG ĐƯỢC vụn vặt đến mức độ tạo nút bấm hay làm từng cái API lẻ tẻ.\n"
        "- TIÊU ĐỀ TASK PHẢI LÀ MỘT CHỨC NĂNG ĐỘC LẬP HOÀN CHỈNH, RÕ RÀNG VÀ CHUYÊN NGHIỆP.\n"
        "  + SAI (Quá chung chung): 'Tích hợp API thanh toán Momo'.\n"
        "  + SAI (Quá vụn vặt): 'Tạo UI nút bấm [Thanh toán]', 'Tạo bảng Database transactions'.\n"
        "  + ĐÚNG (Chuẩn Functional Feature): 'Xây dựng luồng tạo mã QR thanh toán Momo', 'Phát triển luồng xử lý Webhook/IPN cập nhật trạng thái đơn hàng'.\n"
        "- ĐỐI VỚI CHI TIẾT TASK (DESCRIPTION): Yêu cầu BẮT BUỘC phải viết CỰC KỲ CẨN THẬN, TỈ MỈ, CHỈN CHU VÀ BÁM SÁT VÀO NHIỆM VỤ CHÍNH. Tuyệt đối không viết hời hợt vài chữ. Phải đặt mình vào vị trí một Tech Lead/Product Manager đang giao việc cho Developer.\n"
        "- BẮT BUỘC trả về description DƯỚI DẠNG OBJECT JSON chứa đúng 5 key sau:\n"
        "  + `objective`: Mục tiêu cốt lõi của task này là gì? Trả lời chính xác giá trị nghiệp vụ/kỹ thuật mang lại.\n"
        "  + `criteria`: Các ràng buộc khắt khe, điều kiện tiên quyết, edge cases (trường hợp biên) cần xử lý.\n"
        "  + `implementation`: Hướng dẫn kỹ thuật chi tiết, logic flow, các bước thực hiện cụ thể, thư viện/công cụ gợi ý.\n"
        "  + `output`: Kết quả đầu ra rõ ràng, có thể đo lường và bàn giao được (ví dụ: API endpoint, UI component, Schema DB).\n"
        "  + `acceptance_criteria`: Danh sách các gạch đầu dòng chi tiết về điều kiện nghiệm thu (Definition of Done) để QA có thể test.\n\n"
        "LUẬT ƯỚC TÍNH THỜI GIAN, NGÀY THÁNG VÀ BẺ NHỎ TASK (CỰC KỲ QUAN TRỌNG):\n"
        "- BẮT BUỘC cung cấp thuộc tính `estimated_hours` (kiểu số) cho TẤT CẢ task lớn nhỏ ở mọi cấp độ.\n"
        "- BẮT BUỘC cung cấp thuộc tính `start_date` và `deadline` (định dạng YYYY-MM-DD) cho TẤT CẢ task lớn nhỏ ở mọi cấp độ.\n"
        "- ĐỐI VỚI DỰ ÁN WATERFALL (TREE TASK): `start_date` của task cha PHẢI LÀ ngày bắt đầu sớm nhất của các task con, và `deadline` của task cha PHẢI LÀ ngày kết thúc muộn nhất của các task con.\n"
        "- QUY TẮC ĐÁNH GIÁ THỰC TẾ (ET HỢP LÝ): Ước lượng thời gian (ET) phải CỰC KỲ SÁT VỚI THỰC TẾ dựa trên kinh nghiệm phát triển phần mềm! Đừng mặc định gán task nào cũng 8 tiếng. Hãy phân loại thực tế: Task Dễ (1-2 tiếng), Task Trung Bình (3-5 tiếng), Task Khó (6-8 tiếng).\n"
        "- ĐỐI VỚI WATERFALL: Không bắt buộc chỉ chia 2 cấp (Cha - Con). Nếu một task cực kỳ phức tạp (VD: Xây dựng hệ thống 80h), bạn HOÀN TOÀN CÓ THỂ CHIA THÀNH NHIỀU CẤP ĐỘ SÂU (Epic Cha -> Task Con -> Subtask Cháu -> ...) tuỳ ý sao cho hợp lý nhất.\n"
        "- ⛔ LỆNH CẤM TUYỆT ĐỐI VỚI TASK LÁ (NGƯỜI THỰC THI TRỰC TIẾP): KHÔNG BAO GIỜ ĐƯỢC VƯỢT QUÁ 8 TIẾNG! \n"
        "- Nếu bạn thấy một công việc cần 10h, 12h hay 40h để hoàn thành, BẠN BẮT BUỘC PHẢI CHẺ NHỎ nó ra. \n"
        "   + Nếu là Waterfall: Chẻ thành các `subtasks` con, cháu. Task Cha có ET là TỔNG của các con nên ĐƯỢC PHÉP > 8 tiếng, nhưng nhánh lá dưới cùng phải <= 8.\n"
        "   + Nếu là Agile: Chẻ thành các task độc lập ngang hàng, mỗi task <= 8 tiếng.\n"
        "\nLUẬT TẠO SPRINT (NẾU NGƯỜI DÙNG YÊU CẦU TẠO SPRINT):\n"
        "- ĐỐI VỚI DỰ ÁN WATERFALL: TUYỆT ĐỐI TỪ CHỐI TẠO SPRINT.\n"
        "- NẾU DỰ ÁN ĐANG CÓ SPRINT HOẠT ĐỘNG (ACTIVE): BẠN VẪN ĐƯỢC PHÉP TẠO THÊM SPRINT MỚI (trạng thái tương lai/planning). TUYỆT ĐỐI KHÔNG TỪ CHỐI TẠO SPRINT với lý do dự án đang có sprint hoạt động.\n"
        "- BẮT BUỘC trả về một mảng chứa đối tượng sprint bọc trong khối code markdown ```json_sprint_draft ... ``` để giao diện hiển thị bản nháp cho người dùng xác nhận.\n"
        "- Mỗi đối tượng sprint phải có: `project_id` (số), `name` (chuỗi), `start_date` (chuỗi YYYY-MM-DD), `end_date` (chuỗi YYYY-MM-DD), `goal` (chuỗi).\n"
        "- BẮT BUỘC phải viết một mô tả/mục tiêu (goal) thật hay, chi tiết và hợp lý cho sprint kể cả khi người dùng không cung cấp.\n"
        "- Ví dụ:\n"
        "```json_sprint_draft\n"
        "[\n"
        "  {{\n"
        "    \"project_id\": 10,\n"
        "    \"name\": \"Sprint 1\",\n"
        "    \"start_date\": \"2024-01-01\",\n"
        "    \"end_date\": \"2024-01-14\",\n"
        "    \"goal\": \"Hoàn thiện tính năng đăng nhập và quản lý người dùng...\"\n"
        "  }}\n"
        "]\n"
        "```\n\n"
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
        max_iterations=20, 
        handle_parsing_errors=True,
        return_intermediate_steps=True
    )
    
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

    input_str += (
        "\n\n[!!! CẢNH BÁO QUAN TRỌNG TỪ HỆ THỐNG !!!]\n"
        "1. KHÔNG ĐƯỢC BẮT CHƯỚC CẤU TRÚC PHÂN RÃ (CÂY HAY PHẲNG) TỪ LỊCH SỬ TRÒ CHUYỆN NẾU CHÚNG KHÁC LOẠI DỰ ÁN CỦA YÊU CẦU MỚI!\n"
        "2. TUÂN THỦ NGHIÊM NGẶT THEO DỰ ÁN MỚI NHẤT:\n"
        "   - Nếu Agile: BẮT BUỘC phân rã thành DANH SÁCH PHẲNG ngang hàng (KHÔNG dùng mảng subtasks).\n"
        "   - Nếu Waterfall: BẮT BUỘC phân rã thành CẤU TRÚC CÂY (Dùng mảng subtasks).\n"
        "3. LỆNH CẤM: BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC LIỆT KÊ/GIẢI THÍCH DẠNG DANH SÁCH BULLET HOẶC VĂN BẢN (VD: 1. Phân tích... 1.1. Nghiên cứu...). HÃY TRẢ VỀ TRỰC TIẾP KHỐI MARKDOWN CHỨA MÃ JSON LUÔN."
    )

    logger.info(f"==== BẮT ĐẦU TASK NODE ====")
    logger.info(f"User Request: {latest_msg}")
    
    async def check_and_rebreak_tasks_with_llm(output_str: str) -> str:
        output_str = re.sub(r'([^\n])\s*```json_task_draft', r'\1\n\n```json_task_draft', output_str)
        output_str = re.sub(r'([^\n])\s*```json_sprint_draft', r'\1\n\n```json_sprint_draft', output_str)
        match = re.search(r'```json_task_draft\s*(.*?)\s*```', output_str, re.DOTALL)
        if not match:
            return output_str
        
        json_str = match.group(1)
        try:
            tasks = json.loads(json_str)
            if isinstance(tasks, dict):
                if "tasks" in tasks and isinstance(tasks["tasks"], list):
                    tasks = tasks["tasks"]
                else:
                    tasks = [tasks]
            if not isinstance(tasks, list):
                tasks = []
        except Exception:
            return output_str
            
        def format_descriptions(task_list):
            for t in task_list:
                desc = t.get("description")
                if isinstance(desc, dict):
                    formatted_desc = []
                    
                    def format_value(val):
                        if isinstance(val, list):
                            return "\n" + "\n".join(f"- {str(item).strip()}" for item in val)
                        return str(val).strip()

                    if "objective" in desc:
                        formatted_desc.append(f"**1. Mục tiêu task:** {format_value(desc['objective'])}")
                    if "criteria" in desc:
                        formatted_desc.append(f"**2. Tiêu chí:** {format_value(desc['criteria'])}")
                    if "implementation" in desc:
                        formatted_desc.append(f"**3. Cách làm:** {format_value(desc['implementation'])}")
                    if "output" in desc:
                        formatted_desc.append(f"**4. Output:** {format_value(desc['output'])}")
                    if "acceptance_criteria" in desc:
                        formatted_desc.append(f"**5. Tiêu chí chấp nhận:** {format_value(desc['acceptance_criteria'])}")
                    
                    t["description"] = "\n\n".join(formatted_desc) if formatted_desc else str(desc)
                
                subtasks = t.get("subtasks", [])
                if subtasks:
                    format_descriptions(subtasks)
                    
        format_descriptions(tasks)
        # Update output_str with formatted descriptions
        output_str = output_str.replace(json_str, json.dumps(tasks, ensure_ascii=False, indent=2))
            
        violating_tasks = []
        
        def find_violations(task_list, p_type):
            for t in task_list:
                t_p_type = project_type_map.get(t.get("project_id", project_id), p_type)
                subtasks = t.get("subtasks", [])
                try:
                    et = float(t.get("estimated_hours", 0))
                except:
                    et = 0
                if (not subtasks or len(subtasks) == 0) and et > 8:
                    violating_tasks.append(f"- Task '{t.get('title', '')}': {et}H (Dự án {t_p_type.capitalize()})")
                if subtasks:
                    find_violations(subtasks, t_p_type)
                    
        find_violations(tasks, "agile")
        
        if not violating_tasks:
            return output_str
            
        logger.warning(f"Found tasks > 8H. Calling LLM to re-break: {violating_tasks}")
        violation_details = "\n".join(violating_tasks)
        
        prompt = (
            f"Bản nháp JSON task của bạn có các TASK LÁ (không có subtasks) vượt quá 8H:\n"
            f"{violation_details}\n\n"
            "ĐÂY LÀ ĐIỀU CẤM KỴ! Bất kỳ task lá nào cũng KHÔNG ĐƯỢC QUÁ 8H.\n"
            "Hãy trả về lại TOÀN BỘ JSON DRAFT gốc, NHƯNG PHẢI BẺ NHỎ các task bị lỗi trên thành các task con có ý nghĩa (ví dụ: thay vì 'Phát triển API' 16H, hãy bẻ thành 'API Đọc' 8H và 'API Ghi' 8H).\n"
            "CHÚ Ý LOẠI DỰ ÁN:\n"
            "- Nếu là Waterfall: Đưa các task con vào mảng `subtasks` của task bị lỗi (biến nó thành task cha).\n"
            "- Nếu là Agile: Tách task bị lỗi thành nhiều task ngang hàng (flat) thay thế nó, KHÔNG dùng `subtasks`.\n\n"
            "TRẢ VỀ ĐÚNG MỘT KHỐI MARKDOWN ```json_task_draft ... ``` CHỨA JSON, KHÔNG ĐƯỢC GIẢI THÍCH THÊM."
        )
        
        try:
            from langchain_core.messages import HumanMessage
            fix_msg = [HumanMessage(content=output_str), HumanMessage(content=prompt)]
            fix_resp = await llm.ainvoke(fix_msg)
            new_output = fix_resp.content
            if "```json_task_draft" in new_output:
                return new_output
        except Exception as e:
            logger.error(f"Error calling LLM to fix tasks: {e}")
            
        return output_str

    def fix_task_draft_et(output_str: str) -> str:
        # Force a newline before ```json_task_draft if missing
        output_str = re.sub(r'([^\n])\s*```json_task_draft', r'\1\n\n```json_task_draft', output_str)
        match = re.search(r'```json_task_draft\s*(.*?)\s*```', output_str, re.DOTALL)
        if not match:
            return output_str
        json_str = match.group(1)
        try:
            tasks = json.loads(json_str)
            def process_tasks(task_list):
                new_tasks = []
                for t in task_list:
                    subtasks = t.get("subtasks", [])
                    try:
                        et = float(t.get("estimated_hours", 0))
                    except:
                        et = 0
                    
                    t_project_id = t.get("project_id", project_id)
                    p_type = project_type_map.get(t_project_id, "agile")

                    if (not subtasks or len(subtasks) == 0) and et > 8:
                        import math
                        num_parts = math.ceil(et / 8.0)
                        base_et = round(et / num_parts, 1)
                        
                        if p_type == "waterfall":
                            t["subtasks"] = []
                            for i in range(num_parts):
                                part_et = base_et if i < num_parts - 1 else round(et - (base_et * (num_parts - 1)), 1)
                                sub_t = t.copy()
                                sub_t["title"] = f"{t.get('title', 'Task')} (Phần {i+1})"
                                sub_t["estimated_hours"] = part_et
                                if "subtasks" in sub_t:
                                    del sub_t["subtasks"]
                                t["subtasks"].append(sub_t)
                            t["estimated_hours"] = round(sum(sub.get("estimated_hours", 0) for sub in t["subtasks"]), 1)
                            new_tasks.append(t)
                        else:
                            # Agile -> Flat list
                            for i in range(num_parts):
                                part_et = base_et if i < num_parts - 1 else round(et - (base_et * (num_parts - 1)), 1)
                                flat_t = t.copy()
                                flat_t["title"] = f"{t.get('title', 'Task')} (Phần {i+1})"
                                flat_t["estimated_hours"] = part_et
                                if "subtasks" in flat_t:
                                    del flat_t["subtasks"]
                                new_tasks.append(flat_t)
                    else:
                        if len(subtasks) > 0:
                            t["subtasks"] = process_tasks(subtasks)
                            t["estimated_hours"] = round(sum(sub.get("estimated_hours", 0) for sub in t["subtasks"]), 1)
                            valid_starts = [sub["start_date"] for sub in t["subtasks"] if sub.get("start_date")]
                            valid_ends = [sub["deadline"] for sub in t["subtasks"] if sub.get("deadline")]
                            if valid_starts:
                                t["start_date"] = min(valid_starts)
                            if valid_ends:
                                t["deadline"] = max(valid_ends)
                        new_tasks.append(t)
                return new_tasks
            fixed_tasks = process_tasks(tasks)
            fixed_json_str = json.dumps(fixed_tasks, ensure_ascii=False, indent=2)
            return output_str.replace(json_str, "\n" + fixed_json_str + "\n")
        except Exception as e:
            logger.error(f"Error fixing JSON ET: {e}")
            return output_str

    # Thực thi agent
    try:
        response = await agent_executor.ainvoke({"input": input_str}, config=config)
        final_answer = response.get("output", "")
        if "Agent stopped due to max iterations" in final_answer:
            logger.warning("Max iterations hit in Task, triggering manual graceful fallback...")
            intermediate_steps = response.get("intermediate_steps", [])
            steps_str = ""
            for i, (action, obs) in enumerate(intermediate_steps):
                obs_str = str(obs)
                if len(obs_str) > 2000:
                    logger.info(f"Summarizing long observation for step {i+1}...")
                    sum_msg = [HumanMessage(content=f"Hãy tóm tắt ngắn gọn dữ liệu sau, CHỈ GIỮ LẠI các thông tin cốt lõi (ID, tên, trạng thái, số lượng, định dạng cấu trúc quan trọng). Bỏ các chi tiết thừa:\n\n{obs_str[:15000]}")]
                    sum_resp = await llm.ainvoke(sum_msg)
                    obs_str = sum_resp.content
                steps_str += f"Step {i+1}:\n- Tool: {action.tool}\n- Input: {action.tool_input}\n- Result: {obs_str}\n\n"
                
            fallback_prompt = (
                "Bạn đã phân tích hệ thống nhưng hết thời gian để tiếp tục dùng Tool. "
                "Dựa trên yêu cầu gốc và dữ liệu đã lấy được dưới đây, hãy BẮT BUỘC sinh ra bản nháp JSON (json_task_draft) tốt nhất có thể.\n\n"
                f"{input_str}\n\n"
                "DỮ LIỆU ĐÃ THU THẬP:\n"
                f"{steps_str}"
            )
            fallback_messages = [SystemMessage(content=system_prompt)] + history_msgs + [HumanMessage(content=fallback_prompt)]
            fallback_response = await llm.ainvoke(fallback_messages)
            final_answer = fallback_response.content
            
        final_answer = await check_and_rebreak_tasks_with_llm(final_answer)
        final_answer = fix_task_draft_et(final_answer)
        logger.info(f"LLM Raw Output:\n{final_answer}")
        logger.info(f"==== KẾT THÚC TASK NODE ====")

        new_message = AIMessage(content=final_answer)
        return {"messages": [new_message]}
    except Exception as e:
        logger.error(f"Error in task_node: {e}")
        raise e