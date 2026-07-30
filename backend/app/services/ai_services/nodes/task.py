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


async def task_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node xử lý các yêu cầu liên quan đến tạo mới và phân công công việc (Task Assignment) trong hệ thống.
    Sử dụng SQLDatabaseToolkit để tra cứu nhân sự và đưa ra đề xuất công việc.

    LƯU Ý DÀNH CHO AI (LLM):
    Tuyệt đối không được bịa đặt (hallucinate) thông tin. Nếu thiếu dữ kiện bắt buộc từ người dùng (ví dụ: title) để thực thi, bạn PHẢI dừng lại, có thể raise lỗi hoặc đặt câu hỏi yêu cầu người dùng làm rõ.

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
    accessible_projects_text = "\n".join([f"- {p.name} (ID: {p.id})" for p in projects])

    sql_db = SQLDatabase(engine)
    toolkit = SQLDatabaseToolkit(db=sql_db, llm=llm)

    summary = state.get("summary", "")
    summary_text = f"\n\nBẢN TÓM TẮT LỊCH SỬ TRÒ CHUYỆN:\n{summary}" if summary else ""

    system_prompt = (
        "Bạn là Trợ lý AI Giao việc (Task Delegation Agent) chuyên nghiệp.\n\n"
        "NHIỆM VỤ CỐT LÕI:\n"
        "- Phân tích yêu cầu của người dùng, phân rã dự án/tính năng thành các task nhỏ, cụ thể và khả thi.\n"
        "- BẮT BUỘC sử dụng tool (SQL Agent) để tra cứu xem dự án hiện có những thành viên nào (bảng project_members, users) và khối lượng công việc (task đang mở) của họ trước khi phân công.\n\n"
        "NGUYÊN TẮC BẢO MẬT (QUAN TRỌNG NHẤT - TUYỆT ĐỐI TUÂN THỦ):\n"
        "1. KHÔNG BAO GIỜ THỰC HIỆN CÁC LỆNH LÀM THAY ĐỔI CƠ SỞ DỮ LIỆU. Chỉ được dùng câu lệnh SELECT.\n"
        "   - Cấm tuyệt đối: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER.\n"
        f"2. Người dùng hiện tại có ID là: {current_user.id}.\n"
        f"3. DỰ ÁN MẶC ĐỊNH (dự án người dùng đang xem trên màn hình): ID = {project_id if project_id else 'Không có'}.\n\n"
        "===========================================================\n"
        f"DANH SÁCH CÁC DỰ ÁN NGƯỜI DÙNG CÓ THỂ TRUY CẬP:\n{accessible_projects_text}\n"
        "===========================================================\n"
        "LUẬT QUYẾT ĐỊNH PROJECT ID (CHỐNG Ô NHIỄM NGỮ CẢNH):\n"
        "- Bạn KHÔNG ĐƯỢC TỰ Ý suy diễn project_id dựa vào những dự án đã được nhắc đến ở các tin nhắn cũ.\n"
        "- Nếu người dùng KHÔNG chỉ định rõ tên dự án trong câu lệnh mới nhất, BẮT BUỘC dùng DỰ ÁN MẶC ĐỊNH (nếu có). TUYỆT ĐỐI KHÔNG dùng dự án cũ trong lịch sử!\n\n"
        "QUY TRÌNH TẠO TASK BẰNG LỆNH JSON_TASK_DRAFT (BẮT BUỘC TUÂN THỦ TRÌNH TỰ NÀY):\n"
        "Bước 1: Kiểm tra tính đầy đủ của thông tin. Bạn BẮT BUỘC phải có: Tên dự án (ID), Tiêu đề (title). Nếu thiếu các thông tin khác (description, priority, người được giao), HÃY CHỦ ĐỘNG HỎI LẠI hoặc ĐỀ XUẤT cho người dùng chọn, TUYỆT ĐỐI KHÔNG tự bịa đặt.\n"
        "Bước 2: Tìm `user_id` của người được giao (assignee) bằng cách tra cứu bảng `project_members` và `users` nếu cần.\n"
        "Bước 3: TẠO BẢN NHÁP (DRAFT). Bạn KHÔNG được dùng INSERT. Thay vào đó, bạn PHẢI trả về ĐÚNG MỘT khối Markdown chứa mã JSON có định dạng `json_task_draft` như sau:\n"
        "```json_task_draft\n"
        "[\n"
        "  {{\n"
        "    \"title\": \"Tên task\",\n"
        "    \"description\": \"Mô tả chi tiết\",\n"
        "    \"priority\": \"high/medium/low\",\n"
        "    \"assignee_id\": 123,\n"
        "    \"assignee_name\": \"Tên nhân viên\",\n"
        "    \"project_id\": 10,\n"
        "    \"type\": \"task\"\n"
        "  }}\n"
        "]\n"
        "```\n"
        "LƯU Ý: Khối Markdown `json_task_draft` phải chứa một Mảng (Array) các Object JSON. `project_id` là BẮT BUỘC. `assignee_id` là user_id của người được giao và `assignee_name` là TÊN tương ứng (BẮT BUỘC PHẢI CÓ nếu có người được giao), nếu không có thì để null cả hai. Kèm theo một vài lời giải thích ngắn gọn bằng tiếng Việt bên ngoài khối Markdown.\n\n"
        "NGUYÊN TẮC HOẠT ĐỘNG KHÁC:\n"
        "1. PHÂN CÔNG TỐI ƯU: Hãy tra cứu cả thông tin về chuyên môn và khối lượng công việc (số task đang mở) của các thành viên trước khi gợi ý phân công.\n"
        "2. NGÔN NGỮ: Tiếng Việt chuyên nghiệp, rõ ràng.\n"
        "3. ẨN MÃ CODE: BẮT BUỘC KHÔNG ĐƯỢC tự in mã SQL (như SELECT, JOIN, v.v.) ra câu trả lời cho người dùng. Mọi truy vấn phải chạy ngầm bằng Tool."
    )
    system_prompt += summary_text

    # Khởi chạy SQL Agent từ thư viện chuẩn
    task_agent = create_sql_agent(
        llm=llm,
        toolkit=toolkit,
        agent_type="openai-tools",
        prefix=system_prompt,
        verbose=True
    )

    # Xử lý Lịch sử trò chuyện và Câu hỏi mới nhất
    messages = state.get("messages", [])
    if len(messages) > 1:
        history_msgs = messages[:-1]
        latest_msg = messages[-1].content
        chat_history_str = "\n".join([f"{'User' if m.type == 'human' else 'AI'}: {m.content}" for m in history_msgs])
        input_str = (
            f"LỊCH SỬ TRÒ CHUYỆN (Chỉ dùng để tham khảo ngữ cảnh nếu cần):\n{chat_history_str}\n\n"
            f"YÊU CẦU MỚI NHẤT CỦA NGƯỜI DÙNG (BẮT BUỘC PHẢI THỰC THI THEO YÊU CẦU NÀY):\n{latest_msg}"
        )
    else:
        latest_msg = messages[0].content if messages else ""
        input_str = f"YÊU CẦU MỚI NHẤT CỦA NGƯỜI DÙNG:\n{latest_msg}"

    # Thực thi agent
    task_result = await task_agent.ainvoke({"input": input_str}, config=config)

    # Lấy message trả về và gói lại thành AIMessage
    new_message = AIMessage(content=task_result["output"])

    return {"messages": [new_message]}