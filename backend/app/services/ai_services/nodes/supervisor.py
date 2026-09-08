import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.core.config import get_settings
from app.services.ai_services.intent_guards import (
    build_low_weight_history_block,
    is_destructive_or_forbidden_write,
    is_task_creation_followup,
    latest_human_text,
    looks_like_sprint_create,
    looks_like_task_create,
    low_weight_summary_block,
)
from app.services.ai_services.state import AgentState

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
    latest = latest_human_text(messages)

    # Chặn sớm: xóa hàng loạt / SQL ghi — không để LLM route sang task/qna rồi "tạo lại" draft.
    if is_destructive_or_forbidden_write(latest):
        logger.info("==== SUPERVISOR HARD BLOCK (destructive/SQL write) ====")
        logger.info(f"User: {latest[:200]}")
        return {"router_decision": "out_of_scope"}

    # Câu trả lời cho yêu cầu bổ sung thông tin task phải tiếp tục luồng task,
    # kể cả khi bản thân câu mới không chứa từ khóa nghiệp vụ.
    if is_task_creation_followup(messages):
        logger.info("==== SUPERVISOR TASK FOLLOW-UP ====")
        logger.info(f"Tiếp tục luồng tạo task với câu trả lời: {latest[:200]}")
        return {"router_decision": "task"}

    if looks_like_task_create(latest) or looks_like_sprint_create(latest):
        logger.info("==== SUPERVISOR HARD ROUTE TASK ====")
        logger.info(f"Phát hiện lệnh tạo/giao task hoặc sprint: {latest[:200]}")
        return {"router_decision": "task"}

    summary = state.get("summary", "")
    summary_text = low_weight_summary_block(summary)
    history_block = build_low_weight_history_block(messages)

    system_prompt = (
        "Bạn là Điều phối viên (Supervisor) cấp cao của hệ thống Quản lý dự án thông minh.\n"
        "Nhiệm vụ ĐỘC QUYỀN của bạn là phân tích ngữ nghĩa, ý định của người dùng và quyết định luồng xử lý chính xác nhất.\n\n"
        "HÃY PHÂN LOẠI DỰA TRÊN 3 NHÓM Ý ĐỊNH SAU:\n\n"
        "1. XEM & PHÂN TÍCH DỮ LIỆU (Router trả về: 'qna')\n"
        "   - Bao gồm các hành động: Tra cứu bất kỳ thông tin nào trong Database (dự án, công việc, thành viên, bình luận, workload, thống kê), hỏi đáp, xin lời khuyên, xem báo cáo.\n"
        "   - Mục tiêu: Người dùng muốn biết thông tin có sẵn, truy vấn dữ liệu từ hệ thống, CHƯA MUỐN thực hiện lệnh thay đổi/thêm mới/xóa.\n"
        "   - Dấu hiệu nhận biết: Các câu hỏi có từ khóa 'có những gì', 'còn bao nhiêu', 'ai rảnh', 'tiến độ', 'việc gì trước', 'tóm tắt', 'liệt kê', 'kiểm tra'.\n\n"
        "2. THỰC THI HÀNH ĐỘNG MỚI (Router trả về: 'task')\n"
        "   - Bao gồm các hành động: Tạo công việc mới, phân công lại người phụ trách, chia nhỏ dự án, tạo/đổi trạng thái sprint (qua bản nháp).\n"
        "   - Mục tiêu: Người dùng yêu cầu hệ thống sinh bản nháp task/sprint để xác nhận trên UI.\n"
        "   - Dấu hiệu nhận biết: Động từ mang tính sai khiến mạnh: 'tạo giúp tôi', 'giao việc này cho', 'chia nhỏ task này', 'lên kế hoạch cho'.\n"
        "   - CHÚ Ý ĐẶC BIỆT: Yêu cầu 'tạo chức năng X', 'làm module Y', 'viết api Z' là yêu cầu TẠO TASK để làm phần mềm. Luôn trả về 'task', KHÔNG trả về 'out_of_scope'.\n"
        "   - TUYỆT ĐỐI KHÔNG xếp 'xóa task', 'xóa hết', 'DELETE', 'UPDATE ... SET' vào 'task'.\n\n"
        "3. NGOÀI PHẠM VI (Router trả về: 'out_of_scope')\n"
        "   - Câu hỏi không liên quan quản lý dự án (thời tiết, giải trí…).\n"
        "   - HOẶC yêu cầu phá hủy/ghi DB trực tiếp: xóa task/hết task, DELETE/UPDATE/DROP/TRUNCATE SQL, wipe dữ liệu.\n"
        "     (AI không hỗ trợ xóa hay chạy SQL ghi — phải từ chối.)\n\n"
        "LƯU Ý QUAN TRỌNG:\n"
        "- Phân loại theo YÊU CẦU MỚI NHẤT (trọng số 100%). Lịch sử 20 tin gần nhất trọng số 30–40%, chỉ để hiểu follow-up.\n"
        "- CẤM giữ nguyên ý định/câu trả lời của lượt trước nếu câu mới là lệnh khác.\n"
        "- Hãy suy luận dựa trên Ý ĐỊNH THỰC SỰ của câu. Ví dụ: Nếu người dùng hỏi 'Nên làm gì hôm nay?', đó là ý định TÌM LỜI KHUYÊN (qna), không phải là tạo task.\n"
        "- Câu có từ khóa nghiệp vụ ('dự án', 'task'…) nhưng là LỆNH XÓA / SQL GHI → 'out_of_scope'.\n"
        "- Các câu nghiệp vụ còn lại (tra cứu / tạo task) xếp 'qna' hoặc 'task', không xếp 'out_of_scope' chỉ vì tên dự án lạ.\n"
        "- Nếu câu hỏi của người dùng là một câu HỎI TIẾP NỐI (follow-up) dựa trên ngữ cảnh đang chat (ví dụ: 'còn ai khác không?', 'thêm người này vào đi', 'dự án X thì sao?'), bạn PHẢI xếp nó vào 'task' hoặc 'qna' (trừ khi là lệnh xóa/SQL ghi)."
    )
    system_prompt += summary_text

    router_input = latest
    if history_block:
        router_input = (
            f"{history_block}\n\n"
            f"YÊU CẦU MỚI NHẤT (trọng số 100% — phân loại theo câu này):\n{latest}"
        )

    router_llm = llm.with_structured_output(RouterSchema)
    response = router_llm.invoke(
        [SystemMessage(content=system_prompt), HumanMessage(content=router_input)],
        config={"tags": ["supervisor_llm"]},
    )

    # HARDCODE FALLBACK: từ khóa nghiệp vụ → qna, NHƯNG không ghi đè lệnh phá hủy.
    if response.next_node == "out_of_scope" and latest:
        if not is_destructive_or_forbidden_write(latest):
            keywords = ["dự án", "task", "công việc", "nhân sự", "logwork", "tiến độ", "team", "sprint"]
            if any(kw in latest for kw in keywords):
                logger.info("==== SUPERVISOR OVERRIDE ====")
                logger.info(f"Phát hiện từ khóa nghiệp vụ trong '{latest}', ghi đè từ out_of_scope -> qna")
                response.next_node = "qna"

    # Safety net lần nữa sau LLM
    if is_destructive_or_forbidden_write(latest):
        response.next_node = "out_of_scope"

    logger.info("==== SUPERVISOR QUYẾT ĐỊNH ====")
    logger.info(f"Phân loại ngữ định: {response.next_node}")

    return {"router_decision": response.next_node}
