import pytest
import asyncio
import uuid
import logging
from typing import List, Dict, Union

from langchain_core.messages import HumanMessage

from app.core.connection import SessionLocal
from app.models.user_model import User
from app.services.ai_services.graph import project_graph

# Configure a beautiful colored logger (fallback if pytest colors aren't enough)
class ColorLogFormatter(logging.Formatter):
    COLORS = {
        logging.DEBUG: "\033[94m",    # Blue
        logging.INFO: "\033[92m",     # Green
        logging.WARNING: "\033[93m",  # Yellow
        logging.ERROR: "\033[91m",    # Red
        logging.CRITICAL: "\033[91m\033[1m" # Bold Red
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.COLORS.get(record.levelno, self.RESET)
        record.msg = f"{color}{record.msg}{self.RESET}"
        return super().format(record)

logger = logging.getLogger("AI_TEST")
logger.setLevel(logging.INFO)
# Clear old handlers to avoid duplicate logs in pytest
if logger.hasHandlers():
    logger.handlers.clear()

ch = logging.StreamHandler()
ch.setFormatter(ColorLogFormatter("%(message)s"))
logger.addHandler(ch)

# --- FIXTURES ---

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def test_user(db_session):
    # Try ID 32 first, fallback to first user
    user = db_session.query(User).filter(User.id == 32).first()
    if not user:
        user = db_session.query(User).first()
        if not user:
            pytest.skip("No users found in database to run tests.")
    return user


# --- TEST CASES DEFINITION ---

TEST_CASES = [
    # ---------------------------------------------------------
    # Các test case gốc
    # ---------------------------------------------------------
    {
        "id": "TC01_DUPLICATE_NAME",
        "name": "Giao task cho người bị trùng tên",
        "level": "CẤP ĐỘ 2",
        "prompt": "Tạo cho tôi một task 'Fix bug Login' ở dự án Method, giao cho Linh.",
        "expected": "AI KHÔNG TỰ Ý CHỌN MÀ PHẢI liệt kê danh sách những người tên Linh để user chọn."
    },
    {
        "id": "TC02_BREAKDOWN",
        "name": "Tạo Task lớn (Bắt buộc phân rã)",
        "level": "CẤP ĐỘ 4",
        "prompt": "Tạo cho tôi tính năng 'Thanh toán qua ví MoMo' ở dự án Method. Deadline là cuối tháng này. Tự chia việc cho team sao cho hợp lý nhé.",
        "expected": "AI tạo 1 Task Cha và tự động phân rã thành các Subtasks nhỏ hơn."
    },
    {
        "id": "TC03_OVERDUE",
        "name": "Truy quét Task quá hạn để đôn đốc",
        "level": "SIÊU THỰC TẾ 1",
        "prompt": "Liệt kê cho tôi tất cả các task đang bị quá hạn (Overdue) trong dự án Method AI. Ghi rõ tên người đang ôm task đó để tôi đi giục.",
        "expected": "AI lọc các task trễ hạn (chưa done), in ra danh sách kèm tên người gán."
    },
    {
        "id": "TC04_EMERGENCY_REASSIGN",
        "name": "Xin nghỉ đột xuất và nhờ gán lại việc",
        "level": "SIÊU THỰC TẾ 2",
        "prompt": "Chiều nay tôi phải đi viện gấp. Hãy tìm trong dự án Method xem ai đang rảnh việc nhất (ít task nhất) thì gán hết các task Đang làm (In Progress) của tôi sang cho người đó làm đỡ nhé.",
        "expected": "AI tìm task của người dùng, tìm thành viên rảnh nhất qua get_user_workload, và dùng công cụ update_task để chuyển giao."
    },
    {
        "id": "TC05_VAGUE_REQUEST",
        "name": "Yêu cầu mập mờ từ sếp",
        "level": "SIÊU THỰC TẾ 4",
        "prompt": "Sếp bảo cái màn hình trang chủ bị lệch css kìa, tạo ngay một bug assign cho thằng Hùng đi.",
        "expected": "AI nhận ra thiếu Ngữ cảnh dự án và Hùng có thể trùng. AI dừng lại hỏi dự án nào và Hùng nào."
    },
    {
        "id": "TC06_RBAC",
        "name": "Đòi xem dự án không có quyền",
        "level": "LẮT LÉO 1",
        "prompt": "Lọc cho tôi danh sách các task đang làm trong dự án 'Tuyệt Mật Phi Vụ Triệu Đô'.",
        "expected": "AI từ chối trả lời vì không có quyền truy cập dự án."
    },
    {
        "id": "TC07_CROSS_PROJECT",
        "name": "So sánh khối lượng công việc 2 dự án",
        "level": "LẮT LÉO 3",
        "prompt": "So sánh xem giữa dự án Method AI và dự án AI Computer Seller, team đang phải làm nhiều task hơn ở dự án nào?",
        "expected": "AI gọi query_tasks cho CẢ 2 dự án, đếm số task và đưa ra so sánh."
    },
    {
        "id": "TC08_WATERFALL_TRAP",
        "name": "Tạo Sprint cho dự án Waterfall",
        "level": "LẮT LÉO 4",
        "prompt": "Trong dự án Method AI, tạo cho tôi một Sprint mới đặt tên là Sprint Khẩn Cấp để chạy deadline.",
        "expected": "AI check Project Type, phát hiện Method AI là Waterfall nên TỪ CHỐI khéo léo."
    },
    {
        "id": "TC09_MEMORY_CONTEXT",
        "name": "Tạo task và bổ sung thông tin (Follow-up)",
        "level": "MEMORY 1",
        "prompt": [
            "Tạo cho tôi một task mới tên là 'Thiết kế giao diện Đăng nhập', assign cho tôi.",
            "Ở dự án Method nhé. Deadline là thứ 6 tuần sau."
        ],
        "expected": "Step 1: AI hỏi tên dự án. Step 2: AI nhớ lại yêu cầu Step 1 để tạo task."
    },
    {
        "id": "TC10_MEMORY_COREF",
        "name": "Hiểu đại từ nhân xưng",
        "level": "MEMORY 2",
        "prompt": [
            "Trong dự án Method, ai đang rảnh nhất (có ít task nhất)?",
            "Giao cho người đó task 'Tối ưu hóa Database' nhé."
        ],
        "expected": "Step 1: AI tìm người rảnh nhất. Step 2: AI hiểu 'người đó' là ai để gán task."
    },

    # ---------------------------------------------------------
    # CÁC TEST CASE CỰC KHÓ (Hardest Cases Today)
    # ---------------------------------------------------------
    {
        "id": "TC11_HARD_CONDITIONAL_LOGIC",
        "name": "Multi-step Logic (Điều kiện rẽ nhánh)",
        "level": "HARDEST 1",
        "prompt": "Tính tổng giờ làm tuần trước của Linh ở dự án Method. Nếu dưới 40h thì tạo 1 task 'Nghiên cứu công nghệ mới' cho Linh. Nếu trên 40h thì bảo Linh nghỉ ngơi đi.",
        "expected": "AI gọi tool tính giờ, tự suy luận logic if/else để quyết định có gọi tool tạo task hay không mà không hỏi lại."
    },
    {
        "id": "TC12_HARD_RELATIVE_TIME",
        "name": "Relative Time/Date Parsing (Thời gian tương đối)",
        "level": "HARDEST 2",
        "prompt": "Thống kê những task đã hoàn thành từ đầu tháng trước cho tới thứ sáu tuần vừa rồi ở dự án Method.",
        "expected": "AI tính toán chính xác ngày tháng hiện tại để dịch ra ISO datetime hợp lệ truyền vào tool query_tasks."
    },
    {
        "id": "TC13_HARD_TOOL_RECOVERY",
        "name": "Tool Error Recovery (Tự phục hồi lỗi)",
        "level": "HARDEST 3",
        "prompt": [
            "Tạo task 'Tối ưu UI' ở dự án 'Tàu Vũ Trụ Bay Lên Sao Hoả'.",
            "À nhầm, tạo ở dự án Method đi."
        ],
        "expected": "Step 1: AI báo lỗi dự án không tồn tại. Step 2: AI nhớ lại task 'Tối ưu UI' và tạo thành công."
    },
    {
        "id": "TC14_HARD_BULK_SUMMARY",
        "name": "Bulk Context Summarization (Tóm tắt hàng loạt)",
        "level": "HARDEST 4",
        "prompt": "Lọc tất cả các task ưu tiên High, đang In Progress, đã quá hạn ở dự án Method. Đừng liệt kê từng cái, hãy viết 1 đoạn tóm tắt tình hình tại sao team lại trễ nải dựa trên tên các task.",
        "expected": "AI lấy list task, nhưng dùng LLM phân tích ngữ nghĩa các tên task để đưa ra kết luận thay vì in list nhàm chán."
    },
    {
        "id": "TC15_HARD_CROSS_DOMAIN",
        "name": "Cross-Domain Deep Query (Truy vấn chéo sâu)",
        "level": "HARDEST 5",
        "prompt": "Trong dự án Method, xem những ai đang ở trong team, sau đó kiểm tra xem ai trong số họ chưa log work ngày hôm qua.",
        "expected": "AI kết hợp gọi tool lấy danh sách thành viên dự án, và gọi tool timesheet để đối chiếu ai chưa log work."
    }
]

def format_prompt(prompt: Union[str, List[str]]) -> List[str]:
    return [prompt] if isinstance(prompt, str) else prompt

# --- TEST RUNNER ---

@pytest.mark.asyncio
@pytest.mark.parametrize("test_case", TEST_CASES, ids=[tc["id"] for tc in TEST_CASES])
async def test_ai_assistant_flow(db_session, test_user, test_case):
    """
    Chạy từng test case qua LangGraph của AI Assistant.
    Yêu cầu: Chạy với cờ `-s` hoặc `--log-cli-level=INFO` để xem chi tiết prompt, tool calls, và response.
    """
    logger.info(f"\n{'='*80}")
    logger.info(f"🚀 BẮT ĐẦU TEST: {test_case['id']} - {test_case['name']} ({test_case['level']})")
    logger.info(f"🎯 EXPECTED BEHAVIOR:\n   {test_case['expected']}")
    logger.info(f"{'-'*80}")
    
    # Thread ID duy nhất cho mỗi bài test để cô lập bộ nhớ (Context/Memory)
    thread_id = f"test_e2e_{test_case['id']}_{uuid.uuid4().hex[:8]}"
    
    config = {
        "configurable": {
            "thread_id": thread_id,
            "db": db_session,
            "current_user": test_user,
            "project_id": test_case.get("project_id", None)
        }
    }
    
    prompts = format_prompt(test_case["prompt"])
    final_response = ""
    
    for step, user_input in enumerate(prompts, 1):
        if len(prompts) > 1:
            logger.info(f"\n--- BƯỚC {step}/{len(prompts)} ---")
            
        logger.info(f"🗣️ USER PROMPT: {user_input}")
        
        state = {"messages": [HumanMessage(content=user_input)]}
        
        try:
            # Chạy qua LangGraph
            async for event in project_graph.astream(state, config=config, stream_mode="values"):
                # Trong stream_mode="values", mỗi event là state mới nhất
                if "messages" in event and event["messages"]:
                    last_msg = event["messages"][-1]
                    
                    # Log tool calls nếu có
                    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
                        for tc in last_msg.tool_calls:
                            logger.info(f"🛠️  TOOL CALL: {tc['name']} (Args: {tc['args']})")
                    
                    if last_msg.type == "ai" and last_msg.content:
                        final_response = last_msg.content
                    
            logger.info(f"🤖 AI RESPONSE:\n{final_response}\n")
            
        except Exception as e:
            logger.error(f"❌ LỖI TRONG QUÁ TRÌNH CHẠY ĐỒ THỊ: {str(e)}")
            pytest.fail(f"Test crashed with error: {str(e)}")
            
    # Đoạn này thường sẽ assert dựa trên các metrics hoặc tool calls.
    # Tuy nhiên với LLM, chúng ta ghi log rõ ràng để review thủ công (hoặc dùng LLM-as-a-judge trong CI).
    # Chúng ta assert final_response không rỗng để đảm bảo pipeline không chết.
    assert final_response, "AI không trả về bất kỳ phản hồi nào."
    
    logger.info(f"✅ HOÀN THÀNH TEST: {test_case['id']}\n")
