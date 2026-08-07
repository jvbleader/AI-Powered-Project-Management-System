import pytest
import asyncio
import uuid
import logging
from typing import List, Dict, Union

from langchain_core.messages import HumanMessage

from app.core.connection import SessionLocal
from app.models.user_model import User
from app.models.department_model import Department, Team
from app.models.project_model import Role
from app.services.ai_services.graph import builder
from langgraph.checkpoint.memory import MemorySaver

# Use MemorySaver for tests to avoid Redis asyncio event loop issues
project_graph = builder.compile(checkpointer=MemorySaver())

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

logger = logging.getLogger("AI_QNA_TEST")
logger.setLevel(logging.INFO)
if logger.hasHandlers():
    logger.handlers.clear()

ch = logging.StreamHandler()
ch.setFormatter(ColorLogFormatter("%(message)s"))
logger.addHandler(ch)

# --- FIXTURES ---

@pytest.fixture(scope="module")
def event_loop():
    """Create an instance of the default event loop for the whole module."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def test_user(db_session):
    user = db_session.query(User).first()
    if not user:
        pytest.skip("No users found in database to run tests.")
    return user


# --- TEST CASES DEFINITION ---

TEST_CASES = [
    {
        "id": "TC01_QNA_EASY",
        "name": "Hỏi đáp cơ bản (Dễ)",
        "level": "CẤP ĐỘ DỄ",
        "prompt": "Dự án Chấm có bao nhiêu thành viên? Xin hãy liệt kê tên của họ.",
        "expected": "AI gọi tool get_project_members hoặc query_team_members, sau đó đếm và liệt kê danh sách tên thành viên."
    },
    {
        "id": "TC02_QNA_MEDIUM",
        "name": "Lọc Task theo trạng thái (Trung bình)",
        "level": "CẤP ĐỘ TRUNG BÌNH",
        "prompt": "Liệt kê cho tôi tất cả các task đang ở trạng thái 'In Progress' trong dự án Chấm.",
        "expected": "AI gọi tool query_tasks với bộ lọc dự án và trạng thái In Progress, sau đó trả về danh sách task rõ ràng."
    },
    {
        "id": "TC03_QNA_HARD",
        "name": "Thống kê và so sánh (Khó)",
        "level": "CẤP ĐỘ KHÓ",
        "prompt": "Ai đang ôm nhiều việc nhất (nhiều task nhất) trong dự án Chấm?",
        "expected": "AI gọi tool get_user_workload hoặc query_tasks, sau đó dùng khả năng reasoning của LLM để đếm số lượng task của từng người và tìm ra người cao nhất."
    },
    {
        "id": "TC04_QNA_VERY_HARD",
        "name": "Tra cứu Logworks và tính toán (Rất Khó)",
        "level": "CẤP ĐỘ RẤT KHÓ",
        "prompt": "Trong dự án Chấm, hãy kiểm tra nhật ký làm việc (logworks) và cho tôi biết ai là người log nhiều giờ nhất trong 7 ngày qua?",
        "expected": "AI gọi tool query_logworks với tham số ngày, tính tổng số giờ (spent_hours) nhóm theo user_id/người, sau đó đối chiếu tên và trả kết quả."
    },
    {
        "id": "TC05_QNA_MULTISTEP",
        "name": "Suy luận đa bước (Siêu Khó)",
        "level": "SIÊU KHÓ",
        "prompt": "Hãy tìm người quản trị (Manager/Owner) của dự án Chấm, sau đó kiểm tra xem người đó đang trực tiếp làm bao nhiêu task ở trạng thái To Do.",
        "expected": "AI thực hiện nhiều bước: 1. query_projects để tìm người quản trị. 2. query_tasks với user_id vừa tìm được và status To Do."
    }
]

def format_prompt(prompt: Union[str, List[str]]) -> List[str]:
    return [prompt] if isinstance(prompt, str) else prompt

# --- TEST RUNNER ---

pytestmark = pytest.mark.asyncio(loop_scope="module")

@pytest.mark.parametrize("test_case", TEST_CASES, ids=[tc["id"] for tc in TEST_CASES])
async def test_ai_qna_flow(db_session, test_user, test_case):
    """
    Chạy từng test case Hỏi Đáp (Q&A) qua LangGraph của AI Assistant.
    Yêu cầu: Chạy bằng lệnh: pytest tests/test_ai_qna_e2e.py -s -v --log-cli-level=INFO
    """
    logger.info(f"\n{'='*80}")
    logger.info(f"🚀 BẮT ĐẦU TEST: {test_case['id']} - {test_case['name']} ({test_case['level']})")
    logger.info(f"🎯 EXPECTED BEHAVIOR:\n   {test_case['expected']}")
    logger.info(f"{'-'*80}")
    
    thread_id = f"test_qna_{test_case['id']}_{uuid.uuid4().hex[:8]}"
    
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
            async for event in project_graph.astream(state, config=config, stream_mode="values"):
                if "messages" in event and event["messages"]:
                    last_msg = event["messages"][-1]
                    
                    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
                        for tc in last_msg.tool_calls:
                            logger.info(f"🛠️  TOOL CALL: {tc['name']} (Args: {tc['args']})")
                    
                    if last_msg.type == "ai" and last_msg.content:
                        final_response = last_msg.content
                    
            logger.info(f"🤖 AI RESPONSE:\n{final_response}\n")
            
        except Exception as e:
            logger.error(f"❌ LỖI TRONG QUÁ TRÌNH CHẠY ĐỒ THỊ: {str(e)}")
            pytest.fail(f"Test crashed with error: {str(e)}")
            
    assert final_response, "AI không trả về bất kỳ phản hồi nào."
