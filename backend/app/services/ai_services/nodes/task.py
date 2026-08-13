import json
import logging
import re
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
    is_task_creation_followup,
    is_underspecified_task_create,
    latest_human_text,
    looks_like_task_create,
    low_weight_summary_block,
    refuse_destructive_message,
    refuse_if_unauthorized_sprint_draft,
    remember_conversation_project,
    resolve_guard_project,
    task_create_hard_guard_message,
)
from app.services.ai_services.state import AgentState
from app.services.ai_services.task_draft_structure import (
    normalize_task_draft_for_project_types,
    preserve_task_draft_structure,
)
from app.services.ai_services.task_title_rules import (
    find_non_meaningful_task_titles,
    format_task_title_issues,
)
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

async def task_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node xử lý các yêu cầu liên quan đến tạo mới và phân công công việc (Task Assignment).
    Sử dụng Python Tools thay vì SQL thuần.
    """
    db_session = config.get("configurable", {}).get("db")
    project_id = config.get("configurable", {}).get("project_id")
    conversation_project_id = config.get("configurable", {}).get("conversation_project_id")
    current_user = config.get("configurable", {}).get("current_user")
    thread_id = config.get("configurable", {}).get("thread_id")

    if not db_session or not current_user:
        raise ValueError("Missing db or current_user in config")

    latest_preview = latest_human_text(state.get("messages"))
    if is_destructive_or_forbidden_write(latest_preview):
        logger.info("Task node refuse: destructive/SQL write intent")
        return {"messages": [AIMessage(content=refuse_destructive_message())]}

    projects, _, _ = project_service.list_projects(
        db_session, current_user, page_size=1000
    )
    messages = state.get("messages")
    summary = state.get("summary", "")
    active_project = resolve_guard_project(
        latest_preview,
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
        latest_preview, projects, project_id, **guard_kwargs
    )
    if guard_message:
        logger.info("Task node hard guard: blocked create-task hallucination")
        return {"messages": [AIMessage(content=guard_message)]}

    accessible_projects_text = "\n".join([f"- {p.name} (ID: {p.id}, Type: {p.project_type})" for p in projects])
    project_type_map = {p.id: p.project_type.lower() for p in projects}
    project_names = [p.name for p in projects]
    task_name_supplied = (
        looks_like_task_create(latest_preview)
        and not is_underspecified_task_create(latest_preview, project_names)
    ) or is_task_creation_followup(messages)

    summary_text = low_weight_summary_block(summary)

    system_prompt = (
        "Bạn là Trợ lý AI Giao việc (Task Delegation Agent) chuyên nghiệp.\n\n"
        "NHIỆM VỤ CỐT LÕI:\n"
        "- Phân tích yêu cầu của người dùng rồi lập BẢN NHÁP (json_task_draft / json_sprint_draft) để người dùng xem và xác nhận trên UI.\n"
        "- Khi người dùng yêu cầu tạo sprint / tạo task / cây task / phân rã / lên kế hoạch:\n"
        "  + TẠO SPRINT: chỉ PM/PO/GM hoặc Leader CỦA ĐÚNG DỰ ÁN đó được tạo. "
        "Nếu user không thuộc các role này → TỪ CHỐI, không xuất json_sprint_draft. "
        "Kể cả câu chung như 'tạo sprint cho [dự án]' (khi ĐỦ quyền) → KHÔNG hỏi tên; "
        "đọc tiến độ + sprint đã có, đặt TÊN SPRINT MÔ TẢ CỤ THỂ theo việc còn lại, rồi XUẤT json_sprint_draft ngay.\n"
        "  + TẠO TASK THƯỜNG mà chưa nêu TÊN TASK → HỎI TÊN, DỪNG, CẤM xuất draft "
        "(cây task / WBS / phân rã cả dự án thì không cần tên từng task).\n"
        "  + MÔ TẢ / NGÀY → CẤM hỏi. BẮT BUỘC đọc dự án bằng tool rồi điền `description`/`goal`, "
        "`start_date`, `end_date`, `deadline` ĐÚNG 100% theo context dự án tại thời điểm đó "
        "(mô tả dự án, lịch dự án, sprint hiện có, việc còn lại). Không bịa ngày, không bịa mô tả ngoài dữ liệu tool.\n"
        "- QUY TRÌNH ĐỌC CONTEXT (bắt buộc trước khi xuất draft, theo thứ tự):\n"
        "  1) `get_project_overview(project_id)` — mô tả dự án, tiến độ, task chưa xong, sprint hiện có.\n"
        "  2) `query_tasks(project_id=...)` nếu cần thêm chi tiết việc đã/đang làm.\n"
        "  3) `query_sprints(project_id=...)` khi lập sprint (chỉ Agile).\n"
        "  4) CHỈ VỚI WATERFALL: `get_project_team_workload(project_id)` BẮT BUỘC trước khi gán người "
        "(workload + lịch start/deadline từng thành viên). Với Agile, CẤM gán người nên không gọi workload để phân công.\n"
        "- Nguồn sự thật để soạn draft: tên task (user nêu) / tên sprint (user nêu, hoặc đặt tên mô tả việc còn lại — CẤM 'Sprint N'/ID) + mô tả/ngày từ tool. "
        "KHÔNG bịa module/tính năng không có trong dự án. Tránh trùng việc chưa xong. Tập trung phần còn lại.\n"
        "- Cũng hỏi lại khi KHÔNG xác định được dự án nào (không có tên trong câu mới, không có dự án hội thoại, không có dự án đang xem).\n"
        "- ⛔ NGUỒN SỰ THẬT: Chỉ bám YÊU CẦU MỚI NHẤT + dữ liệu tool. CẤM copy checklist/bản nháp từ lịch sử chat.\n"
        "- BẮT BUỘC dùng tool để đọc dự án trước khi xuất draft.\n\n"
        "HƯỚNG DẪN CHỌN CÔNG CỤ (HYBRID):\n"
        "- NHÓM 1: PYTHON TOOLS (Ưu tiên): Luôn ưu tiên dùng các hàm như `get_project_members`, `get_user_workload`... vì an toàn và có sẵn.\n"
        "- NHÓM 2: SQL TOOLS (Chỉ dùng khi cần): Dùng `sql_db_query` để viết SQL thuần nếu Nhóm 1 không đáp ứng được yêu cầu thống kê phức tạp.\n\n"
        f"1. Người dùng hiện tại có ID là: {current_user.id}.\n"
        f"2. DỰ ÁN MẶC ĐỊNH (đang xem trên màn hình): ID = {project_id if project_id else 'Không có'}.\n"
        f"3. DỰ ÁN ĐANG NÓI TRONG HỘI THOẠI: {format_active_project_line(active_project)}.\n"
        f"4. THỜI GIAN HIỆN TẠI (Hôm nay): {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}.\n\n"
        "===========================================================\n"
        f"DANH SÁCH CÁC DỰ ÁN NGƯỜI DÙNG CÓ THỂ TRUY CẬP:\n{accessible_projects_text}\n"
        "===========================================================\n"
        "LUẬT DÙNG TOOL VÀ THAM SỐ BẮT BUỘC:\n"
        "- Mỗi tool đều định nghĩa rõ tham số nào là (BẮT BUỘC). Nếu thiếu tham số bắt buộc (ví dụ `user_id`), BẠN KHÔNG ĐƯỢC ĐOÁN MÒ.\n"
        "- ĐỐI VỚI PROJECT_ID: Chỉ tái dùng project từ hội thoại khi câu mới VẪN hỏi về CÙNG dự án. Nếu câu mới nói 'các dự án', 'tất cả', 'của tôi quản lý' mà không chỉ định 1 tên dự án → BỎ TRỐNG project_id khi gọi `query_tasks` / `query_team_members` để quét accessible. KHÔNG được gắn cứng dự án câu trước.\n"
        "- NẾU câu mới là follow-up cùng một dự án ('tạo sprint nữa', 'thêm task', 'làm tiếp', 'sprint đó', 'trong dự án này') mà KHÔNG nêu dự án khác: BẮT BUỘC dùng DỰ ÁN ĐANG NÓI TRONG HỘI THOẠI (rồi mới tới dự án đang xem trên màn hình). CẤM hỏi lại 'dự án nào'.\n"
        "- CHỈ hỏi lại tên dự án khi chưa có DỰ ÁN ĐANG NÓI TRONG HỘI THOẠI, chưa có dự án trên màn hình, và câu mới cũng không nêu tên.\n\n"
        "### [PROJECT METHODOLOGY RULES (LUẬT LOẠI DỰ ÁN)]\n"
        "- Mỗi dự án có 1 loại (Type) là 'agile' hoặc 'waterfall'. Đọc Type từ DANH SÁCH DỰ ÁN ở trên — đây là nguồn sự thật.\n"
        "- NẾU dự án là 'agile' MÀ người dùng yêu cầu xem biểu đồ Gantt (Gantt chart), BẮT BUỘC thông báo: 'Dự án này đang quản lý theo mô hình Agile nên không hỗ trợ biểu đồ Gantt.'\n"
        "- ⛔ SPRINT CHỈ CHO AGILE: Nếu dự án là 'waterfall' mà người dùng yêu cầu tạo/xem/đổi trạng thái Sprint → TỪ CHỐI NGAY. "
        "KHÔNG hỏi thêm mục tiêu hay thời gian, KHÔNG xuất json_sprint_draft. "
        "Chỉ nói: dự án Waterfall không có khái niệm Sprint; Sprint chỉ dùng cho dự án Agile.\n"
        "- ⛔ CÂY TASK / WBS: CHỈ được tạo cho dự án WATERFALL. Nếu người dùng nói 'cây task', 'task tree', 'WBS', 'cấu trúc cây' với dự án AGILE → TỪ CHỐI, KHÔNG xuất json_task_draft, KHÔNG chuyển thành danh sách phẳng giả cây. Chỉ nói ngắn: dự án Agile không hỗ trợ cây task, cấu trúc cha-con chỉ dùng cho Waterfall.\n\n"
        "### [QUY TẮC ĐÁNH GIÁ KÍCH THƯỚC TASK VÀ PHÂN RÃ (BREAKDOWN)]\n"
        "- PHẢI PHÂN LOẠI KHẮT KHE THEO NGỮ NGHĨA, KHÔNG tin mù quáng ET do chính bạn vừa ước lượng.\n"
        "- MẶC ĐỊNH LÀ TASK LỚN nếu tên user chỉ mô tả một hành động/phạm vi chung chung của con người mà chưa chỉ ra đầu ra cụ thể, "
        "ví dụ: 'thanh toán bằng VNPAY', 'quản lý khách hàng', 'kiểm tra hệ thống', 'theo dõi tiến độ', 'xử lý đơn hàng', "
        "'làm đăng nhập', 'hoàn thiện báo cáo'. Những câu này ẩn chứa nhiều bước/luồng nên BẮT BUỘC đọc context rồi phân rã.\n"
        "- TASK LỚN còn bao gồm: ET > 8 giờ; có từ hai đầu ra độc lập; nhiều actor/trạng thái/nhánh thành công-thất bại; "
        "nhiều giai đoạn có thể nghiệm thu riêng; hoặc tiêu đề gộp nhiều hành động/phạm vi. Không được cố tình ghi ET <= 8 để né phân rã.\n"
        "- CHỈ LÀ TASK NHỎ khi đồng thời thỏa TẤT CẢ: phạm vi rất cụ thể; chỉ một thay đổi/đầu ra nghiệm thu được; "
        "một người có thể làm liền mạch trong thời gian ngắn và ET <= 8 giờ; không còn luồng con độc lập hợp lý. "
        "Ví dụ: 'Code validator chữ ký callback VNPAY', 'Thêm trường mã giao dịch vào response', 'Sửa mapping trạng thái timeout'.\n"
        "- Task nhỏ thì GIỮ NGUYÊN, không chia vụn thành từng nút bấm, câu lệnh hay API lẻ không có giá trị nghiệm thu riêng.\n"
        "- Tự đánh giá dựa trên tên user + context dự án; không chờ user nói 'task lớn' hay yêu cầu break. Không chia theo số phần cơ học hoặc chỉ theo layer kỹ thuật.\n"
        "Khi task lớn cần phân rã, cấu trúc phụ thuộc vào LOẠI DỰ ÁN:\n"
        "- NẾU DỰ ÁN LÀ WATERFALL (WBS): BẮT BUỘC PHÂN RÃ THÀNH CẤU TRÚC CÂY. Tạo ĐÚNG MỘT Task Cha ở ngoài cùng, và ĐƯA TẤT CẢ các task nhỏ vừa phân rã vào trong mảng `subtasks` của Task Cha đó. "
        "KHÔNG GIỚI HẠN ĐỘ SÂU: được phép Epic -> Hạng mục -> Task -> Subtask -> ... bao nhiêu cấp cũng được; tiếp tục phân rã đệ quy cho tới khi mọi task lá đều cụ thể, nghiệm thu được và <= 8 giờ.\n"
        "- NẾU DỰ ÁN LÀ AGILE: KHÔNG ĐƯỢC DÙNG CẤU TRÚC CÂY (Không dùng `subtasks`). Mọi task sau khi phân rã phải là một danh sách phẳng (flat list) gồm các task độc lập, ngang hàng nhau (như User Story/Task trong Backlog).\n\n"
        "QUY TRÌNH TẠO TASK BẰNG LỆNH JSON_TASK_DRAFT:\n"
        "Bước 0: Nếu là TẠO TASK THƯỜNG mà chưa có TÊN TASK → HỎI TÊN, DỪNG, CẤM xuất json_task_draft. "
        "Ngoại lệ: cây task / WBS / phân rã cả dự án thì không cần tên từng task. "
        "Khi đã có tên (hoặc là cây cả dự án): gọi `get_project_overview`, "
        "điền mô tả + start_date/deadline 100% từ context dự án. CẤM hỏi ngày hay mô tả.\n"
        "Bước 1: Đánh giá task to hay nhỏ, xác định Project Type từ overview/danh sách dự án.\n"
        "Bước 2: Phân công người phụ trách (assignee):\n"
        "   - ⛔ NẾU DỰ ÁN LÀ AGILE: TUYỆT ĐỐI KHÔNG PHÂN CÔNG BẤT KỲ AI, kể cả khi user yêu cầu đích danh. "
        "CẤM xuất `assignee_id`, `assignee_ids`, `assignee_name`; người thực hiện phải để trống để phân công trong Sprint/Backlog sau.\n"
        "   - CHỈ NẾU DỰ ÁN LÀ WATERFALL: gọi `get_project_team_workload(project_id)` trước khi gán. Không đoán workload.\n"
        "   - Chọn người theo: vai trò phù hợp + workload hiện tại thấp (ít task mở, ít `open_estimated_hours`) "
        "+ lịch `busy_windows` KHÔNG chồng với start_date–deadline của task mới.\n"
        "   - ⛔ CẤM CHỒNG LỊCH: Không gán task mới cho người đang có task todo/in_progress "
        "mà khoảng [start_date, deadline] GIAO NHAU với task mới. "
        "Hai khoảng [A,B] và [C,D] chồng khi A <= D và C <= B. "
        "Nếu mọi người đều bận trong cửa sổ đó: DỜI start_date/deadline task mới sang khoảng trống gần nhất "
        "(vẫn bám lịch dự án), KHÔNG chồng lên việc họ đang làm. "
        "Trong CÙNG bản nháp, cũng không gán 2 task mới cho cùng 1 người với lịch chồng nhau.\n"
        "   - TASK NẶNG (ET lớn / nhiều luồng / parent phức tạp / priority high|critical): "
        "được gán NHIỀU người cùng lúc qua `assignee_ids` (mảng user_id) và `assignee_name` (tên cách nhau bằng dấu phẩy). "
        "Vẫn ghi `assignee_id` = người chính (lead, thường là người rảnh nhất trong nhóm được chọn). "
        "Mỗi người trong nhóm cũng phải rảnh (không chồng lịch) trong cửa sổ task đó.\n"
        "   - TASK NHẸ: gán 1 người (`assignee_id` + `assignee_name`).\n"
        "   - NẾU DỰ ÁN LÀ WATERFALL: LUÔN phải gán. Task nhẹ 1 người; task nặng có thể nhiều người. "
        "Ưu tiên người rảnh, lịch không chồng, role phù hợp (không mặc định gán hết cho user hiện tại nếu người khác rảnh hơn).\n"
        "   - `assignee_id` / từng phần tử `assignee_ids` BẮT BUỘC là `user_id` từ tool, "
        "TUYỆT ĐỐI KHÔNG dùng `project_member_id`.\n"
        "   - Khi cần biết một người thuộc những dự án nào trong scope của bạn: gọi `query_team_members(search_name=...)` **không** truyền project_id để quét mọi dự án accessible.\n"
        "   - LƯU Ý TRÙNG TÊN: Nếu người dùng yêu cầu giao task cho một người cụ thể bằng tên (VD: 'giao cho Anh'), nhưng tool `query_team_members` trả về NHIỀU người có tên giống hoặc gần giống nhau, BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý CHỌN ĐẠI. Bạn PHẢI dừng việc tạo task và HỎI LẠI người dùng để họ chọn chính xác. Hãy liệt kê danh sách những người trùng tên kèm theo vai trò (role) để người dùng dễ phân biệt.\n"
        "   - ⛔ KHI CHỈ CẬP NHẬT NGƯỜI THỰC HIỆN: Chỉ hỗ trợ với WATERFALL. Nếu bản nháp JSON đã có sẵn, BẮT BUỘC giữ NGUYÊN VẸN cấu trúc task/subtasks, title, description, estimated_hours, start_date, deadline; chỉ sửa trường assignee sau khi kiểm tra workload. Với AGILE phải từ chối phân công và giữ mọi assignee trống.\n"
        "Bước 3: LẬP LUẬN GIAO VIỆC VÀ TẠO BẢN NHÁP.\n"
        "   - Bạn ĐƯỢC PHÉP viết 1-2 câu giải thích vì sao gán người đó (workload, lịch trống, task nặng nên gán nhiều người...).\n"
        "   - Viết 1–2 câu tóm tắt những gì dự án đang có / đã làm đến đâu, rồi "
        "TRONG CÙNG MỘT CÂU TRẢ LỜI BẮT BUỘC trả về ĐÚNG MỘT khối Markdown `json_task_draft`.\n"
        "   - ⛔ LỆNH CẤM: TUYỆT ĐỐI KHÔNG được nói 'Bây giờ tôi sẽ tạo bản nháp' rồi kết thúc mà không có JSON.\n"
        "   - NGOẠI LỆ: Chỉ được hỏi lại khi tạo task thường chưa có TÊN TASK, hoặc chưa xác định được dự án — khi đó KHÔNG xuất json_task_draft. Tạo sprint thì KHÔNG hỏi tên.\n"
        "   - ⛔ CẤM tuyệt đối: Nếu người dùng yêu cầu XÓA task / xóa hết / chạy SQL ghi (UPDATE/DELETE/DROP): "
        "KHÔNG liệt kê task hiện có để 'tạo lại', KHÔNG xuất json_task_draft. Chỉ từ chối ngắn gọn.\n"
        "VÍ DỤ VỀ CẤU TRÚC JSON WATERFALL (Agile phải là danh sách phẳng và bỏ toàn bộ trường assignee):\n"
        "```json_task_draft\n"
        "[\n"
        "  {{\n"
        "    \"title\": \"Triển khai luồng thanh toán Momo cho đơn hàng B2C\",\n"
        "    \"description\": {{\n"
        "      \"objective\": \"(Mục tiêu task)\",\n"
        "      \"criteria\": \"(Tiêu chí/Điều kiện)\",\n"
        "      \"implementation\": \"(Cách làm/Hướng dẫn)\",\n"
        "      \"output\": \"(Kết quả đầu ra)\",\n"
        "      \"acceptance_criteria\": \"(Tiêu chí chấp nhận)\"\n"
        "    }},\n"
        "    \"priority\": \"high\",\n"
        "    \"assignee_id\": 123,\n"
        "    \"assignee_ids\": [123, 456],\n"
        "    \"assignee_name\": \"An, Bình\",\n"
        "    \"project_id\": 10,\n"
        "    \"type\": \"task\",\n"
        "    \"estimated_hours\": 24,\n"
        "    \"start_date\": \"YYYY-MM-DD\",\n"
        "    \"deadline\": \"YYYY-MM-DD\",\n"
        "    \"subtasks\": [ \n"
        "       {{ \n"
        "         \"title\": \"Thiết kế dữ liệu yêu cầu và kiểm tra đầu vào tạo mã QR\", \n"
        "         \"description\": {{ ... }}, \n"
        "         \"assignee_id\": 456, \n"
        "         \"assignee_name\": \"...\", \n"
        "         \"priority\": \"medium\", \n"
        "         \"estimated_hours\": 16,\n"
        "         \"subtasks\": [\n"
        "            {{ \"title\": \"Chuẩn hóa payload tạo giao dịch và chữ ký gửi Momo\", \"description\": {{ ... }}, \"estimated_hours\": 8 }},\n"
        "            {{ \"title\": \"Xử lý lỗi đầu vào và phản hồi thất bại trước khi gọi cổng thanh toán\", \"description\": {{ ... }}, \"estimated_hours\": 8 }}\n"
        "         ]\n"
        "       }},\n"
        "       {{ \"title\": \"Hiển thị mã QR và ghi nhận giao dịch chờ thanh toán\", \"description\": {{ ... }}, \"assignee_id\": 789, \"assignee_name\": \"...\", \"priority\": \"low\", \"estimated_hours\": 8 }}\n"
        "    ]\n"
        "  }}\n"
        "]\n"
        "```\n\n"
        "LUẬT TẠO TIÊU ĐỀ VÀ MÔ TẢ (CỰC KỲ QUAN TRỌNG - NẾU VI PHẠM SẼ BỊ PHẠT):\n"
        "- TUYỆT ĐỐI KHÔNG sinh ra các Task mang tính chất chung chung, lý thuyết vòng đời (VD: 'Kiểm tra tính năng', 'Xử lý lỗi', 'Phát triển chức năng', 'Phân tích yêu cầu').\n"
        "- BẮT BUỘC PHẢI CHIA NHỎ THEO CÁC CHỨC NĂNG NGHIỆP VỤ (Functional Breakdown) sát với thực tế, nhưng KHÔNG ĐƯỢC vụn vặt đến mức độ tạo nút bấm hay làm từng cái API lẻ tẻ.\n"
        "- TIÊU ĐỀ TASK PHẢI LÀ MỘT CHỨC NĂNG ĐỘC LẬP HOÀN CHỈNH, RÕ RÀNG VÀ CHUYÊN NGHIỆP.\n"
        "- TUYỆT ĐỐI KHÔNG dùng placeholder hoặc số thứ tự thay cho ngữ cảnh như: 'Task 1', 'Subtask 1', 'Sub-subtask 1.1', 'Chức năng 1', 'Hạng mục 1', 'Phần 1', 'Phần 2'.\n"
        "- KHI PHÂN RÃ TASK: mỗi task con phải có tiêu đề riêng mô tả đúng kết quả hoặc luồng xử lý của nó; KHÔNG được chỉ đổi mỗi số thứ tự.\n"
        "  + SAI (Quá chung chung): 'Tích hợp API thanh toán Momo'.\n"
        "  + SAI (Placeholder): 'Chức năng 1', 'Subtask 2', 'Xử lý webhook (Phần 1)'.\n"
        "  + SAI (Quá vụn vặt): 'Tạo UI nút bấm [Thanh toán]', 'Tạo bảng Database transactions'.\n"
        "  + ĐÚNG (Chuẩn Functional Feature): 'Xây dựng luồng tạo mã QR thanh toán Momo', 'Phát triển luồng xử lý Webhook/IPN cập nhật trạng thái đơn hàng'.\n"
        "- ĐỐI VỚI CHI TIẾT TASK (DESCRIPTION): Viết bằng tiếng Việt, ngắn gọn nhưng đủ để làm việc — như Tech Lead giao việc. Không viết lan man, không filler.\n"
        "- BẮT BUỘC trả về description DƯỚI DẠNG OBJECT JSON chứa đúng 5 key sau (mỗi key 1–3 câu hoặc vài gạch đầu dòng ngắn):\n"
        "  + `objective`: Mục tiêu cần đạt (giá trị nghiệp vụ/kỹ thuật).\n"
        "  + `criteria`: Ràng buộc, điều kiện tiên quyết, trường hợp biên cần xử lý.\n"
        "  + `implementation`: Các bước làm chính / hướng dẫn kỹ thuật ngắn.\n"
        "  + `output`: Đầu ra bàn giao được (màn hình, dịch vụ, báo cáo…).\n"
        "  + `acceptance_criteria`: Checklist nghiệm thu ngắn (gạch đầu dòng) để QA kiểm tra.\n\n"
        "LUẬT ƯỚC TÍNH THỜI GIAN, NGÀY THÁNG VÀ BẺ NHỎ TASK (CỰC KỲ QUAN TRỌNG):\n"
        "- BẮT BUỘC cung cấp thuộc tính `estimated_hours` (kiểu số) cho TẤT CẢ task lớn nhỏ ở mọi cấp độ.\n"
        "- BẮT BUỘC cung cấp thuộc tính `start_date` và `deadline` (định dạng YYYY-MM-DD) cho TẤT CẢ task lớn nhỏ ở mọi cấp độ.\n"
        "- ĐỐI VỚI DỰ ÁN WATERFALL (TREE TASK): `start_date` của task cha PHẢI LÀ ngày bắt đầu sớm nhất của các task con, và `deadline` của task cha PHẢI LÀ ngày kết thúc muộn nhất của các task con.\n"
        "- QUY TẮC ĐÁNH GIÁ THỰC TẾ (ET HỢP LÝ): Ước lượng thời gian (ET) phải CỰC KỲ SÁT VỚI THỰC TẾ dựa trên kinh nghiệm phát triển phần mềm! Đừng mặc định gán task nào cũng 8 tiếng. Hãy phân loại thực tế: Task Dễ (1-2 tiếng), Task Trung Bình (3-5 tiếng), Task Khó (6-8 tiếng).\n"
        "- ĐỐI VỚI WATERFALL: TUYỆT ĐỐI KHÔNG giới hạn 2 cấp hay bất kỳ số cấp cố định nào. Nếu task con vẫn còn lớn/chung chung thì phải tiếp tục tạo subtasks sâu hơn, tới khi mọi lá đều đủ nhỏ và rõ ràng.\n"
        "- ⛔ LỆNH CẤM TUYỆT ĐỐI VỚI TASK LÁ (NGƯỜI THỰC THI TRỰC TIẾP): KHÔNG BAO GIỜ ĐƯỢC VƯỢT QUÁ 8 TIẾNG! \n"
        "- Nếu bạn thấy một công việc cần 10h, 12h hay 40h để hoàn thành, BẠN BẮT BUỘC PHẢI CHẺ NHỎ nó ra. \n"
        "   + Nếu là Waterfall: Chẻ thành các `subtasks` con, cháu. Task Cha có ET là TỔNG của các con nên ĐƯỢC PHÉP > 8 tiếng, nhưng nhánh lá dưới cùng phải <= 8.\n"
        "   + Nếu là Agile: Chẻ thành các task độc lập ngang hàng, mỗi task <= 8 tiếng.\n"
        "\nLUẬT TẠO SPRINT (NẾU NGƯỜI DÙNG YÊU CẦU TẠO SPRINT):\n"
        "- Bước 0 (TRƯỚC MỌI THỨ): Xác định Type dự án từ DANH SÁCH DỰ ÁN. "
        "Nếu waterfall → TỪ CHỐI NGAY, không hỏi mục tiêu/thời gian, không xuất json_sprint_draft.\n"
        "- CHỈ tạo sprint khi Type = agile VÀ user là PM/PO/GM hoặc Leader của đúng dự án đó. "
        "Role khác → TỪ CHỐI, không xuất json_sprint_draft.\n"
        "- BẮT BUỘC gọi `get_project_overview` (và `query_sprints` nếu overview chưa đủ) rồi XUẤT json_sprint_draft. "
        "Câu kiểu 'tạo sprint cho [dự án]' cũng phải ra draft ngay. CẤM hỏi tên / mô tả / ngày.\n"
        "- Các trường:\n"
        "  + `name`: TÊN MÔ TẢ CỤ THỂ theo việc còn lại / mục tiêu chu kỳ (bám mô tả dự án + open_tasks + style tên sprint đã có). "
        "Nếu user đã nêu tên cụ thể thì dùng đúng tên đó. Không trùng tên sprint hiện có.\n"
        "    CẤM tuyệt đối: 'Sprint 1', 'Sprint 4', 'Sprint N', 'SPRINT-3', mã số, sprint_id, project_id, mã dự án. "
        "Đó là mã, không phải tên.\n"
        "    ĐÚNG: 'Hoàn thiện đăng nhập và phân quyền', 'Đối soát giao dịch và hoàn tiền'.\n"
        "  + `project_name`: tên dự án (chữ, không dùng ID).\n"
        "  + `start_date` / `end_date`: 100% từ sprint đã có + lịch dự án (ưu tiên khoảng user nêu nếu có; "
        "không thì bắt đầu sau ngày kết thúc sprint gần nhất, hoặc hôm nay nếu chưa có sprint; dài 1–2 tuần, "
        "không vượt `end_date` dự án nếu có). Phải khớp dữ liệu tool, không bịa.\n"
        "  + `goal`: BẮT BUỘC là mô tả MỤC TIÊU SPRINT CHI TIẾT, rõ ràng, bám 100% dữ liệu tool "
        "(mô tả dự án + open_tasks + sprint đã có). Tập trung việc còn lại. "
        "CẤM 1 câu ngắn/mơ hồ kiểu 'ổn định quyền truy cập', 'hoàn thiện backlog', 'tiếp tục các việc còn lại'.\n"
        "    `goal` phải là MỘT chuỗi (dùng \\n) gồm ĐỦ 5 mục, mỗi mục có gạch đầu dòng cụ thể:\n"
        "    1) Mục tiêu — sprint này phải đạt kết quả nghiệp vụ/kỹ thuật gì, vì sao cần làm ngay.\n"
        "    2) Đầu vào (input) — dữ liệu, màn hình, API, sprint/task đang dở, ràng buộc lịch mà team phải dựa vào.\n"
        "    3) Việc cần hoàn thành — các hạng mục cụ thể sẽ làm trong chu kỳ (lấy từ open_tasks / phần còn lại).\n"
        "    4) Đầu ra (output) — sản phẩm bàn giao được: màn hình, luồng, API, báo cáo, trạng thái backlog…\n"
        "    5) Tiêu chí hoàn thành — checklist nghiệm thu rõ (cái gì xong thì đóng sprint được).\n"
        "    Mỗi mục ít nhất 2–4 gạch đầu dòng, viết tiếng Việt, sát dữ liệu tool, không bịa module không có trong dự án.\n"
        "- Mỗi đối tượng sprint phải có: `project_id` (số, chỉ để hệ thống), `project_name` (tên dự án), "
        "`name` (tên sprint mô tả), `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD), `goal`.\n"
        "- Viết 1–2 câu tóm tắt tiến độ rồi xuất ĐÚNG MỘT khối ```json_sprint_draft``` trong cùng câu trả lời.\n"
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
        "\nLUẬT ĐỔI TRẠNG THÁI SPRINT:\n"
        "- Dùng tool `propose_sprint_status_update` để kiểm tra quyền và lấy bản nháp.\n"
        "- Tool KHÔNG ghi database. Sau khi tool OK, BẮT BUỘC xuất ```json_sprint_status_draft``` theo draft trả về "
        "(giữ nguyên `name` là tên sprint thật, CẤM thay bằng sprint_id).\n"
        "- TUYỆT ĐỐI KHÔNG nói đã cập nhật xong trước khi người dùng xác nhận trên UI.\n"
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
        max_iterations=20, 
        handle_parsing_errors=True,
        return_intermediate_steps=True
    )
    
    messages = state.get("messages", [])
    latest_human = None
    for message in reversed(messages):
        if getattr(message, "type", None) in ("human", "user"):
            latest_human = message
            break
    latest_msg = getattr(latest_human, "content", "") if latest_human else ""

    history_block = build_low_weight_history_block(messages)
    input_parts = []
    if history_block:
        input_parts.append(history_block)
    input_parts.append(
        "YÊU CẦU MỚI NHẤT (nguồn sự thật — trọng số 100%, CẤM suy diễn từ lịch sử AI):\n"
        f"{latest_msg}"
    )
    input_str = "\n\n".join(input_parts)

    input_str += (
        "\n\n[!!! CẢNH BÁO QUAN TRỌNG TỪ HỆ THỐNG !!!]\n"
        "1. KHÔNG ĐƯỢC BẮT CHƯỚC CÂU HỎI/CHECKLIST/CẤU TRÚC PHÂN RÃ TỪ LỊCH SỬ NẾU KHÁC YÊU CẦU MỚI NHẤT!\n"
        "2. TUÂN THỦ NGHIÊM NGẶT THEO DỰ ÁN MỚI NHẤT:\n"
        "   - Nếu người dùng yêu cầu SPRINT mà dự án là Waterfall: TỪ CHỐI, không hỏi thêm, không xuất json_sprint_draft.\n"
        "   - Nếu Agile và yêu cầu tạo sprint (kể cả 'tạo sprint cho [dự án]' không có tên): "
        "ĐỌC tiến độ + sprint đã có, đặt TÊN MÔ TẢ CỤ THỂ (CẤM 'Sprint N'/ID), rồi XUẤT json_sprint_draft ngay. CẤM hỏi tên/ngày/mô tả.\n"
        "   - Nếu người dùng yêu cầu CÂY TASK/WBS mà dự án là Agile: TỪ CHỐI, không xuất json_task_draft.\n"
        "   - Nếu Agile và người dùng tạo task thường (không nói cây): nếu CHƯA có tên task → HỎI TÊN. "
        "Nếu ĐÃ có tên: ĐỌC DỰ ÁN rồi XUẤT json_task_draft danh sách phẳng, KHÔNG dùng subtasks. "
        "Mô tả và ngày lấy 100% từ context.\n"
        "   - Nếu Waterfall và yêu cầu cây task / phân rã cả dự án: ĐỌC DỰ ÁN rồi XUẤT json_task_draft CẤU TRÚC CÂY. "
        "Nếu tạo task thường mà chưa có tên → HỎI TÊN.\n"
        "3. SAU KHI ĐỌC TOOL: 1–2 câu tóm tắt tiến độ, rồi TRẢ VỀ TRỰC TIẾP KHỐI MARKDOWN JSON. "
        "CẤM liệt kê dài dạng bullet thay cho JSON.\n"
        "4. Chỉ hỏi lại khi thiếu TÊN task thường, hoặc chưa xác định được dự án (kể cả sau khi xem hội thoại). "
        "Tạo sprint thì không hỏi tên. Follow-up như 'tạo sprint nữa' phải dùng dự án đang nói. "
        "CẤM hỏi mô tả/ngày. CẤM bịa module/ngày không có trong dữ liệu tool.\n"
        "5. AGILE: tuyệt đối không gán người và không xuất bất kỳ trường assignee nào, kể cả user yêu cầu đích danh. "
        "WATERFALL: khi gán người phải gọi `get_project_team_workload` trước; task nặng được gán nhiều người (`assignee_ids`). "
        "CẤM chồng lịch với task đang làm của người đó (start–deadline giao nhau). "
        "Ưu tiên người workload thấp / lịch trống."
    )
    if task_name_supplied:
        input_str += (
            "\n6. ⛔ HARD GUARD: Người dùng ĐÃ cung cấp tên/nội dung task trong yêu cầu mới nhất. "
            "Phần nội dung đứng sau từ `task` (hoặc câu trả lời trực tiếp cho câu hỏi bổ sung task) "
            "chính là tên task. TUYỆT ĐỐI KHÔNG hỏi lại tên, không yêu cầu tên cụ thể hơn. "
            "Hãy đọc context dự án và xuất `json_task_draft` ngay."
        )

    logger.info("==== BẮT ĐẦU TASK NODE ====")
    logger.info(f"User Request: {latest_msg}")
    
    async def check_and_rebreak_tasks_with_llm(output_str: str) -> str:
        output_str = re.sub(r'([^\n])\s*```json_task_draft', r'\1\n\n```json_task_draft', output_str)
        output_str = re.sub(r'([^\n])\s*```json_sprint_draft', r'\1\n\n```json_sprint_draft', output_str)
        output_str = re.sub(r'([^\n])\s*```json_sprint_status_draft', r'\1\n\n```json_sprint_status_draft', output_str)
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
                        formatted_desc.append(f"**1. Mục tiêu:** {format_value(desc['objective'])}")
                    if "criteria" in desc:
                        formatted_desc.append(f"**2. Tiêu chí / ràng buộc:** {format_value(desc['criteria'])}")
                    if "implementation" in desc:
                        formatted_desc.append(f"**3. Cách làm:** {format_value(desc['implementation'])}")
                    if "output" in desc:
                        formatted_desc.append(f"**4. Đầu ra:** {format_value(desc['output'])}")
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
                except (TypeError, ValueError):
                    et = 0
                if (not subtasks or len(subtasks) == 0) and et > 8:
                    violating_tasks.append(f"- Task '{t.get('title', '')}': {et}H (Dự án {t_p_type.capitalize()})")
                if subtasks:
                    find_violations(subtasks, t_p_type)
                    
        find_violations(tasks, "agile")

        title_issues = find_non_meaningful_task_titles(tasks)

        if violating_tasks:
            logger.warning(f"Found tasks > 8H. Calling LLM to re-break: {violating_tasks}")
        if title_issues:
            logger.warning(f"Found generic task titles. Calling LLM to rewrite: {title_issues}")

        issue_sections = [
            "BẮT BUỘC kiểm tra lại NGỮ NGHĨA KÍCH THƯỚC của TOÀN BỘ task, kể cả task đang ghi ET <= 8H. "
            "Một tên chỉ là hành động/phạm vi chung chung của con người (như thanh toán, quản lý, kiểm tra, theo dõi, "
            "xử lý, làm/hoàn thiện một chức năng lớn) phải coi là TASK LỚN nếu chưa chỉ ra đúng một đầu ra cụ thể."
        ]
        if violating_tasks:
            issue_sections.append(
                "Các TASK LÁ (không có subtasks) sau đang vượt quá 8H:\n"
                + "\n".join(violating_tasks)
            )
        if title_issues:
            issue_sections.append(
                "Các task sau đang có tiêu đề quá chung chung hoặc mang tính placeholder:\n"
                + format_task_title_issues(title_issues)
            )

        prompt = (
            "Bản nháp JSON task của bạn đang có lỗi cần sửa:\n"
            f"{chr(10).join(issue_sections)}\n\n"
            "Hãy trả về lại TOÀN BỘ JSON DRAFT gốc, nhưng PHẢI sửa sạch toàn bộ lỗi trên.\n"
            f"- BẢN ĐỒ LOẠI DỰ ÁN (project_id -> type): {json.dumps(project_type_map, ensure_ascii=False)}.\n"
            "- CHỈ giữ task thành một task nhỏ khi nó có đúng một thay đổi/đầu ra cụ thể, một người làm liền mạch trong thời gian ngắn, ET <= 8H và không còn luồng con độc lập.\n"
            "- Với task chung chung hoặc bao gồm nhiều actor/trạng thái/nhánh/giai đoạn: bắt buộc phân rã theo đầu ra có thể nghiệm thu; không được giảm ET giả tạo để giữ nguyên.\n"
            "- Nếu task lá vượt quá 8H: bắt buộc bẻ nhỏ thành các task con có ý nghĩa theo đúng ngữ cảnh nghiệp vụ/kết quả đầu ra.\n"
            "- Nếu dự án là Waterfall: đưa task con vào `subtasks`; KHÔNG GIỚI HẠN ĐỘ SÂU và phải tiếp tục phân rã đệ quy đến khi mọi lá cụ thể, nghiệm thu được, <= 8H.\n"
            "- Nếu dự án là Agile: tách task bị lỗi thành nhiều task ngang hàng (flat), KHÔNG dùng `subtasks`.\n"
            "- Với tiêu đề task: tuyệt đối không dùng placeholder hoặc số thứ tự kiểu 'Task 1', 'Subtask 1', 'Chức năng 1', 'Phần 1'. Mỗi task phải có tiêu đề riêng mô tả đúng luồng xử lý hoặc kết quả bàn giao.\n"
            "- Giữ nguyên project_id, priority, start_date, deadline và các trường khác nếu không bắt buộc phải đổi vì phân rã lại.\n"
            "- Với Agile: danh sách phải phẳng và XÓA toàn bộ assignee_id, assignee_ids, assignee_name. Với Waterfall: giữ assignee hiện có.\n\n"
            "TRẢ VỀ ĐÚNG MỘT KHỐI MARKDOWN ```json_task_draft ... ``` CHỨA JSON, KHÔNG ĐƯỢC GIẢI THÍCH THÊM."
        )
        
        try:
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
                    except (TypeError, ValueError):
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
    runtime_token = push_tool_runtime(current_user_id=current_user.id)
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
                "Dựa trên yêu cầu gốc và dữ liệu đã lấy được dưới đây, hãy BẮT BUỘC sinh ra bản nháp JSON "
                "(json_task_draft hoặc json_sprint_draft tùy yêu cầu) tốt nhất có thể. "
                "CẤM hỏi lại thông tin.\n\n"
                f"{input_str}\n\n"
                "DỮ LIỆU ĐÃ THU THẬP:\n"
                f"{steps_str}"
            )
            fallback_messages = [SystemMessage(content=system_prompt)] + [HumanMessage(content=fallback_prompt)]
            fallback_response = await llm.ainvoke(fallback_messages)
            final_answer = fallback_response.content

        asks_for_task_name = bool(
            re.search(
                r"(cung\s*cấp|cho\s+(tôi|mình)\s+biết|đặt)\s+.*tên|"
                r"tên\s+(cụ\s*thể\s+)?(của\s+)?(task|công\s*việc)",
                final_answer,
                flags=re.IGNORECASE,
            )
        )
        if task_name_supplied and asks_for_task_name and "```json_task_draft" not in final_answer:
            logger.warning("Task name was supplied but agent asked again; retrying with hard guard")
            retry_input = (
                f"{input_str}\n\n"
                "LẦN TRẢ LỜI TRƯỚC CỦA BẠN ĐÃ HỎI LẠI TÊN TASK SAI QUY TẮC. "
                f"Yêu cầu `{latest_msg}` đã chứa tên task. "
                "BẮT BUỘC dùng tên đó, gọi tool đọc dự án và xuất json_task_draft ngay; CẤM hỏi thêm."
            )
            retry_response = await agent_executor.ainvoke(
                {"input": retry_input},
                config=config,
            )
            retry_answer = retry_response.get("output", "")
            if retry_answer:
                final_answer = retry_answer
            
        final_answer = fix_task_draft_et(final_answer)
        final_answer = await check_and_rebreak_tasks_with_llm(final_answer)
        final_answer = preserve_task_draft_structure(final_answer, messages)
        final_answer = normalize_task_draft_for_project_types(
            final_answer,
            project_type_map,
            project_id,
        )
        forced = task_create_hard_guard_message(
            latest_preview, projects, project_id, **guard_kwargs
        )
        if forced:
            final_answer = forced
        else:
            unauthorized = refuse_if_unauthorized_sprint_draft(
                final_answer,
                latest_preview,
                projects,
                project_id,
                **guard_kwargs,
            )
            if unauthorized:
                final_answer = unauthorized
        logger.info(f"LLM Raw Output:\n{final_answer}")
        logger.info("==== KẾT THÚC TASK NODE ====")

        new_message = AIMessage(content=final_answer)
        return {"messages": [new_message]}
    except Exception as e:
        logger.error(f"Error in task_node: {e}")
        raise e
    finally:
        reset_tool_runtime(runtime_token)
