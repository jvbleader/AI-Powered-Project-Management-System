from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI

from app.config.settings import get_settings
from app.services.ai_services.state import AgentState
import logging

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

from app.schemas.ai_schema import RouterSchema


def supervisor_node(state: AgentState) -> dict:
    """
    Xác định luồng xử lý: QnA, Task Assignment hay Out of Scope.
    Sử dụng LLM để phân tích ý định của người dùng và quyết định luồng đi tiếp theo.

    Args:
        state: Trạng thái hiện tại của đồ thị (AgentState).

    Returns:
        dict: Chứa quyết định điều hướng (router_decision).
    """
    messages = state["messages"]
    summary = state.get("summary", "")
    summary_text = f"\n\nBẢN TÓM TẮT LỊCH SỬ TRÒ CHUYỆN:\n{summary}" if summary else ""

    system_prompt = (
        "Bạn là Điều phối viên (Supervisor) cấp cao của hệ thống Quản lý dự án thông minh.\n"
        "Nhiệm vụ ĐỘC QUYỀN của bạn là phân tích ngữ nghĩa, ý định của người dùng và quyết định luồng xử lý chính xác nhất.\n\n"
        "HÃY PHÂN LOẠI DỰA TRÊN 3 NHÓM Ý ĐỊNH SAU:\n\n"
        "1. XEM & PHÂN TÍCH DỮ LIỆU (Router trả về: 'qna')\n"
        "   - Bao gồm các hành động: Tra cứu bất kỳ thông tin nào trong Database (dự án, công việc, thành viên, bình luận, workload, thống kê), hỏi đáp, xin lời khuyên, xem báo cáo.\n"
        "   - Mục tiêu: Người dùng muốn biết thông tin có sẵn, truy vấn dữ liệu từ hệ thống, CHƯA MUỐN thực hiện lệnh thay đổi/thêm mới/xóa.\n"
        "   - Dấu hiệu nhận biết: Các câu hỏi có từ khóa 'có những gì', 'còn bao nhiêu', 'ai rảnh', 'tiến độ', 'việc gì trước', 'tóm tắt', 'liệt kê', 'kiểm tra'.\n\n"
        "2. THỰC THI HÀNH ĐỘNG MỚI (Router trả về: 'task')\n"
        "   - Bao gồm các hành động: Tạo công việc mới, phân công lại người phụ trách, chia nhỏ dự án.\n"
        "   - Mục tiêu: Người dùng yêu cầu hệ thống phải sinh ra hoặc thay đổi dữ liệu công việc thực tế.\n"
        "   - Dấu hiệu nhận biết: Động từ mang tính sai khiến mạnh: 'tạo giúp tôi', 'giao việc này cho', 'chia nhỏ task này', 'lên kế hoạch cho'.\n\n"
        "3. NGOÀI PHẠM VI (Router trả về: 'out_of_scope')\n"
        "   - Khi câu hỏi HOÀN TOÀN không liên quan đến công việc, quản lý dự án, phần mềm (ví dụ: thời tiết, giải trí, chào hỏi vu vơ).\n\n"
        "LƯU Ý QUAN TRỌNG:\n"
        "- Hãy suy luận dựa trên Ý ĐỊNH THỰC SỰ của câu. Ví dụ: Nếu người dùng hỏi 'Nên làm gì hôm nay?', đó là ý định TÌM LỜI KHUYÊN (qna), không phải là tạo task.\n"
        "- ĐẶC BIỆT LƯU Ý: Mọi câu hỏi có chứa từ khóa liên quan đến nghiệp vụ (ví dụ: 'dự án', 'task', 'công việc', 'nhân sự') ĐỀU PHẢI XẾP VÀO 'qna' hoặc 'task', TUYỆT ĐỐI KHÔNG xếp vào 'out_of_scope' ngay cả khi tên dự án/công việc đó nghe có vẻ lạ hoặc chưa từng xuất hiện.\n"
        "- Nếu câu hỏi của người dùng là một câu HỎI TIẾP NỐI (follow-up) dựa trên ngữ cảnh đang chat (ví dụ: 'còn ai khác không?', 'thêm người này vào đi', 'dự án X thì sao?'), bạn PHẢI xếp nó vào 'task' hoặc 'qna', TUYỆT ĐỐI KHÔNG được xếp vào 'out_of_scope'."
    )
    system_prompt += summary_text

    router_llm = llm.with_structured_output(RouterSchema)
    response = router_llm.invoke(
        [SystemMessage(content=system_prompt)] + messages, config={"tags": ["supervisor_llm"]}
    )
    
    # HARDCODE FALLBACK: Nếu LLM vẫn bướng bỉnh xếp vào out_of_scope dù có từ khóa nghiệp vụ
    if response.next_node == "out_of_scope" and len(messages) > 0:
        latest_msg = messages[-1].content.lower()
        keywords = ["dự án", "task", "công việc", "nhân sự", "logwork", "tiến độ", "team", "sprint"]
        if any(kw in latest_msg for kw in keywords):
            logger.info(f"==== SUPERVISOR OVERRIDE ====")
            logger.info(f"Phát hiện từ khóa nghiệp vụ trong '{latest_msg}', ghi đè từ out_of_scope -> qna")
            response.next_node = "qna"

    logger.info(f"==== SUPERVISOR QUYẾT ĐỊNH ====")
    logger.info(f"Phân loại ngữ định: {response.next_node}")
    
    return {"router_decision": response.next_node}
