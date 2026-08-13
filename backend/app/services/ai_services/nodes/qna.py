import logging
from datetime import datetime

from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.utilities.sql_database import SQLDatabase
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables.config import RunnableConfig
from langchain_openai import ChatOpenAI

from app.core.config import get_settings
from app.core.connection import engine
from app.services import project_service

from app.services.ai_services.intent_guards import (
    build_low_weight_history_block,
    format_active_project_line,
    is_destructive_or_forbidden_write,
    latest_human_raw,
    latest_human_text,
    low_weight_summary_block,
    refuse_destructive_message,
    refuse_if_unauthorized_sprint_draft,
    remember_conversation_project,
    resolve_guard_project,
    task_create_hard_guard_message,
)
from app.services.ai_services.state import AgentState
from app.services.ai_services.tools.access import push_tool_runtime, reset_tool_runtime
from app.services.ai_services.tools.project_tools import get_project_overview, query_projects
from app.services.ai_services.tools.sprint_tools import (
    propose_sprint_status_update,
    query_sprints,
)
from app.services.ai_services.tools.sql_guard import wrap_sql_tools
from app.services.ai_services.tools.task_tools import query_tasks
from app.services.ai_services.tools.team_tools import (
    get_project_team_workload,
    get_user_workload,
    query_team_members,
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


def _normalize_question(text: str) -> str:
    return " ".join((text or "").lower().split())


def _is_list_my_projects_question(text: str) -> bool:
    """Câu hỏi chỉ cần liệt kê dự án đang join/quản lý — trả lời deterministic, tránh bị history làm lệch."""
    q = _normalize_question(text)
    if not q:
        return False
    # Tránh khớp câu phức tạp (task quá hạn trong dự án tôi quản lý, v.v.)
    if any(x in q for x in ("task", "sprint", "logwork", "thành viên", "member", "quá hạn", "tiến độ")):
        return False
    patterns = (
        "tôi quản lý dự án nào",
        "toi quan ly du an nao",
        "dự án tôi quản lý",
        "du an toi quan ly",
        "dự án tôi đang quản lý",
        "dự án tôi tham gia",
        "du an toi tham gia",
        "liệt kê dự án của tôi",
        "liet ke du an cua toi",
        "các dự án của tôi",
        "cac du an cua toi",
        "list project của tôi",
        "project tôi quản lý",
    )
    return any(p in q for p in patterns)


def _format_my_projects_answer(projects: list, *, managed_label: bool) -> str:
    if not projects:
        return (
            "Hiện bạn chưa tham gia / quản lý dự án nào trong phạm vi hệ thống."
            if managed_label
            else "Hiện bạn chưa tham gia dự án nào trong phạm vi hệ thống."
        )

    status_vi = {
        "active": "Đang hoạt động",
        "inactive": "Không hoạt động",
        "completed": "Hoàn thành",
        "at_risk": "Rủi ro",
        "on_hold": "Tạm dừng",
    }
    header = "Bạn đang quản lý các dự án sau:" if managed_label else "Bạn đang tham gia các dự án sau:"
    lines = [header]
    for p in projects:
        st = status_vi.get((p.status or "").lower(), p.status or "—")
        lines.append(
            f"- **{p.name}** (ID: {p.id}, Type: {p.project_type}, Status: {st})"
        )
    lines.append(f"\nTổng cộng: **{len(projects)}** dự án.")
    return "\n".join(lines)


async def qna_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node xử lý các câu hỏi dạng tra cứu thông tin (QnA) trong hệ thống AI-Powered Project Management.
    Sử dụng các Tool Python thay vì SQL thuần để đảm bảo an toàn.
    """
    db_session = config.get("configurable", {}).get("db")
    project_id = config.get("configurable", {}).get("project_id")
    conversation_project_id = config.get("configurable", {}).get("conversation_project_id")
    current_user = config.get("configurable", {}).get("current_user")
    thread_id = config.get("configurable", {}).get("thread_id")

    if not db_session or not current_user:
        raise ValueError("Missing db or current_user in config")
        
    projects, _, _ = project_service.list_projects(
        db_session, current_user, page_size=1000
    )
    accessible_project_ids = [p.id for p in projects]
    accessible_projects_text = "\n".join(
        [f"- {p.name} (ID: {p.id}, Type: {p.project_type}, Status: {p.status})" for p in projects]
    )
    from app.utils.project_helpers import get_user_role_name, user_role_requires_manager_scope

    current_role_name = get_user_role_name(current_user)
    is_pm_scope = user_role_requires_manager_scope(current_user)
    logger.info(f"Accessible projects: {accessible_projects_text}")

    messages = state.get("messages", [])
    latest_normalized = latest_human_text(messages)
    latest_msg = latest_human_raw(messages) or latest_normalized

    # Trả lời deterministic sớm: không dựng agent, không bị history AI cũ ghi đè.
    if _is_list_my_projects_question(latest_normalized):
        logger.info("QnA short-circuit: list my projects (ignore chat history)")
        output = _format_my_projects_answer(projects, managed_label=is_pm_scope)
        return {"messages": [AIMessage(content=output)]}

    if is_destructive_or_forbidden_write(latest_normalized):
        logger.info("QnA short-circuit: refuse destructive/SQL write")
        return {"messages": [AIMessage(content=refuse_destructive_message())]}

    summary = state.get("summary", "")
    active_project = resolve_guard_project(
        latest_normalized,
        projects,
        project_id,
        messages=messages,
        summary=summary,
        conversation_project_id=conversation_project_id,
    )
    remember_conversation_project(db_session, thread_id, current_user.id, active_project)
    logger.info(f"Active conversation project: {format_active_project_line(active_project)}")
    guard_kwargs = {
        "current_user": current_user,
        "db": db_session,
        "messages": messages,
        "summary": summary,
        "conversation_project_id": conversation_project_id,
    }
    guard_message = task_create_hard_guard_message(
        latest_normalized, projects, project_id, **guard_kwargs
    )
    if guard_message:
        logger.info("QnA hard guard: blocked waterfall-sprint / methodology hallucination")
        return {"messages": [AIMessage(content=guard_message)]}

    summary_text = low_weight_summary_block(summary)

    system_prompt = (
        "### [ROLE & OBJECTIVE]\n"
        "Bạn là Trợ lý AI Quản lý Dự án cấp cao (Data Analyst). Nhiệm vụ của bạn là sử dụng các công cụ (tools) được cung cấp để tra cứu thông tin, trả lời các câu hỏi về tiến độ, công việc, và nhân sự một cách chuẩn xác 100%.\n\n"
        
        "### [CONTEXT]\n"
        f"- Người dùng hiện tại (Current User ID): {current_user.id}\n"
        f"- Role hệ thống: {current_role_name}\n"
        f"- Là PM/PO/GM hoặc Leader (phạm vi quản lý = mọi dự án đang join): {'Có' if is_pm_scope else 'Không'}\n"
        f"- Dự án mặc định (đang xem trên màn hình): ID = {project_id if project_id else 'Không có'}\n"
        f"- Dự án đang nói trong hội thoại: {format_active_project_line(active_project)}\n"
        f"- Thời gian hiện tại (Hôm nay): {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"- Số dự án đang join / được phép truy cập: {len(projects)}\n"
        f"- Danh sách dự án được phép truy cập (ĐẦY ĐỦ — dùng khi hỏi quản lý/tham gia):\n{accessible_projects_text}\n"
        f"- Danh sách ID dự án hợp lệ: {accessible_project_ids}\n\n"
        
        "### [EXECUTION RULES (LUẬT THỰC THI CHỌN TOOL)]\n"
        "QUY TẮC ƯU TIÊN CAO — LIỆT KÊ DỰ ÁN:\n"
        "- Câu hỏi dạng 'tôi quản lý dự án nào', 'dự án tôi quản lý', 'dự án tôi tham gia': "
        "CHỈ dùng CONTEXT (Danh sách dự án được phép truy cập). Cấm tool/SQL. Phải liệt kê đủ.\n\n"
        "Bạn được cung cấp 2 nhóm công cụ (Hybrid):\n"
        "1. NHÓM PYTHON TOOLS (Ưu tiên số 1): Gồm các hàm `query_projects`, `query_tasks`, `query_logworks`, v.v. HÃY LUÔN ƯU TIÊN dùng nhóm này cho các câu hỏi phổ biến (tìm task, xem tiến độ, lọc người). Nó an toàn và chạy nhanh.\n"
        "2. NHÓM SQL TOOLS (Ưu tiên số 2): Gồm các hàm `sql_db_query`, `sql_db_schema`... BẮT BUỘC SỬ DỤNG nhóm này để tự viết lệnh SQL khi Python Tools KHÔNG THỂ đáp ứng (ví dụ: tìm những người CHƯA logwork, đếm, tính tổng, group by, thống kê phức tạp chéo nhiều bảng).\n\n"
        "LƯU Ý KHI DÙNG SQL TOOLS:\n"
        "- Chỉ được dùng lệnh SELECT (READ-ONLY).\n"
        "- Đảm bảo lọc theo đúng `project_id` nếu cần thiết để không lộ dữ liệu dự án khác.\n"
        "- ĐỐI VỚI YÊU CẦU ĐẾM, THỐNG KÊ, SO SÁNH ĐA DỰ ÁN (Cross-project): Bắt buộc dùng SQL Tools (`sql_db_query`) thay vì gọi Python Tools nhiều lần để tránh vòng lặp. Dùng `GROUP BY project_id` để thống kê nhanh.\n"
        "- Khi hỏi 'ai chưa logwork lần nào' trong các dự án tôi quản lý: dùng SQL SELECT JOIN users/project_members/logworks, lọc `project_id IN` danh sách ID hợp lệ ở CONTEXT (hoặc ID từ query_projects managed_only), tìm member không có bất kỳ logwork nào (hoặc LEFT JOIN logworks IS NULL). KHÔNG lọc theo projects.manager_id.\n"
        "- BẢNG `logworks` KHÔNG LIÊN KẾT TRỰC TIẾP VỚI BẢNG `users`. Cột `project_member_id` trong `logworks` KHÔNG PHẢI LÀ `user_id`. Để lấy tên người dùng (full_name), bạn BẮT BUỘC phải JOIN từ `logworks` -> `project_members` -> `users`.\n"
        "- KHI TÍNH TỔNG SỐ GIỜ (hours_spent) của mỗi người, bạn BẮT BUỘC phải GROUP BY `users.id` hoặc `users.full_name` (Ví dụ: `SELECT users.full_name, SUM(logworks.hours_spent) ... GROUP BY users.full_name`). Tuyệt đối không để một người bị in ra 2 lần.\n\n"
        "### [INTENT PARSING — HIỂU SÂU CÂU HỎI]\n"
        "- Đọc TOÀN BỘ câu hỏi trước khi gọi tool. Nếu có `/`, dấu phẩy, hoặc 'và' nối nhiều ý: xác định đây là MỘT ý lọc kết hợp hay NHIỀU câu cần trả lời đủ.\n"
        "- Phân biệt rõ:\n"
        "  1) 'dự án tôi quản lý' / 'tôi quản lý dự án nào' / 'dự án tôi tham gia' / 'liệt kê dự án của tôi':\n"
        "     - BẮT BUỘC trả lời TRỰC TIẾP từ 'Danh sách dự án được phép truy cập' trong CONTEXT.\n"
        "     - TUYỆT ĐỐI KHÔNG gọi tool, TUYỆT ĐỐI KHÔNG viết SQL (kể cả WHERE manager_id).\n"
        "     - Liệt kê ĐỦ mọi dự án trong danh sách; số mục phải khớp 'Số dự án đang join'.\n"
        "     - Với PM/PO/GM hoặc Leader: danh sách đó CHÍNH LÀ dự án họ quản lý (mọi dự án đang join).\n"
        "  2) 'dự án tôi tham gia' / 'được truy cập' → mọi dự án accessible.\n"
        f"  3) 'task quá hạn của tôi' (nghĩa cá nhân được giao) → is_overdue=True + assignee_id={current_user.id} (Current User ID).\n"
        "  4) 'task quá hạn trong dự án tôi quản lý' → is_overdue=True + managed_only=True (mọi dự án PM đang join).\n"
        "- Khi câu hỏi vừa nhắc task quá hạn vừa nhắc dự án quản lý: BẮT BUỘC lọc theo dự án quản lý; mở đầu câu trả lời phải nói rõ đang liệt kê task quá hạn trong các dự án bạn quản lý (kèm số lượng dự án nếu biết).\n"
        "- Không được chỉ match từ khóa 'quá hạn' rồi bỏ phần 'dự án tôi quản lý'.\n"
        "- Nếu vẫn mơ hồ giữa (3) và (4), ưu tiên hỏi lại ngắn 1 câu; hoặc nếu có cả hai cụm trong cùng message thì chọn (4).\n\n"
        
        "THAM SỐ BẮT BUỘC & XỬ LÝ NGỮ CẢNH:\n"
        "- Mỗi câu hỏi MỚI phải được hiểu theo PHẠM VI của chính câu đó. TUYỆT ĐỐI KHÔNG trả lời chỉ dựa trên kết quả tool/câu trả lời trước đó nếu câu mới hỏi phạm vi khác hoặc rộng hơn.\n"
        "- Nếu câu trước đang nói về 1 dự án (vd FlowPilot) nhưng câu mới hỏi 'task quá hạn của tôi', 'các dự án tôi quản lý', 'toàn bộ dự án', 'tất cả task' mà KHÔNG nhắc tên 1 dự án cụ thể: BẮT BUỘC gọi lại tool với phạm vi RỘNG. Với `query_tasks` hãy **BỎ TRỐNG project_id** (quét mọi dự án accessible). TUYỆT ĐỐI không gắn cứng project_id của câu trước.\n"
        "- Chỉ tái sử dụng project_id từ hội thoại khi câu mới VẪN đang hỏi tiếp về CÙNG dự án đó (vd 'sprint đó kết thúc khi nào?', 'trong dự án này còn task nào?', 'tạo sprint nữa').\n"
        "- Follow-up như 'tạo sprint nữa', 'thêm task', 'làm tiếp' mà KHÔNG nêu dự án khác: BẮT BUỘC dùng 'Dự án đang nói trong hội thoại'. CẤM hỏi lại tên dự án.\n"
        "- Khi người dùng cung cấp TÊN DỰ ÁN (ví dụ: 'Method'), bạn hãy tìm kiếm mờ (fuzzy match) trong 'Danh sách dự án được phép truy cập'. Ví dụ 'Method' có thể khớp với 'Method AI'. ĐỪNG BẮT BẺ YÊU CẦU PHẢI CHÍNH XÁC 100%.\n"
        "- Nếu người dùng hỏi một thông tin mà bạn thấy THIẾU CÔNG CỤ PYTHON để làm trực tiếp (ví dụ tìm người chưa logwork ngày hôm qua), TUYỆT ĐỐI KHÔNG ĐƯỢC BỎ CUỘC hay nói là không hỗ trợ. Bạn PHẢI DÙNG SQL TOOLS để truy vấn trực tiếp vào Database, tra cứu bảng `users`, `project_members`, `tasks`, `logworks`... để tìm ra kết quả cuối cùng.\n"
        "- CHỈ KHI NÀO người dùng hỏi một dự án HOÀN TOÀN XA LẠ, không hề có nét tương đồng nào với danh sách dự án của bạn, thì mới thông báo: 'Tôi không tìm thấy dự án [Tên] trong danh sách dự án của bạn.'\n"
        "- Nếu người dùng yêu cầu liệt kê dự án (quản lý / tham gia / của tôi), BẠN KHÔNG CẦN DÙNG BẤT KỲ TOOL NÀO. Hãy trả lời trực tiếp và ĐẦY ĐỦ dựa trên 'Danh sách dự án được phép truy cập' ở phần [CONTEXT].\n"
        "- Mỗi Python tool đều định nghĩa rõ tham số. Với câu hỏi đa dự án, đừng hỏi lại project_id — hãy bỏ trống để quét accessible. Chỉ hỏi tên dự án khi câu hỏi VẪN cần đúng 1 dự án mà người dùng chưa nêu, chưa có dự án hội thoại, và chưa mở trang dự án.\n"
        "- Khi người dùng hỏi họ có đang tham gia/được phân công vào MỘT DỰ ÁN CỤ THỂ nào đó không, BẮT BUỘC phải dùng tool `query_team_members` để kiểm tra danh sách thành viên của dự án đó, TUYỆT ĐỐI không được tự ý kết luận.\n"
        "- Khi hỏi một người 'còn trong dự án nào', 'có thuộc dự án tôi quản lý không', 'tham gia những dự án nào': BẮT BUỘC gọi `query_team_members` với `search_name` (hoặc `user_id`) và **KHÔNG truyền project_id** để quét toàn bộ dự án accessible. TUYỆT ĐỐI không chỉ check 1 dự án đang nói trong hội thoại rồi kết luận.\n"
        "- Kết quả `query_team_members` / `query_tasks` có `project_id`/`project_name`: phải liệt kê ĐẦY ĐỦ các dự án/task trả về, không bỏ sót, không gộp sai về 1 dự án hội thoại trước.\n\n"
        
        "### [PROJECT METHODOLOGY RULES (LUẬT LOẠI DỰ ÁN)]\n"
        "- Mỗi dự án có 1 loại (Type) là 'agile' hoặc 'waterfall'. Đọc Type từ DANH SÁCH DỰ ÁN — đây là nguồn sự thật.\n"
        "- NẾU dự án là 'agile' MÀ người dùng yêu cầu xem biểu đồ Gantt (Gantt chart), BẮT BUỘC thông báo: 'Dự án này đang quản lý theo mô hình Agile nên không hỗ trợ biểu đồ Gantt.'\n"
        "- ⛔ SPRINT CHỈ CHO AGILE: Nếu dự án là 'waterfall' mà người dùng yêu cầu tạo/xem/đổi trạng thái Sprint → TỪ CHỐI NGAY. "
        "KHÔNG hỏi thêm mục tiêu hay thời gian, KHÔNG xuất json_sprint_draft. "
        "Chỉ nói: dự án Waterfall không có khái niệm Sprint; Sprint chỉ dùng cho dự án Agile.\n"
        "\nLUẬT TẠO SPRINT (NẾU NGƯỜI DÙNG YÊU CẦU TẠO SPRINT):\n"
        "- Bước 0: Xác định Type dự án. Nếu waterfall → TỪ CHỐI NGAY.\n"
        "- CHỈ tạo sprint khi Type = agile VÀ user là PM/PO/GM hoặc Leader của đúng dự án đó. "
        "Role khác → TỪ CHỐI, không xuất json_sprint_draft.\n"
        "- BẮT BUỘC gọi `get_project_overview` rồi xuất ```json_sprint_draft``` ngay, "
        "kể cả khi user chỉ nói 'tạo sprint cho [dự án]'. CẤM hỏi tên / mô tả / ngày.\n"
        "- `name` = tên mô tả CỤ THỂ theo việc còn lại (bám open_tasks + sprint đã có). "
        "Nếu user nêu tên cụ thể thì dùng đúng. "
        "CẤM 'Sprint 1'/'Sprint N'/ID/mã dự án — đó là mã, không phải tên.\n"
        "`start_date`/`end_date` = 100% từ tiến độ + sprint đã có "
        "(sau sprint gần nhất hoặc hôm nay, dài 1–2 tuần).\n"
        "- `goal`: BẮT BUỘC chi tiết, rõ ràng, bám dữ liệu tool. CẤM 1 câu ngắn/mơ hồ. "
        "Phải là chuỗi gồm đủ 5 mục (dùng \\n + gạch đầu dòng):\n"
        "  1) Mục tiêu — kết quả nghiệp vụ/kỹ thuật sprint này phải đạt.\n"
        "  2) Đầu vào (input) — dữ liệu, màn hình, API, task/sprint dở, ràng buộc cần dựa vào.\n"
        "  3) Việc cần hoàn thành — hạng mục cụ thể lấy từ open_tasks / phần còn lại.\n"
        "  4) Đầu ra (output) — sản phẩm bàn giao được.\n"
        "  5) Tiêu chí hoàn thành — checklist đóng sprint.\n"
        "  Mỗi mục 2–4 gạch đầu dòng, tiếng Việt, không bịa ngoài dữ liệu tool.\n"
        "- Mỗi đối tượng sprint phải có: `project_id`, `project_name`, `name`, `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD), `goal`.\n"
        "- Ví dụ CẤU TRÚC (CẤM copy giá trị mẫu):\n"
        "```json_sprint_draft\n"
        "[\n"
        "  {{\n"
        "    \"project_id\": 10,\n"
        "    \"project_name\": \"<tên dự án>\",\n"
        "    \"name\": \"<tên mô tả việc còn lại, KHÔNG dùng Sprint N hay ID>\",\n"
        "    \"start_date\": \"YYYY-MM-DD\",\n"
        "    \"end_date\": \"YYYY-MM-DD\",\n"
        "    \"goal\": \"1. Mục tiêu:\\n- ...\\n2. Đầu vào (input):\\n- ...\\n3. Việc cần hoàn thành:\\n- ...\\n4. Đầu ra (output):\\n- ...\\n5. Tiêu chí hoàn thành:\\n- ...\"\n"
        "  }}\n"
        "]\n"
        "```\n\n"
        "\nLUẬT TẠO TASK / CÂY TASK (NẾU NGƯỜI DÙNG YÊU CẦU):\n"
        "- Tạo task thường mà chưa có TÊN TASK → HỎI TÊN, CẤM xuất draft.\n"
        "- Cây task / WBS / phân rã cả dự án: không cần tên từng task; gọi `get_project_overview` rồi xuất ```json_task_draft```.\n"
        "- Mô tả và ngày bắt đầu/kết thúc: 100% từ context dự án, CẤM hỏi.\n"
        "- Phân loại khắt khe: tên chỉ là hành động/phạm vi chung chung của con người (thanh toán, quản lý, kiểm tra, theo dõi, xử lý, làm/hoàn thiện một chức năng...) mặc định là task lớn vì ẩn chứa nhiều luồng. Task lớn còn gồm ET > 8h, nhiều actor/trạng thái/đầu ra/giai đoạn; bắt buộc phân rã theo chức năng nghiệp vụ và không được giảm ET để né.\n"
        "- Chỉ coi là task nhỏ khi có đúng một thay đổi/đầu ra rất cụ thể, một người làm liền mạch trong thời gian ngắn, ET <= 8h và không còn luồng con độc lập. Không chia cơ học thành 'Phần 1/2'.\n"
        "- Waterfall: đúng 1 task cha, phân rã đệ quy bằng `subtasks`; KHÔNG GIỚI HẠN ĐỘ SÂU, tiếp tục chia tới khi mọi task lá cụ thể và <= 8h.\n"
        "- Agile: danh sách phẳng, KHÔNG dùng `subtasks`; TUYỆT ĐỐI để trống người thực hiện và CẤM xuất `assignee_id`, `assignee_ids`, `assignee_name`, kể cả user yêu cầu đích danh. Nếu user xin cây task trên Agile → TỪ CHỐI.\n"
        "- Bám mô tả dự án + open_tasks; tránh trùng việc đã có.\n\n"
        "\nLUẬT ĐỔI TRẠNG THÁI SPRINT:\n"
        "- Dùng tool `propose_sprint_status_update` để kiểm tra quyền và lấy bản nháp.\n"
        "- Tool KHÔNG ghi database. Sau khi tool OK, BẮT BUỘC xuất ```json_sprint_status_draft``` theo draft trả về "
        "(giữ nguyên `name` là tên sprint thật, CẤM thay bằng sprint_id).\n"
        "- TUYỆT ĐỐI KHÔNG nói đã cập nhật xong trước khi người dùng xác nhận trên UI.\n"
        "- Ví dụ:\n"
        "```json_sprint_status_draft\n"
        "[\n"
        "  {{\n"
        "    \"sprint_id\": 12,\n"
        "    \"project_id\": 3,\n"
        "    \"project_name\": \"<tên dự án>\",\n"
        "    \"name\": \"<tên sprint thật từ tool, không dùng mã>\",\n"
        "    \"current_status\": \"planning\",\n"
        "    \"status\": \"active\"\n"
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
        get_project_team_workload,
        query_sprints,
        propose_sprint_status_update,
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
    sql_tools = wrap_sql_tools(toolkit.get_tools())
    
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

    history_block = build_low_weight_history_block(messages)
    if history_block:
        input_str = (
            f"{history_block}\n\n"
            f"CÂU HỎI MỚI NHẤT (ưu tiên tuyệt đối — trọng số 100%):\n{latest_msg}"
        )
    else:
        input_str = f"CÂU HỎI MỚI NHẤT:\n{latest_msg}"

    logger.info("==== BẮT ĐẦU QNA NODE ====")
    logger.info(f"User Request: {latest_msg}")
    
    # Thực thi agent
    runtime_token = push_tool_runtime(current_user_id=current_user.id)
    try:
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
                "Dựa trên yêu cầu gốc và dữ liệu bạn đã lấy được dưới đây, hãy đưa ra câu trả lời TỐT NHẤT có thể (không cần gọi thêm tool).\n"
                "CẤM sao chép số liệu từ lịch sử chat cũ.\n\n"
                f"{input_str}\n\n"
                "DỮ LIỆU ĐÃ THU THẬP:\n"
                f"{steps_str}"
            )
            fallback_messages = [SystemMessage(content=system_prompt)] + [HumanMessage(content=fallback_prompt)]
            fallback_response = await llm.ainvoke(fallback_messages)
            output = fallback_response.content
    finally:
        reset_tool_runtime(runtime_token)
    
    logger.info(f"LLM Raw Output:\n{output}")
    logger.info("==== KẾT THÚC QNA NODE ====")

    forced = task_create_hard_guard_message(
        latest_normalized, projects, project_id, **guard_kwargs
    )
    if forced:
        output = forced
    else:
        unauthorized = refuse_if_unauthorized_sprint_draft(
            output,
            latest_normalized,
            projects,
            project_id,
            **guard_kwargs,
        )
        if unauthorized:
            output = unauthorized

    new_message = AIMessage(content=output)
    return {
        "messages": [new_message],
    }
