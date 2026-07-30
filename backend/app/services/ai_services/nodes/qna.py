import asyncio

from langchain_community.agent_toolkits import create_sql_agent
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.utilities.sql_database import SQLDatabase
from langchain_core.messages import AIMessage
from langchain_core.runnables.config import RunnableConfig
from langchain_openai import ChatOpenAI

from app.config.settings import get_settings
from app.core.connection import engine
from app.services import project_service
from app.services.ai_services.state import AgentState

settings = get_settings()
llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.openai_api_key, temperature=0.1)


async def qna_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node xử lý các câu hỏi dạng tra cứu thông tin (QnA) trong hệ thống AI-Powered Project Management.
    Sử dụng SQLDatabaseToolkit để truy vấn trực tiếp vào DB một cách linh hoạt.

    LƯU Ý DÀNH CHO AI (LLM):
    Tuyệt đối không được bịa đặt (hallucinate) thông tin. Nếu thiếu dữ kiện từ người dùng để thực thi, bạn PHẢI dừng lại và đặt câu hỏi yêu cầu người dùng làm rõ.

    Args:
        state: Trạng thái hiện tại của đồ thị (AgentState).
        config: Cấu hình runtime (chứa db_session, current_user, project_id).

    Returns:
        dict: Chứa danh sách các tin nhắn mới được sinh ra bởi ReAct Agent.
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
    accessible_projects_text = "\n".join([f"- {p.name} (ID: {p.id})" for p in projects])

    sql_db = SQLDatabase(engine)
    toolkit = SQLDatabaseToolkit(db=sql_db, llm=llm)

    summary = state.get("summary", "")
    summary_text = f"\n\nBẢN TÓM TẮT LỊCH SỬ TRÒ CHUYỆN:\n{summary}" if summary else ""

    system_prompt = (
        "### [ROLE & OBJECTIVE]\n"
        "Bạn là Trợ lý AI Quản lý Dự án cấp cao (Data Analyst). Nhiệm vụ của bạn là truy vấn cơ sở dữ liệu (thông qua SQL Agent) để trả lời các câu hỏi về tiến độ, công việc, và nhân sự một cách chuẩn xác 100%.\n\n"
        
        "### [CONTEXT]\n"
        f"- Người dùng hiện tại (Current User ID): {current_user.id}\n"
        f"- Dự án mặc định (đang xem trên màn hình): ID = {project_id if project_id else 'Không có'}\n"
        f"- Danh sách dự án được phép truy cập:\n{accessible_projects_text}\n"
        f"- Danh sách ID dự án hợp lệ: {accessible_project_ids}\n\n"
        
        "### [CHAIN OF THOUGHT (BẮT BUỘC SUY NGHĨ TRƯỚC KHI TẠO SQL)]\n"
        "Trước khi tạo câu lệnh SQL, bạn BẮT BUỘC phải xác định rõ 3 yếu tố sau:\n"
        "1. PHẠM VI DỰ ÁN: HÃY DÙNG 'Dự án mặc định'. Tuyệt đối chặn các ID dự án ngoài danh sách được phép bằng `project_id IN (...)`.\n"
        f"2. PHẠM VI NGƯỜI DÙNG: Nếu câu hỏi có chữ 'tôi', 'mình', 'của tôi', hãy filter theo user_id = {current_user.id} thông qua các bảng liên kết.\n"
        "3. ĐIỀU KIỆN THỜI GIAN & TRẠNG THÁI: Áp dụng nghiêm ngặt các định nghĩa trong [DATA DICTIONARY] bên dưới, không tự bịa logic.\n\n"
        
        "### [DATA DICTIONARY (QUY TẮC MAP DB)]\n"
        "- [status (TRẠNG THÁI TASK)]:\n"
        "  + 'todo': Cần thực hiện, Mới, Chưa làm, Chưa bắt đầu\n"
        "  + 'in_progress': Đang tiến hành, Đang làm\n"
        "  + 'done': Hoàn thành, Đã xong\n"
        "  + 'cancel': Đã hủy, Bỏ qua\n"
        "- [priority (MỨC ĐỘ ƯU TIÊN)]:\n"
        "  + 'low': Thấp\n"
        "  + 'medium': Trung bình, Bình thường\n"
        "  + 'high': Cao, Quan trọng\n"
        "  + 'urgent': Khẩn cấp, Gấp\n"
        "- [QUAN HỆ BẢNG VÀ CỘT (RẤT QUAN TRỌNG ĐỂ TRÁNH LỖI CÚ PHÁP)]:\n"
        "  + Bảng `tasks` KHÔNG CÓ cột `assignee_id` hay `user_id`.\n"
        "  + Bảng `task_assignees` KHÔNG CÓ cột `assignee_id` hay `user_id`. Nó chỉ có cột `project_member_id`.\n"
        "  + Bảng `project_members` có cột `user_id`.\n"
        "  + Để biết ai được giao task nào: BẮT BUỘC JOIN theo đúng thứ tự và tên cột sau: `JOIN task_assignees ta ON tasks.id = ta.task_id JOIN project_members pm ON ta.project_member_id = pm.id JOIN users u ON pm.user_id = u.id`.\n"
        "- [THUẬT NGỮ ĐẶC BIỆT]:\n"
        "  + 'Trễ hạn' (Overdue) = `status != 'done' AND deadline < CURRENT_DATE()`\n"
        "  + 'Chưa có logwork' = Các task KHÔNG có bản ghi trong bảng `logworks` (dùng `LEFT JOIN logworks` và kiểm tra `logworks.id IS NULL`).\n"
        "  + 'Đã logwork' = Các task CÓ bản ghi trong bảng `logworks`.\n\n"
        
        "### [EXECUTION RULES (LUẬT THỰC THI)]\n"
        "1. CHỈ READ-ONLY: Tuyệt đối không dùng INSERT, UPDATE, DELETE.\n"
        "2. NHIỀU CÂU HỎI: Nếu người dùng hỏi nhiều ý, PHẢI dùng Tool SQL nhiều lần để lấy đủ dữ liệu cho tất cả các ý rồi mới trả lời.\n"
        "3. BẮT BUỘC DÙNG TOOL: Bạn KHÔNG ĐƯỢC tự in mã SQL ra đoạn chat. Mọi câu lệnh SQL phải được truyền vào Tool `sql_db_query` để chạy ngầm.\n"
        "4. DỮ LIỆU REALTIME: Không bao giờ lấy đáp án từ Lịch sử trò chuyện. Luôn chạy Tool SQL mới nhất.\n\n"
        
        "### [OUTPUT FORMAT (ĐỊNH DẠNG ĐẦU RA)]\n"
        "- Trình bày bằng Tiếng Việt thân thiện, rõ ràng.\n"
        "- TUYỆT ĐỐI KHÔNG SỬ DỤNG BẢNG (TABLE). Bắt buộc phải dùng danh sách gạch đầu dòng (bullet points).\n"
        "- NGHIÊM CẤM in ra bất kỳ đoạn mã SQL hay giải thích kỹ thuật nào cho người dùng. (Nếu lỡ in ra chữ SELECT, câu trả lời sẽ bị đánh giá là THẤT BẠI).\n"
    )
    system_prompt += summary_text

    # Khởi chạy SQL Agent từ thư viện chuẩn
    qna_agent = create_sql_agent(
        llm=llm,
        toolkit=toolkit,
        agent_type="openai-tools",
        prefix=system_prompt,
        verbose=True,
        top_k=15, 
        max_iterations=30
    )
    
    # Xử lý Lịch sử trò chuyện và Câu hỏi mới nhất
    messages = state.get("messages", [])
    if len(messages) > 1:
        history_msgs = messages[:-1]
        latest_msg = messages[-1].content
        chat_history_str = "\n".join([f"{'User' if m.type == 'human' else 'AI'}: {m.content}" for m in history_msgs])
        input_str = (
            f"LỊCH SỬ TRÒ CHUYỆN (Chỉ dùng để tham khảo ngữ cảnh nếu cần):\n{chat_history_str}\n\n"
            f"CÂU HỎI MỚI NHẤT CỦA NGƯỜI DÙNG (BẮT BUỘC PHẢI DÙNG TOOL SQL ĐỂ TRUY VẤN DB MỚI ĐƯỢC TRẢ LỜI):\n{latest_msg}"
        )
    else:
        latest_msg = messages[0].content if messages else ""
        input_str = f"CÂU HỎI MỚI NHẤT CỦA NGƯỜI DÙNG (BẮT BUỘC PHẢI DÙNG TOOL SQL ĐỂ TRUY VẤN DB):\n{latest_msg}"

    # Thực thi agent
    qna_result = await qna_agent.ainvoke({"input": input_str}, config=config)

    # Lấy message trả về và gói lại thành AIMessage
    new_message = AIMessage(content=qna_result["output"])

    return {"messages": [new_message]}
