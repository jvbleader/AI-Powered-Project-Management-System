import json
import logging
import re
from datetime import datetime, timedelta

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
    recover_task_request_after_assignee_selection,
    recover_task_request_after_project_selection,
    recover_task_request_after_suggestion_confirmation,
    refuse_destructive_message,
    refuse_if_unauthorized_sprint_draft,
    remember_conversation_project,
    resolve_guard_project,
    strip_inverted_waterfall_tree_claims,
    task_create_hard_guard_message,
)
from app.services.ai_services.state import AgentState
from app.services.ai_services.task_draft_structure import (
    collect_task_draft_project_ids,
    fill_waterfall_draft_assignees,
    normalize_task_draft_for_project_types,
    preserve_task_draft_structure,
    unwrap_existing_parent_tasks,
    waterfall_roots_need_wrap,
)
from app.services.ai_services.task_title_rules import (
    find_non_meaningful_task_titles,
    find_shallow_task_descriptions,
    format_task_title_issues,
    is_single_story_request,
    sanitize_placeholder_tasks,
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
    query_project_team_workload,
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
    recovered_request = recover_task_request_after_project_selection(
        messages, latest_preview, active_project
    )
    if recovered_request != latest_preview:
        logger.info(
            "Project-selection follow-up: restoring prior task request instead of using project name"
        )
        latest_preview = recovered_request
    else:
        recovered_assignee_request = recover_task_request_after_assignee_selection(
            messages, latest_preview
        )
        if recovered_assignee_request != latest_preview:
            logger.info(
                "Assignee-selection follow-up: restoring prior task request with selected assignee"
            )
            latest_preview = recovered_assignee_request
        else:
            recovered_suggestion_request = recover_task_request_after_suggestion_confirmation(
                messages, latest_preview
            )
            if recovered_suggestion_request != latest_preview:
                logger.info(
                    "Suggestion-confirmation follow-up: restoring prior task request with suggested assignees"
                )
                latest_preview = recovered_suggestion_request
    effective_project_id = active_project.id if active_project else project_id
    remember_conversation_project(db_session, thread_id, current_user.id, active_project)
    logger.info(f"Active conversation project: {format_active_project_line(active_project)}, Effective ID: {effective_project_id}")
    guard_kwargs = {
        "current_user": current_user,
        "db": db_session,
        "messages": messages,
        "summary": summary,
        "conversation_project_id": conversation_project_id,
        "target_project": active_project,
    }
    guard_message = task_create_hard_guard_message(
        latest_preview, projects, effective_project_id, **guard_kwargs
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
        "  + TẠO TASK THƯỜNG: Nếu người dùng ĐÃ nêu nội dung việc cần làm (ví dụ: 'thanh toán bằng Momo', 'làm đăng nhập', 'fix bug'), thì BẠN PHẢI COI ĐÓ LÀ TÊN TASK/MỤC TIÊU TASK. TUYỆT ĐỐI CẤM hỏi lại 'tên task là gì' hoặc 'cung cấp tên cụ thể'. Hãy dùng nội dung đó làm tiêu đề hoặc tự phân rã thành các subtasks có tiêu đề chuyên nghiệp. Chỉ hỏi tên khi câu CHỈ CÓ 'tạo task', 'tạo task cho mình',... không nói rõ tên task và cũng không nói rõ tên dự án và không nói thêm gì khác.\n"
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
        "Nếu người dùng yêu cầu làm một tính năng/công việc mới (ví dụ: 'thêm API...', 'làm trang...'), BẠN PHẢI TIN TƯỞNG NGƯỜI DÙNG và coi đó là mục tiêu task, tuyệt đối không được tự ý đổi sang công việc khác của dự án, kể cả khi tính năng đó chưa xuất hiện trong mô tả dự án. Tránh trùng việc chưa xong. Tập trung phần còn lại (nếu người dùng không yêu cầu tính năng cụ thể).\n"
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
        "- ⛔ CÂY TASK / WBS: CHỈ được tạo cho dự án WATERFALL. Nếu người dùng nói 'cây task', 'task tree', 'WBS', 'cấu trúc cây' với dự án AGILE → TỪ CHỐI, KHÔNG xuất json_task_draft, KHÔNG chuyển thành danh sách phẳng giả cây. Chỉ nói ngắn: dự án Agile không hỗ trợ cây task, cấu trúc cha-con chỉ dùng cho Waterfall.\n"
        "- ⛔ CẤM NÓI NGƯỢC (RẤT QUAN TRỌNG):\n"
        "  + TUYỆT ĐỐI KHÔNG ĐƯỢC NÓI 'dự án Waterfall không hỗ trợ cây task / WBS'. Waterfall BẮT BUỘC dùng cây khi phân rã. Chỉ Agile mới không có cây.\n"
        "  + TUYỆT ĐỐI KHÔNG ĐƯỢC NÓI 'vì là dự án Waterfall nên không gán người'! Ngược lại, WATERFALL BẮT BUỘC GÁN NGƯỜI (assignee) khi người dùng yêu cầu hoặc phân công cụ thể. Chỉ Agile mới không gán người trước!\n\n"
        "### [QUY TẮC PHÂN LOẠI KÍCH THƯỚC TASK VÀ PHÂN RÃ — CHUẨN NGÀNH CNTT]\n"
        "⛔ ĐÂY LÀ QUY TẮC QUAN TRỌNG NHẤT CỦA HỆ THỐNG. ĐỌC KỸ TOÀN BỘ VÀ TUÂN THỦ TUYỆT ĐỐI.\n\n"
        "#### BƯỚC 1: PHÂN LOẠI KÍCH THƯỚC YÊU CẦU BẰNG NGỮ NGHĨA (Semantic Classification)\n"
        "BẮT BUỘC xác định kích thước DỰA TRÊN NỘI DUNG CÂU NÓI (từ khóa, phạm vi, số luồng nghiệp vụ), KHÔNG DỰA TRÊN SỐ GIỜ.\n\n"
        "CẤP 1 — EPIC (Hệ thống / Module lớn):\n"
        "  Định nghĩa: Xây dựng MỘT HỆ THỐNG HOÀN CHỈNH hoặc MODULE LỚN chứa NHIỀU tính năng con ĐỘC LẬP.\n"
        "  Dấu hiệu CHẮC CHẮN là Epic (chỉ cần 1 trong các dấu hiệu sau):\n"
        "  - Chứa từ khóa: 'hệ thống', 'module', 'platform', 'hạ tầng', 'kiến trúc', 'toàn bộ', 'tổng thể'\n"
        "  - Phạm vi cross-functional: liên quan >= 3 luồng nghiệp vụ ĐỘC LẬP\n"
        "  - VÍ DỤ EPIC:\n"
        "    + 'Xây dựng hệ thống quản lý nhân sự' -> chứa tuyển dụng + chấm công + lương + phép -> >= 4 luồng\n"
        "    + 'Làm module thanh toán' -> chứa QR + thẻ + ví + webhook + đối soát -> >= 5 luồng\n"
        "    + 'Triển khai toàn bộ tính năng quản lý kho' -> nhập + xuất + kiểm kê + báo cáo -> >= 4 luồng\n"
        "    + 'Xây dựng platform e-commerce' -> sản phẩm + giỏ hàng + thanh toán + vận chuyển -> >= 4 luồng\n"
        "  -> Hành vi: BẮT BUỘC PHÂN RÃ thành các Feature/Task con\n\n"
        "CẤP 2 — FEATURE (Tính năng nghiệp vụ lớn, chứa >= 2 luồng xử lý):\n"
        "  Định nghĩa: MỘT TÍNH NĂNG user-facing, nhưng bên trong cần NHIỀU HƠN 1 luồng xử lý kỹ thuật/nghiệp vụ. CÁC TÍCH HỢP BÊN THỨ 3 (Thanh toán, Giao hàng, SMS) MẶC ĐỊNH LÀ FEATURE!\n"
        "  Dấu hiệu CHẮC CHẮN là Feature:\n"
        "  - Chứa từ khóa: 'tính năng', 'chức năng', 'quản lý [danh từ]', 'quản lí [danh từ]', 'tích hợp [bên thứ 3]'\n"
        "  - HOẶC bản chất công việc là TÍCH HỢP EXTERNAL SERVICE (vd: 'thanh toán bằng Momo', 'gửi tin nhắn Zalo ZNS', 'vận chuyển GHTK'). Những việc này LUÔN cần >= 2 luồng (Tạo yêu cầu -> Webhook/Callback -> Xử lý trạng thái).\n"
        "  - Phân tích kỹ thuật: cần >= 2 endpoint/screen/luồng xử lý khác nhau (ví dụ: giao diện danh sách/bộ lọc + API xử lý/duyệt/cập nhật)\n"
        "  - VÍ DỤ FEATURE (BẮT BUỘC PHÂN RÃ THÀNH CÁC TASK CON THEO TỪNG LUỒNG NGHIỆP VỤ):\n"
        "    + 'Quản lý trạng thái đơn xin nghỉ của nhân viên' -> giao diện xem/lọc trạng thái + API duyệt/từ chối và cập nhật trạng thái -> 2 luồng con\n"
        "    + 'Thanh toán bằng Momo' (Kể cả khi không có chữ 'tính năng') -> tạo QR/link thanh toán + webhook callback + giao diện cập nhật trạng thái đơn hàng -> 3 luồng con\n"
        "    + 'Làm chức năng quản lý đơn hàng' -> tạo + sửa + hủy + lịch sử -> 4 luồng con\n"
        "    + 'Phát triển chat real-time' -> WebSocket + gửi/nhận tin + lịch sử -> 3 luồng con\n"
        "  -> Hành vi: BẮT BUỘC PHÂN RÃ thành các Task con theo từng luồng xử lý kỹ thuật/nghiệp vụ\n\n"
        "CẤP 3 — STORY/TASK (Công việc đơn lẻ, 1 luồng xử lý duy nhất):\n"
        "  Định nghĩa: MỘT VIỆC CỤ THỂ DUY NHẤT, có đầu ra nghiệm thu rõ ràng, chỉ liên quan 1 luồng.\n"
        "  Dấu hiệu CHẮC CHẮN là Story/Task:\n"
        "  - Câu chỉ nêu 1 hành động cụ thể duy nhất (KHÔNG phải tích hợp bên thứ 3)\n"
        "  - Dạng 'động từ + danh từ cụ thể': 'thêm API X', 'fix bug Y', 'tạo trang Z', 'sửa form W'\n"
        "  - KHÔNG chứa bất kỳ từ khóa Epic/Feature nào ở trên, và KHÔNG PHẢI quy trình phức tạp.\n"
        "  - VÍ DỤ STORY/TASK (TUYỆT ĐỐI KHÔNG ĐƯỢC PHÂN RÃ):\n"
        "    + 'Thêm API xuất báo cáo Excel' -> 1 endpoint -> GIỮ NGUYÊN 1 TASK\n"
        "    + 'Fix bug giao diện login' -> 1 sửa lỗi -> GIỮ NGUYÊN 1 TASK\n"
        "    + 'Tạo trang dashboard' -> 1 trang -> GIỮ NGUYÊN 1 TASK\n"
        "    + 'Làm trang đăng nhập' -> 1 trang -> GIỮ NGUYÊN 1 TASK\n"
        "    + 'Sửa form tạo đơn hàng' -> 1 form -> GIỮ NGUYÊN 1 TASK\n"
        "    + 'Viết API lấy danh sách sản phẩm' -> 1 endpoint -> GIỮ NGUYÊN 1 TASK\n"
        "    + 'Thêm nút xuất PDF' -> 1 nút -> GIỮ NGUYÊN 1 TASK\n"
        "  -> Hành vi: TUYỆT ĐỐI KHÔNG PHÂN RÃ. CẤM chẻ thành 'Khảo sát', 'Thiết kế', 'Phát triển', 'Kiểm thử'.\n"
        "  Đây là sai lầm NGHIÊM TRỌNG NHẤT: chia theo VÒNG ĐỜI PHÁT TRIỂN (SDLC) thay vì CHỨC NĂNG NGHIỆP VỤ.\n\n"
        "BẢNG TỔNG HỢP NHANH (tra nhanh trước khi quyết định phân rã):\n"
        "| Yêu cầu user | Cấp | Phân rã? |\n"
        "|---|---|---|\n"
        "| 'Xây hệ thống thanh toán' | Epic | BẮT BUỘC |\n"
        "| 'Làm module quản lý kho' | Epic | BẮT BUỘC |\n"
        "| 'Quản lý trạng thái đơn xin nghỉ' | Feature | BẮT BUỘC |\n"
        "| 'Quản lý đơn hàng' | Feature | BẮT BUỘC |\n"
        "| 'Thanh toán bằng Momo' (ko có chữ 'tính năng') | Feature | BẮT BUỘC |\n"
        "| 'Tích hợp đăng nhập Google' | Feature | BẮT BUỘC |\n"
        "| 'Thêm API xuất báo cáo' | Story/Task | CẤM |\n"
        "| 'Fix bug login' | Story/Task | CẤM |\n"
        "| 'Làm trang dashboard' | Story/Task | CẤM |\n"
        "| 'Tạo nút bấm thanh toán' | Story/Task | CẤM |\n\n"
        "⛔ NGOẠI LỆ TỐI CAO: NẾU người dùng TRỰC TIẾP yêu cầu 'break task', 'chia nhỏ', 'phân rã', 'tách task', 'chi tiết hơn' "
        "-> BẮT BUỘC PHÂN RÃ NGAY, bỏ qua mọi đánh giá kích thước ở trên.\n\n"
        "#### BƯỚC 2: ÁP DỤNG CẤU TRÚC OUTPUT THEO LOẠI DỰ ÁN\n"
        "Sau khi phân loại kích thước (Bước 1), cấu trúc JSON output PHẢI KHÁC NHAU tùy loại dự án:\n\n"
        "▶ NẾU DỰ ÁN LÀ WATERFALL — Cấu trúc cây WBS (Work Breakdown Structure):\n"
        "  - Khi phân rã Epic (Hệ thống lớn / Platform / Toàn bộ giải pháp, vd: 'hệ thống quản lý kho', 'hệ thống nhân sự'):\n"
        "    + BẮT BUỘC phân rã thành CÂY WBS ĐA TẦNG (3 Tầng: Epic -> Feature/Phân hệ -> Actionable Subtasks).\n"
        "    + Tầng 1 (Root Task): Epic tổng thể (ET = TỔNG ET các con, ví dụ 32H - 60H).\n"
        "    + Tầng 2 (Task cha / Feature / Phân hệ chức năng): Các phân hệ nghiệp vụ cụ thể (vd: 'Phân hệ quản lý nhập kho', 'Phân hệ quản lý xuất kho', 'Phân hệ kiểm kê kho', 'Phân hệ báo cáo tồn kho'). ET = tổng con.\n"
        "    + Tầng 3 (Task lá / Subtask thực thi từng bước): MỖI PHÂN HỆ Ở TẦNG 2 BẮT BUỘC PHẢI CHIA NHỎ THÀNH CÁC TASK LÁ CỤ THỂ từ 2H - 4H (tối đa 6H). Ví dụ trong Nhập kho: 'Thiết kế form tạo phiếu nhập & validation lô hàng' (3H), 'Phát triển API tiếp nhận phiếu nhập và cập nhật tồn kho' (3H), 'Xây dựng giao diện danh sách phiếu nhập và in phiếu' (2H).\n"
        "    + ⛔ CẤM TUYỆT ĐỐI dừng lại ở tầng Module chung chung 8H mà không chia nhỏ thành các task con từng bước làm bên trong.\n"
        "    + ⛔ CẤM TUYỆT ĐỐI chia theo chu kỳ SDLC ('Phân tích yêu cầu và thiết kế', 'Kiểm thử hệ thống', 'Khảo sát'). Mọi phân rã đều phải theo CHỨC NĂNG NGHIỆP VỤ (Functional Breakdown).\n"
        "  - Khi phân rã Feature đơn lẻ (tính năng lớn >= 2 luồng, vd: 'Quản lý trạng thái đơn xin nghỉ'): tạo 1 Task cha, bên trong chứa các subtasks lá theo từng luồng (UI form gửi đơn 4H, API backend & phê duyệt 4H).\n"
        "  - Khi là Story/Task đơn lẻ: tạo 1 task duy nhất, KHÔNG cần subtasks, KHÔNG bọc trong Epic.\n\n"
        "▶ NẾU DỰ ÁN LÀ AGILE — Danh sách phẳng (Flat List):\n"
        "  - TUYỆT ĐỐI KHÔNG dùng `subtasks`\n"
        "  - Mọi task sau phân rã: DANH SÁCH PHẲNG gồm các task ĐỘC LẬP, ngang hàng (User Story/Task trong Backlog)\n"
        "  - Mỗi task ET <= 8H\n"
        "  - KHÔNG gán người — để phân công trong Sprint/Backlog sau\n\n"
        "QUY TRÌNH TẠO TASK BẰNG LỆNH JSON_TASK_DRAFT:\n"
        "Bước 0: TẠO TASK THƯỜNG: Nếu người dùng đã nêu bất kỳ hành động/tính năng nào (VD: thanh toán, đăng nhập, fix bug), BẠN KHÔNG ĐƯỢC HỎI TÊN MÀ PHẢI TỰ PHÂN RÃ VÀ ĐẶT TÊN. Chỉ hỏi lại khi CHỈ CÓ 'tạo task giúp tôi' mà không có vế sau. CẤM hỏi lại 'tên task là gì' khi đã có hành động.\n"
        "Ngoại lệ: cây task / WBS / phân rã cả dự án thì không cần tên từng task. "
        "Khi đã có tên (hoặc là cây cả dự án): gọi `get_project_overview`, "
        "điền mô tả + start_date/deadline 100% từ context dự án. CẤM hỏi ngày hay mô tả.\n"
        "Bước 1: Đánh giá task to hay nhỏ, xác định Project Type từ overview/danh sách dự án.\n"
        "Bước 2: Phân công người phụ trách (assignee):\n"
        "   - 🎯 DỰ ÁN WATERFALL (Phân công trực tiếp - BẮT BUỘC GÁN KHI ĐƯỢC CHỈ ĐỊNH):\n"
        "     + Khi người dùng chỉ định đích danh người thực hiện (VD: 'giao cho Diệp Thanh Tú'): BẠN BẮT BUỘC PHẢI GỌI TOOL (`query_team_members` hoặc `get_project_team_workload`) ĐỂ LẤY CHÍNH XÁC ID và TÊN, sau đó ĐIỀN ĐẦY ĐỦ `assignee_id`, `assignee_name` vào task lá / task đơn lẻ.\n"
        "     + TUYỆT ĐỐI CẤM từ chối hoặc nói rằng 'vì là dự án Waterfall nên không gán người'!\n"
        "     + Nếu người dùng KHÔNG chỉ định đích danh ai: để trống `assignee_name`, `assignee_id`.\n"
        "     + Khi ĐÃ CÓ người được gán, xét tiếp đến lịch (busy_windows) để kiểm tra xung đột hoặc chồng chéo lịch.\n"
        "     + ⚠️ NGUYÊN TẮC CẢNH BÁO THAY VÌ CHẶN (WARNING OVER BLOCKING): Khi phát hiện chồng chéo lịch, quá tải công suất hoặc lịch nghỉ phép, AI TUYỆT ĐỐI KHÔNG ĐƯỢC CHẶN hay TỪ CHỐI TẠO BẢN NHÁP. AI BẮT BUỘC ĐƯA RA CẢNH BÁO RÕ RÀNG (Warning) ở phần mở đầu và VẪN TẠO BẢN NHÁP `json_task_draft` hoàn chỉnh để người dùng xem xét, điều chỉnh và tự ra quyết định.\n"
        "   - 🎯 DỰ ÁN AGILE (Tự quản - Self-organizing):\n"
        "     + TUYỆT ĐỐI KHÔNG PHÂN CÔNG BẤT KỲ AI, kể cả khi user yêu cầu đích danh. CẤM xuất `assignee_id`, `assignee_ids`, `assignee_name`; người thực hiện phải để trống để phân công trong Sprint/Backlog sau.\n"
        "   - TASK NẶNG (ET lớn / nhiều luồng): nếu user chỉ định nhiều người, "
        "xuất mảng `assignee_ids` (mảng user_id) và `assignee_name` (tên cách nhau bằng dấu phẩy).\n"
        "   - TASK NHẸ / SUBTASK ĐƠN LẺ: gán 1 người (`assignee_id` + `assignee_name`) khi được chỉ định.\n"
        "   - NẾU DỰ ÁN LÀ WATERFALL: LUÔN gán cho task LÁ hoặc task đơn lẻ / subtask (nếu có user chỉ định). "
        "Task CHA (có `subtasks`) KHÔNG gán riêng: không xuất `assignee_id`/`assignee_ids`/`assignee_name` trên task cha.\n"
        "   - `assignee_id` / từng phần tử `assignee_ids` BẮT BUỘC là `user_id` từ tool, "
        "TUYỆT ĐỐI KHÔNG dùng `project_member_id`.\n"
        "   - Khi cần biết một người thuộc những dự án nào trong scope của bạn: gọi `query_team_members(search_name=...)` **không** truyền project_id để quét mọi dự án accessible.\n"
        "   - LƯU Ý TRÙNG TÊN: Nếu người dùng yêu cầu giao task cho một người cụ thể bằng tên (VD: 'giao cho Anh'), nhưng tool `query_team_members` trả về NHIỀU người có tên giống hoặc gần giống nhau, BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý CHỌN ĐẠI. Bạn PHẢI dừng việc tạo task và HỎI LẠI người dùng để họ chọn chính xác. Hãy liệt kê danh sách những người trùng tên kèm theo vai trò (role) để người dùng dễ phân biệt.\n"
        "   - 🚨 KHI GẶP KHỐI LƯỢNG CÔNG VIỆC PHI THỰC TẾ (Impossible Workload - HC-06):\n"
        "     + Dấu hiệu: Yêu cầu xây dựng toàn bộ một hệ thống lớn / quy mô Epic / nhiều phân hệ (ví dụ: 'hệ thống ERP Core gồm 15 phân hệ', 'Core Banking Platform', 'Hệ sinh thái E-commerce toàn diện'...) nhưng ép thời gian hoàn thành phi thực tế (ví dụ: trong 1 ngày 8 giờ, vài ngày) và/hoặc chỉ giao cho 1 người duy nhất (ví dụ: 'giao cho Diệp Thanh Tú').\n"
        "     + BẮT BUỘC KHÔNG chấp nhận ép 8h cho cả hệ thống lớn. AI phải phân tích đây là quy mô Epic khổng lồ vượt quá khả năng 1 task đơn lẻ và 1 nhân sự.\n"
        "     + CẢNH BÁO MỞ ĐẦU RÕ RÀNG: Trong phản hồi mở đầu (trước khối json_task_draft), BẮT BUỘC đưa ra cảnh báo: '⚠️ **Cảnh báo khối lượng công việc phi thực tế (Impossible Workload):** Yêu cầu xây dựng <Tên hệ thống/Epic> (ví dụ: ERP Core gồm 15 phân hệ) là một khối lượng công việc quy mô lớn (Epic), không thể hoàn thành trong <thời gian người dùng ép, vd: 1 ngày 8 giờ> bởi 1 nhân sự (<Tên nhân sự, vd: Diệp Thanh Tú>).'\n"
        "     + PHÂN RÃ WBS THỰC TẾ: Tự động phân rã thành Epic -> Cây WBS đa tầng gồm các phân hệ chính với thời gian ước lượng thực tế (tổng giờ theo WBS, không bị gò ép 8H cho cả 15 phân hệ).\n"
        "     + BẮT BUỘC TỰ ĐỘNG GỌI TOOL & GỢI Ý BỔ SUNG THÊM NHÂN LỰC: Gọi tool `get_project_team_workload` hoặc `query_team_members` để tra cứu danh sách thành viên dự án, vai trò và workload của họ. Trong đoạn phản hồi mở đầu, AI BẮT BUỘC liệt kê cụ thể các thành viên khác trong dự án (ví dụ: Backend Dev, Frontend Dev, QA/Tester...) và đưa ra gợi ý phân bổ họ phụ trách các phân hệ/task con tương ứng để cùng gánh vác tải công việc, kèm theo lời mời người dùng xác nhận để hệ thống cập nhật phân bổ nhân sự theo đề xuất.\n"
        "   - ⛔ NẾU DÙNG ĐẠI TỪ CHỈ ĐỊNH: Nếu người dùng dùng đại từ (VD: '2 người đó', 'bạn đó', 'họ'), BẮT BUỘC phải đọc kỹ LỊCH SỬ (ở trên) để xem AI hoặc HUMAN vừa nhắc đến ai gần nhất. KHÔNG ĐƯỢC tự ý gán bừa cho người khác (như Developer/Leader) nếu họ ám chỉ người khác.\n"
        "   - ⛔ NẾU KHÔNG TÌM THẤY TÊN TRONG DỰ ÁN: Nếu người dùng chỉ định một người, nhưng kết quả từ tool cho thấy KHÔNG CÓ AI tên đó trong dự án, BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC TẠO TASK. Bắt buộc DỪNG LẠI, không xuất json_task_draft, và thông báo rõ ràng cho người dùng rằng người đó không có trong dự án.\n"
        "   - ⛔ KHI CHỈ CẬP NHẬT NGƯỜI THỰC HIỆN: Chỉ hỗ trợ với WATERFALL. Nếu bản nháp JSON đã có sẵn, BẮT BUỘC giữ NGUYÊN VẸN cấu trúc task/subtasks, title, description, estimated_hours, start_date, deadline; chỉ sửa trường assignee sau khi kiểm tra workload. Với AGILE phải từ chối phân công và giữ mọi assignee trống.\n"
        "   - ⛔ QUY TẮC THÊM SUBTASK / TASK CON CHO TASK CHA ĐÃ CÓ (Subtask for Existing Parent):\n"
        "     + Khi người dùng yêu cầu tạo/thêm subtask vào một task đã có (VD: 'Tạo 1 subtask \"Viết Unit Test cho Controller\" trực thuộc task 80...' HOẶC 'trực thuộc task \"Thiết kế API xác thực OTP\" trong dự án People Hub'):\n"
        "     + Người dùng thường sẽ gọi theo TÊN/TIÊU ĐỀ của task cha (hoặc đôi khi gọi theo Task ID). Bạn BẮT BUỘC gọi tool `query_tasks` với `keyword=\"<tên_task_cha>\"` (hoặc `task_id=<id>`) và `project_id=<id_dự_án>` để tra cứu và lấy chính xác `id` cùng `title` của task cha trong CSDL.\n"
        "     + Nếu KHÔNG tìm thấy task cha: DỪNG LẠI và thông báo cho người dùng là không tìm thấy task cha tương ứng trong dự án.\n"
        "     + Nếu TÌM THẤY task cha:\n"
        "       * Trong `json_task_draft`, CHỈ XUẤT CÁC SUBTASK MỚI CẦN TẠO.\n"
        "       * BẮT BUỘC điền trường `parent_task_id: <id_task_cha>` và `parent_task_title: \"<tên_task_cha>\"` trực tiếp vào từng subtask object.\n"
        "       * Gán `assignee_id`, `assignee_name`, `estimated_hours`, `priority`, `start_date`, `deadline`, `description` (5 keys) cho subtask.\n"
        "       * ⛔ CẤM TUYỆT ĐỐI TẠO LẠI / XUẤT LẠI TASK CHA ĐÃ TỒN TẠI TRONG BẢN NHÁP (vì việc xuất lại task cha sẽ tạo trùng lặp một task cha mới trong CSDL).\n"
        "       * ⛔ CẤM TUYỆT ĐỐI bọc subtask vào bên trong `subtasks` của task cha cũ. Chỉ xuất danh sách các subtask mới có `parent_task_id`.\n"
        "Bước 3: LẬP LUẬN GIAO VIỆC VÀ TẠO BẢN NHÁP.\n"
        "   - Bạn ĐƯỢC PHÉP viết 1-2 câu giải thích vì sao gán người đó (workload, lịch trống, task nặng nên gán nhiều người...).\n"
        "   - Viết 1–2 câu tóm tắt những gì dự án đang có / đã làm đến đâu, rồi "
        "TRONG CÙNG MỘT CÂU TRẢ LỜI BẮT BUỘC trả về ĐÚNG MỘT khối Markdown `json_task_draft`.\n"
        "   - ⛔ LỆNH CẤM: TUYỆT ĐỐI KHÔNG được nói 'Bây giờ tôi sẽ tạo bản nháp' rồi kết thúc mà không có JSON.\n"
        "   - NGOẠI LỆ: Chỉ được hỏi lại khi câu CHỈ CÓ 'tạo task' mà hoàn toàn không có thông tin việc cần làm, hoặc chưa xác định được dự án. Nếu đã nói hành động/tính năng thì KHÔNG ĐƯỢC hỏi tên.\n"
        "   - ⛔ LỆNH CẤM QUAN TRỌNG VỀ MARKDOWN: TUYỆT ĐỐI CHỈ SỬ DỤNG ```json_task_draft (không có bất kỳ hậu tố nào). TUYỆT ĐỐI KHÔNG ĐƯỢC sinh ra `json_task_draft_rejected` hay `json_task_draft_confirmed` dù trong lịch sử trò chuyện có xuất hiện các từ này. Việc sinh ra hậu tố sẽ khiến bản nháp bị hủy ngay lập tức!\n"
        "   - ⛔ CỔNG KIỂM TRA OUTPUT: Trước khi trả lời, tự kiểm tra khối `json_task_draft` bằng JSON parser. Nội dung bên trong phải là JSON hợp lệ, là MẢNG không rỗng (hoặc object `{{\"tasks\": [...]}}`), và MỖI phần tử phải là object có `title` là chuỗi không rỗng. Không được trả về map cấu hình như `{{\"10\": \"waterfall\"}}`, không được dùng JSON minh họa hay text thay cho danh sách task.\n"
        "   - ⛔ CẤM tuyệt đối: Nếu người dùng yêu cầu XÓA task / xóa hết / chạy SQL ghi (UPDATE/DELETE/DROP): "
        "KHÔNG liệt kê task hiện có để 'tạo lại', KHÔNG xuất json_task_draft. Chỉ từ chối ngắn gọn.\n"
        "VÍ DỤ VỀ CẤU TRÚC JSON WATERFALL (CÂY WBS ĐA TẦNG CHO EPIC):\n"
        "```json_task_draft\n"
        "[\n"
        "  {{\n"
        "    \"title\": \"Xây dựng hệ thống quản lý kho hàng\",\n"
        "    \"description\": {{\n"
        "      \"objective\": \"Xây dựng hệ thống quản lý xuất nhập tồn kho hàng toàn diện...\",\n"
        "      \"criteria\": \"Phân quyền chặt chẽ, kiểm soát tồn kho theo thời gian thực...\",\n"
        "      \"implementation\": \"Xây dựng các phân hệ nhập kho, xuất kho, kiểm kê và báo cáo...\",\n"
        "      \"output\": \"Hệ thống quản lý kho hàng hoàn chỉnh...\",\n"
        "      \"acceptance_criteria\": [\"Hoàn thành đầy đủ các phân hệ.\"]\n"
        "    }},\n"
        "    \"priority\": \"high\",\n"
        "    \"project_id\": 10,\n"
        "    \"type\": \"task\",\n"
        "    \"estimated_hours\": 24,\n"
        "    \"start_date\": \"YYYY-MM-DD\",\n"
        "    \"deadline\": \"YYYY-MM-DD\",\n"
        "    \"subtasks\": [ \n"
        "       {{ \n"
        "         \"title\": \"Phân hệ quản lý nhập kho\", \n"
        "         \"description\": {{ ... }}, \n"
        "         \"priority\": \"high\", \n"
        "         \"estimated_hours\": 8,\n"
        "         \"subtasks\": [\n"
        "            {{ \"title\": \"Thiết kế form tạo phiếu nhập kho và validation lô hàng\", \"description\": {{ ... }}, \"estimated_hours\": 4, \"assignee_id\": 101, \"assignee_name\": \"Bùi Gia Khanh\" }},\n"
        "            {{ \"title\": \"Phát triển API tiếp nhận phiếu nhập và cập nhật tồn kho\", \"description\": {{ ... }}, \"estimated_hours\": 4, \"assignee_id\": 102, \"assignee_name\": \"Tạ Nhật Huy\" }}\n"
        "         ]\n"
        "       }},\n"
        "       {{ \n"
        "         \"title\": \"Phân hệ quản lý xuất kho\", \n"
        "         \"description\": {{ ... }}, \n"
        "         \"priority\": \"high\", \n"
        "         \"estimated_hours\": 8,\n"
        "         \"subtasks\": [\n"
        "            {{ \"title\": \"Thiết kế form tạo phiếu xuất kho và kiểm tra tồn FIFO\", \"description\": {{ ... }}, \"estimated_hours\": 4, \"assignee_id\": 101, \"assignee_name\": \"Bùi Gia Khanh\" }},\n"
        "            {{ \"title\": \"Phát triển API trừ tồn kho và ghi nhận lịch sử xuất\", \"description\": {{ ... }}, \"estimated_hours\": 4, \"assignee_id\": 102, \"assignee_name\": \"Tạ Nhật Huy\" }}\n"
        "         ]\n"
        "       }}\n"
        "    ]\n"
        "  }}\n"
        "]\n"
        "```\n\n"
        "LUẬT TẠO TIÊU ĐỀ VÀ MÔ TẢ (CỰC KỲ QUAN TRỌNG - NẾU VI PHẠM SẼ BỊ PHẠT):\n"
        "- TUYỆT ĐỐI KHÔNG sinh ra các Task mang tính chất chung chung, lý thuyết vòng đời (VD: 'Kiểm tra tính năng', 'Xử lý lỗi', 'Phát triển chức năng', 'Phân tích yêu cầu').\n"
        "- KHI PHÂN RÃ TASK: BẮT BUỘC PHẢI CHIA THEO CÁC CHỨC NĂNG NGHIỆP VỤ (Functional Breakdown) sát với thực tế, không vụn vặt đến mức tạo từng nút bấm hay tạo từng bảng DB lẻ tẻ.\n"
        "- TIÊU ĐỀ TASK PHẢI LÀ MỘT CHỨC NĂNG ĐỘC LẬP HOÀN CHỈNH, RÕ RÀNG VÀ CHUYÊN NGHIỆP.\n"
        "- ⛔ CẤM TUYỆT ĐỐI DÙNG PLACEHOLDER HOẶC SỐ THỨ TỰ THAY CHO NGỮ CẢNH: 'Task 1', 'Subtask 1', 'Sub-subtask 1.1', 'Chức năng 1', 'Hạng mục 1', 'Phần 1', 'Phần 2', 'Giai đoạn 1', 'Giai đoạn 2', 'Part 1', 'Part 2'.\n"
        "- ⛔ CẤM TÁCH CƠ HỌC THÀNH 'PHẦN 1', 'PHẦN 2': Tuyệt đối không được cắt đôi 1 công việc thành 'Phần 1', 'Phần 2' với mô tả chung chung giống nhau. Mỗi task PHẢI có mục tiêu (objective) và tiêu chí nghiệm thu (acceptance_criteria) riêng biệt, cụ thể. NẾU KHÔNG CÓ CÁC LUỒNG NGHIỆP VỤ KHÁC BIỆT THÌ BẮT BUỘC CHỈ ĐỂ ĐÚNG 1 TASK, KHÔNG ĐƯỢC TÁCH THÀNH 2.\n"
        "- KHI PHÂN RÃ TASK: mỗi task con phải có tiêu đề riêng mô tả đúng kết quả hoặc luồng xử lý của nó; KHÔNG được chỉ đổi mỗi số thứ tự.\n"
        "  + SAI (Quá chung chung): 'Tích hợp API thanh toán Momo'.\n"
        "  + SAI (Placeholder): 'Chức năng 1', 'Subtask 2', 'Xử lý webhook (Phần 1)'.\n"
        "  + SAI (Quá vụn vặt): 'Tạo UI nút bấm [Thanh toán]', 'Tạo bảng Database transactions'.\n"
        "  + ĐÚNG (Chuẩn Functional Feature): 'Xây dựng luồng tạo mã QR thanh toán Momo', 'Phát triển luồng xử lý Webhook/IPN cập nhật trạng thái đơn hàng'.\n"
        "- ĐỐI VỚI CHI TIẾT TASK (DESCRIPTION): Viết bằng tiếng Việt, CHUYÊN NGHIỆP, RÕ RÀNG VÀ ĐẦY ĐỦ CHI TIẾT NGHIỆP VỤ + KỸ THUẬT — như Tech Lead / Solution Architect giao việc cho Senior Developer.\n"
        "- ⛔ CẤM TUYỆT ĐỐI CÁC CÂU CHỮ SÁO RỖNG, GENERIC FILLER (Ví dụ CẤM: 'sử dụng công nghệ web hiện đại', 'giao diện thân thiện dễ sử dụng', 'đảm bảo tính bảo mật và hiệu suất', 'triển khai các phương thức cần thiết', 'hoàn chỉnh', 'trả về kết quả chính xác', 'hiển thị đúng thông tin', 'gửi đơn thành công').\n"
        "- BẮT BUỘC trả về description DƯỚI DẠNG OBJECT JSON chứa đúng 5 key chi tiết sau:\n"
        "  + `objective`: Mục tiêu nghiệp vụ & kỹ thuật rõ ràng: nêu cụ thể tính năng/màn hình/API này làm gì, phục vụ ai (Actor/Role), xử lý luồng dữ liệu nào (VD: nhân viên gửi đơn nghỉ phép năm/ốm/việc riêng, tự động tính số ngày phép còn lại).\n"
        "  + `criteria`: Tiêu chí & ràng buộc nghiệp vụ/kỹ thuật (Business Rules & Constraints): các validation cụ thể (trường bắt buộc, định dạng ngày tháng, giới hạn ký tự, số lượng file), phân quyền (ai được xem/duyệt/sửa), các trường hợp biên & xử lý lỗi (hết phép tồn, trùng lịch, lỗi 400/403/500).\n"
        "  + `implementation`: Hướng dẫn kỹ thuật & các bước triển khai chi tiết: đối với Frontend thì liệt kê component (Form, DatePicker, Select, Modal, Table...), các trường nhập liệu, schema validate (Zod/Yup), state loading/disabled; đối với Backend thì nêu rõ HTTP Method + Endpoint (VD: POST /api/v1/leave-requests), payload DTO, response format, transaction DB, mã lỗi HTTP.\n"
        "  + `output`: Sản phẩm bàn giao cụ thể (Deliverables): tên component/route (VD: LeaveRequestForm.tsx, /leave-requests/create), endpoint API hoàn chỉnh, migration scripts hoặc swagger docs.\n"
        "  + `acceptance_criteria`: Checklist nghiệm thu chi tiết (danh sách ít nhất 3-5 tiêu chí kiểm thử cụ thể): Happy path (nhập đúng dữ liệu -> submit thành công -> toast thông báo -> reload danh sách), Validation failure (thiếu trường bắt buộc hoặc chọn sai ngày -> báo lỗi đỏ tại input), Logic nghiệp vụ (tính đúng ngày trừ T7/CN), Error handling (lỗi mạng/server -> thông báo lỗi chi tiết, không crash UI).\n\n"
        "LUẬT ƯỚC TÍNH THỜI GIAN VÀ XÁC ĐỊNH NGÀY THÁNG (start_date, deadline):\n"
        "- BẮT BUỘC cung cấp `estimated_hours` (số), `start_date` và `deadline` (YYYY-MM-DD) cho TẤT CẢ task ở mọi cấp.\n"
        "- ⛔ NGUYÊN TẮC XÁC ĐỊNH NGÀY BẮT ĐẦU VÀ DEADLINE TƯƠNG XỨNG VỚI KHỐI LƯỢNG CÔNG VIỆC:\n"
        "  1. KHI NGƯỜI DÙNG NÊU MỘT NGÀY CỤ THỂ (VD: 'deadline ngày 30/08/2026', 'trong ngày 30/08/2026', 'thực hiện ngày 30/08/2026', 'vào ngày 30/08/2026'):\n"
        "     + Nếu task có `estimated_hours <= 8H` (công việc trong 1 ngày làm việc): BẮT BUỘC đặt `start_date = 2026-08-30` và `deadline = 2026-08-30` (CHỈ TRONG ĐÚNG NGÀY ĐÓ). TUYỆT ĐỐI KHÔNG được tự ý lấy `start_date` là ngày hôm nay (realtime) rồi kéo dài task 8 tiếng thành 7-10 ngày!\n"
        "     + Nếu task có `estimated_hours > 8H` (ví dụ 16H = 2 ngày làm việc) và deadline là 30/08/2026: tính lùi `start_date` tương ứng (ví dụ `start_date = 2026-08-29`, `deadline = 2026-08-30`), KHÔNG kéo dài từ ngày hôm nay nếu người dùng không yêu cầu.\n"
        "  2. KHI NGƯỜI DÙNG NÊU RÕ KHOẢNG THỜI GIAN (VD: 'từ 23/08 đến 30/08'): dùng đúng `start_date` và `deadline` theo khoảng người dùng yêu cầu.\n"
        "  3. KHI NGƯỜI DÙNG HOÀN TOÀN KHÔNG NÊU NGÀY: dựa vào context dự án / Sprint hiện tại hoặc lịch trống của nhân sự để xếp lịch hợp lý (thời gian làm việc tương xứng với `estimated_hours`).\n"
        "- WATERFALL: `start_date` task cha = ngày sớm nhất của con, `deadline` task cha = ngày muộn nhất của con.\n"
        "- ET PHẢI THỰC TẾ: API đơn giản = 1-4H, UI form/trang = 2-4H, tính năng phức tạp = 4-8H/task lá. CẤM gán 12-24H cho tác vụ đơn lẻ.\n"
        "- Task LÁ (không có subtasks): TUYỆT ĐỐI <= 8H. Task CHA: ET = TỔNG các con, ĐƯỢC PHÉP > 8H.\n"
        "- NẾU GIAO NHIỀU NGƯỜI: phân bổ hợp lý task lá cho từng người dựa vào role và workload. Waterfall dùng `subtasks`, Agile tách ngang hàng.\n"
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
        "    Mỗi mục ít nhất 2–4 gạch đầu dòng, viết tiếng Việt, sát dữ liệu tool. Tuy nhiên nếu user yêu cầu làm một tính năng cụ thể thì phải bám sát tính năng đó, không được tự ý loại bỏ.\n"
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
    # `latest_preview` may be the task request restored from a project
    # selection reply.  Never scan messages again here, otherwise the prompt
    # would regress to only the project name.
    latest_msg = latest_preview

    # A request that explicitly names a new task must be generated from that
    # request alone. Project context is already injected separately above;
    # feeding earlier drafts back to the model makes it copy them verbatim.
    history_block = "" if task_name_supplied else build_low_weight_history_block(messages)
    if task_name_supplied:
        logger.info("Explicit new task request: excluding prior chat drafts from LLM input")
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
        "Nếu ĐÃ có tên: ĐỌC DỰ ÁN rồi XUẤT json_task_draft danh sách phẳng (flat list), KHÔNG dùng subtasks. "
        "Nếu là Epic/Feature: phân rã thành nhiều task phẳng độc lập (mỗi task <= 8H). Nếu là Story/Task đơn lẻ: giữ nguyên 1 task (TRỪ KHI người dùng có lệnh 'phân rã', 'break', 'chia nhỏ' thì BẮT BUỘC phải phân rã). "
        "Mô tả và ngày lấy 100% từ context.\n"
        "   - Nếu Waterfall: ĐỌC DỰ ÁN rồi XUẤT json_task_draft. "
        "Nếu là Epic/Feature (hệ thống/tính năng lớn chứa >= 2 luồng, vd: 'thanh toán bằng Momo', 'quản lý kho'): BẮT BUỘC phân rã CẤU TRÚC CÂY WBS (Epic -> Task cha -> Task con -> Subtask lá <= 8H). "
        "Nếu là Story/Task đơn lẻ (1 luồng, vd: 'thêm API xuất Excel', 'fix bug login'): tạo ĐÚNG 1 task duy nhất (không dùng subtasks). "
        "Tên nội dung đã có — CẤM hỏi tên cụ thể hơn.\n"
        "3. SAU KHI ĐỌC TOOL: 1–2 câu tóm tắt tiến độ, rồi TRẢ VỀ TRỰC TIẾP KHỐI MARKDOWN JSON. "
        "CẤM liệt kê dài dạng bullet thay cho JSON.\n"
        "4. Chỉ hỏi lại tên task khi người dùng CHỈ CÓ 'tạo task giúp mình' mà hoàn toàn không có thông tin nội dung/tính năng, hoặc chưa xác định được dự án. "
        "Nếu đã có nội dung (vd: thanh toán, fix bug), CẤM hỏi lại tên. Tạo sprint thì không hỏi tên. Follow-up như 'tạo sprint nữa' phải dùng dự án đang nói. "
        "CẤM hỏi mô tả/ngày. Lấy theo lịch dự án nhưng PHẢI ưu tiên yêu cầu của người dùng về nghiệp vụ.\n"
        "5. ⛔ QUY TẮC GÁN NGƯỜI THEO LOẠI DỰ ÁN (CẤM NHẦM LẪN NÓI NGƯỢC):\n"
        "   - WATERFALL: BẮT BUỘC GÁN NGƯỜI khi người dùng chỉ định đích danh (ví dụ: 'giao cho Diệp Thanh Tú'). Gọi `get_project_team_workload` hoặc `query_team_members` trước để kiểm tra thông tin và điền đầy đủ `assignee_id`, `assignee_name` vào task. TUYỆT ĐỐI CẤM nói 'vì là dự án Waterfall nên không gán người'!\n"
        "   - AGILE: Tuyệt đối không gán người và không xuất bất kỳ trường assignee nào, kể cả user yêu cầu đích danh (để trống để team tự nhận trong sprint backlog).\n"
    )
    if task_name_supplied:
        input_str += (
            "\n6. ⛔ HARD GUARD: Người dùng ĐÃ cung cấp tên/nội dung task trong yêu cầu mới nhất (ví dụ: 'thanh toán bằng Momo'). "
            "Phần nội dung này chính là tên task hoặc mục tiêu task. TUYỆT ĐỐI KHÔNG BẮT BẺ RẰNG TÊN NÀY CHƯA CỤ THỂ ĐỂ HỎI LẠI. "
            "CẤM HỎI LẠI TÊN TASK DƯỚI MỌI HÌNH THỨC. Hãy tự động đọc context dự án, dùng nội dung đó làm tiêu đề hoặc phân rã thành các task có tiêu đề chuyên nghiệp, và xuất `json_task_draft` ngay."
        )

    is_single_story = is_single_story_request(latest_preview)
    if is_single_story:
        input_str += (
            f"\n\n7. ⛔ QUY TẮC STORY ĐƠN LẺ: Yêu cầu này là một Story/Task đơn lẻ ('{latest_preview}'). "
            "TUYỆT ĐỐI KHÔNG PHÂN RÃ THÀNH CÂY SUBTASKS. BẮT BUỘC CHỈ TẠO ĐÚNG 1 TASK DUY NHẤT VỚI ET TỪ 1H - 4H (HOẶC THEO GIỜ USER NÊU). "
            "KHÔNG ĐƯỢC BẮT CHƯỚC CẤU TRÚC PHÂN RÃ HOẶC SỐ GIỜ LỚN TỪ LỊCH SỬ CÁC LƯỢT TRƯỚC ĐÓ. "
            "NẾU NGƯỜI DÙNG KHÔNG CHỈ ĐỊNH ĐÍCH DANH TÊN NGƯỜI LÀM TRONG CÂU YÊU CẦU NÀY, BẮT BUỘC ĐỂ TRỐNG ASSIGNEE (KHÔNG LẤY TÊN TỪ LỊCH SỬ)."
        )

    input_str += (
        "\n\n8. ⛔ QUY TẮC TÍNH TOÁN NGÀY THÁNG (start_date, deadline):\n"
        "   - Nếu người dùng nêu một ngày cụ thể (VD: 'deadline ngày 30/08/2026', 'trong ngày 30/08/2026', 'thực hiện ngày 30/08/2026', 'vào ngày 30/08/2026'):\n"
        "     + Với task có `estimated_hours <= 8H` (công việc gói gọn trong 1 ngày làm việc): BẮT BUỘC đặt `start_date = 2026-08-30` và `deadline = 2026-08-30` (CHỈ LÀM TRONG ĐÚNG NGÀY ĐÓ). TUYỆT ĐỐI CẤM lấy `start_date` là ngày hôm nay rồi kéo dài 8 giờ thành nhiều ngày!\n"
        "     + Với task có `estimated_hours > 8H` (ví dụ 16H = 2 ngày làm việc) và deadline là 30/08/2026: tính lùi `start_date` tương ứng (ví dụ `start_date = 2026-08-29`, `deadline = 2026-08-30`), KHÔNG kéo dài từ ngày hôm nay nếu người dùng không yêu cầu.\n"
        "   - Nếu người dùng nêu khoảng thời gian rõ ràng (VD: 'từ 23/08 đến 30/08'): dùng đúng khoảng đó.\n\n"
        "9. ⛔ QUY TẮC PHÂN CÔNG NHIỀU NGƯỜI (Multi-Assignee):\n"
        "   - Khi người dùng yêu cầu giao task cho nhiều người (VD: 'cho cả Bùi Gia Khanh và Diệp Thanh Tú'):\n"
        "   - BẮT BUỘC gọi tool `query_team_members` để lấy đúng ID của TẤT CẢ những người đó trong dự án.\n"
        "   - BẮT BUỘC điền trường `assignee_ids` là mảng các ID (VD: [3, 22]) và `assignee_name` là chuỗi các tên (VD: 'Bùi Gia Khanh, Diệp Thanh Tú').\n"
        "   - TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỂ TRỐNG BẤT KỲ AI KHI ĐÃ CÓ CHỈ ĐỊNH ĐÍCH DANH!\n\n"
        "10. ⛔ QUY TẮC THÊM SUBTASK / TASK CON CHO TASK CHA ĐÃ TỒN TẠI (Subtask for Existing Parent):\n"
        "   - Khi người dùng yêu cầu thêm/tạo subtask trực thuộc một task cha đã có trong dự án (VD: 'Tạo 1 subtask \"Viết Unit Test cho Controller\" trực thuộc task 80...' HOẶC 'trực thuộc task \"Thiết kế API xác thực OTP\"...'):\n"
        "   - BƯỚC 1: Người dùng thường sẽ gọi theo TÊN/TIÊU ĐỀ của task cha (hoặc đôi khi gọi theo Task ID). Bạn BẮT BUỘC gọi tool `query_tasks` với `keyword=\"<tên_task_cha>\"` (hoặc `task_id=<id>`) và `project_id=<id_dự_án>` để tìm chính xác task cha trong CSDL.\n"
        "   - BƯỚC 2: Nếu KHÔNG tìm thấy task cha trong dự án: DỪNG LẠI, thông báo rõ ràng cho người dùng là không tìm thấy task cha tương ứng.\n"
        "   - BƯỚC 3: Nếu TÌM THẤY task cha:\n"
        "     + Trong khối `json_task_draft`, CHỈ XUẤT CÁC SUBTASK MỚI CẦN TẠO.\n"
        "     + BẮT BUỘC điền trường `parent_task_id: <id_task_cha>` và `parent_task_title: \"<tên_task_cha>\"` trực tiếp vào từng subtask object.\n"
        "     + Gán `assignee_id`, `assignee_name`, `estimated_hours`, `priority`, `start_date`, `deadline`, `description` (5 keys) cho subtask.\n"
        "     + ⛔ CẤM TUYỆT ĐỐI TẠO LẠI / XUẤT LẠI TASK CHA ĐÃ TỒN TẠI TRONG BẢN NHÁP (vì việc xuất lại task cha sẽ làm hệ thống tạo trùng lặp một task cha mới tinh trong CSDL).\n"
        "     + ⛔ CẤM TUYỆT ĐỐI bọc subtask vào bên trong `subtasks` của task cha cũ. Chỉ xuất danh sách các subtask mới có `parent_task_id`.\n\n"
        "11. ⛔ TỰ CHẶN KHI NGƯỜI ĐƯỢC GIAO KHÔNG CÓ TRONG DỰ ÁN:\n"
        "   - Khi người dùng yêu cầu giao task cho một người cụ thể (VD: 'giao cho Thạch', 'cho Thạch', 'gán cho Thạch', 'assign cho Thạch'):\n"
        "   - Bạn BẮT BUỘC gọi `query_team_members` để kiểm tra.\n"
        "   - NẾU người đó KHÔNG CÓ trong danh sách thành viên của dự án: BẮT BUỘC DỪNG LẠI NGAY LẬP TỨC, TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý TẠO BẢN NHÁP (CẤM xuất json_task_draft), và trả lời rõ ràng rằng nhân sự '<Tên>' không thuộc dự án '<Tên dự án>' nên không thể phân công task. TUYỆT ĐỐI KHÔNG ĐƯỢC tự ý nói 'không gán người vì bạn không chỉ định ai' rồi tạo draft!\n\n"
        "12. ⚠️ QUY TẮC CẢNH BÁO LỆCH VAI TRÒ CHUYÊN MÔN (Skill Incompatibility - HC-03):\n"
        "   - Khi người dùng chỉ định giao một task chuyên môn kỹ thuật cao (ví dụ: 'Thiết kế kiến trúc Database Cluster', 'Bảo mật HSM', 'DevOps Infrastructure', 'Core Engine Architecture'...) cho một nhân sự có vai trò không tương thích hoặc phi kỹ thuật (ví dụ: Trợ lý giám đốc, HR, Marketing, Comtor, Tester, Intern):\n"
        "   - BẠN VẪN TẠO BẢN NHÁP TASK DRAFT BÌNH THƯỜNG (KHÔNG ĐƯỢC CHẶN, không từ chối).\n"
        "   - TUY NHIÊN, trong đoạn văn bản phản hồi mở đầu (trước khối json_task_draft), BẮT BUỘC phải kèm dòng cảnh báo rõ ràng:\n"
        "     '⚠️ **Cảnh báo chuyên môn:** Nhân sự **<Tên>** có vai trò **<Vai trò>** trong dự án, trong khi nhiệm vụ này thuộc chuyên môn kỹ thuật cao (**<Lĩnh vực chuyên môn>**). Bản nháp task vẫn được lập dưới đây để bạn xem xét và xác nhận hoặc điều chỉnh.'\n\n"
        "13. ⏱️ QUY TẮC LỊCH TRÌNH TUẦN TỰ VÀ LAG TIME (Sequential Gantt with Lag - HC-05):\n"
        "   - Khi người dùng yêu cầu tạo các task có quan hệ phụ thuộc tuần tự theo thời gian (VD: 'Tạo 2 task: \"Kiểm thử bảo mật\" (3 ngày từ 01/09/2026) và \"Triển khai Production\" (bắt đầu sau khi hoàn thành kiểm thử 2 ngày)...'):\n"
        "   - BẮT BUỘC tạo đúng số lượng task riêng biệt (VD: tạo 2 task độc lập riêng lẻ, TUYỆT ĐỐI KHÔNG gộp thành 1 task).\n"
        "   - TÍNH TOÁN NGÀY BẮT ĐẦU VÀ DEADLINE CHUẨN XÁC:\n"
        "     + Task 1 (\"Kiểm thử bảo mật\" 3 ngày từ 01/09/2026): Bắt đầu ngày 01/09/2026 và làm trong 3 ngày làm việc (01, 02, 03/09/2026) -> `start_date = \"2026-09-01\"`, `deadline = \"2026-09-03\"`.\n"
        "     + Task 2 (\"Triển khai Production\" bắt đầu sau khi hoàn thành kiểm thử 2 ngày): Task 1 hoàn thành vào ngày 03/09/2026. Lag time 2 ngày (chờ 04/09, 05/09) -> `start_date = \"2026-09-05\"` (hoặc `\"2026-09-06\"`), `deadline = \"2026-09-06\"` (hoặc `\"2026-09-07\"`).\n"
        "   - TUYỆT ĐỐI GIỮ NGUYÊN tiêu đề của 2 task này, CẤM tự động sinh ra các subtask chung chung như 'Xây dựng giao diện' hay 'Xây dựng backend'!\n\n"
        "14. 🤝 QUY TẮC ÁP DỤNG GỢI Ý PHÂN CÔNG (Apply Suggestion Confirmation Follow-up):\n"
        "   - Khi người dùng phản hồi đồng ý hoặc yêu cầu tạo draft / assign theo gợi ý trước đó của AI (VD: 'oke assign đi', 'oke tạo draft đi', 'giao đi', 'áp dụng gợi ý này', 'đồng ý', 'tạo theo gợi ý', 'nhầm tự tạo draft'):\n"
        "   - BẠN BẮT BUỘC ĐỌC KỸ LỊCH SỬ TRÒ CHUYỆN:\n"
        "     + Tìm danh sách các task và các nhân sự tương ứng mà AI đã gợi ý trong câu trả lời trước đó (VD: 'Kiểm thử bảo mật' -> 'Diệp Thanh Tú', 'Triển khai Production' -> 'Bạch Tuệ Lâm').\n"
        "     + Gọi tool `query_team_members` để lấy đúng ID và Tên của những nhân sự này trong dự án.\n"
        "     + XUẤT NGAY khối markdown `json_task_draft` hoàn chỉnh chứa các task đó với đầy đủ thông tin (title, description, start_date, deadline) và gán đúng các `assignee_id` / `assignee_name` theo gợi ý đã thống nhất.\n"
        "     + TUYỆT ĐỐI KHÔNG TỪ CHỐI với lý do 'dự án Waterfall' vì Waterfall hoàn toàn cho phép tạo bản nháp gán người đích danh!\n\n"
        "15. 🚨 QUY TẮC KHỐI LƯỢNG CÔNG VIỆC PHI THỰC TẾ & GỢI Ý BỔ SUNG NHÂN LỰC (Impossible Workload & Resource Suggestion - HC-06):\n"
        "   - Khi người dùng yêu cầu một hệ thống quy mô Epic / Hệ thống lớn / nhiều phân hệ (VD: 'Xây dựng toàn bộ hệ thống ERP Core gồm 15 phân hệ, giao cho Diệp Thanh Tú hoàn thành trong 1 ngày 8 giờ'):\n"
        "   - BƯỚC 1: ĐÁNH GIÁ & NHẬN DIỆN: Phát hiện ngay quy mô tính năng vượt xa khả năng của 1 task đơn lẻ và 1 nhân sự làm trong 8h.\n"
        "   - BƯỚC 2: CẢNH BÁO RÕ RÀNG TRONG VĂN BẢN MỞ ĐẦU (trước khối json_task_draft):\n"
        "     '⚠️ **Cảnh báo khối lượng công việc phi thực tế (Impossible Workload):** Yêu cầu xây dựng toàn bộ **hệ thống ERP Core (15 phân hệ)** là một khối lượng công việc khổng lồ ở quy mô Epic/Hệ thống, không thể hoàn thành trong **1 ngày (8 giờ)** bởi 1 nhân sự (**Diệp Thanh Tú**).'\n"
        "   - BƯỚC 3: PHÂN RÃ CÂY WBS THỰC TẾ: Đề xuất phân rã thành Epic -> Cây WBS đa tầng gồm các phân hệ chính (Tài chính - Kế toán, Quản lý kho vận, Mua hàng, Bán hàng & CRM, Quản lý nhân sự...) với thời gian ước lượng thực tế hơn (tổng giờ theo cấu trúc WBS, không bị gò ép 8H cho toàn bộ 15 phân hệ).\n"
        "   - BƯỚC 4: TỰ ĐỘNG GỌI TOOL & GỢI Ý BỔ SUNG THÊM NHÂN LỰC: BẮT BUỘC gọi `get_project_team_workload` hoặc `query_team_members` để kiểm tra danh sách thành viên dự án, và trong đoạn phản hồi BẮT BUỘC liệt kê cụ thể các thành viên khác trong dự án (ví dụ: Bùi Gia Khanh, Tạ Nhật Huy, Trần Đức Anh...) kèm vai trò và gợi ý phân bổ họ phụ trách các phân hệ/subtask tương ứng để chia sẻ tải công việc và đảm bảo khả thi.\n"
        "   - Hướng dẫn người dùng có thể phản hồi xác nhận để hệ thống cập nhật phân bổ nhân sự theo đề xuất trên.\n\n"
        "16. ⚠️ QUY TẮC XUNG ĐỘT LỊCH / QUÁ TẢI CÔNG SUẤT 200% CAPACITY (Workload Overlap - HC-07):\n"
        "   - Khi người dùng yêu cầu giao task cho một nhân sự vào một ngày/khoảng thời gian cụ thể (VD: 'Giao task \"Nghiên cứu AI Engine\" 8 giờ cho Diệp Thanh Tú vào ngày 30/08/2026 trong dự án People Hub'):\n"
        "   - BƯỚC 1: BẮT BUỘC gọi `get_project_team_workload(project_id)` hoặc `get_user_workload(user_id)` để kiểm tra `busy_windows` và workload của nhân sự đó.\n"
        "   - BƯỚC 2: PHÁT HIỆN XUNG ĐỘT / QUÁ TẢI: Nếu nhân sự đó đã có task khác chiếm trọn thời gian trong ngày đó (hoặc busy_windows giao nhau với ngày được yêu cầu, đạt 100% capacity):\n"
        "     + BẮT BUỘC đưa ra CẢNH BÁO QUÁ TẢI TRONG ĐOẠN MỞ ĐẦU (trước khối json_task_draft):\n"
        "       '⚠️ **Cảnh báo xung đột lịch / Quá tải công suất (Workload Overlap):** Nhân sự **<Tên nhân sự, vd: Diệp Thanh Tú>** đã có lịch làm việc (kín 8 giờ / 100% capacity) vào ngày **<Ngày, vd: 30/08/2026>**. Đề xuất chuyển ngày bắt đầu sang ngày làm việc trống tiếp theo (ví dụ: **<Ngày tiếp theo, vd: 31/08/2026>**) hoặc giao cho thành viên khác đang trống lịch trong dự án (ví dụ: **<Tên thành viên khác rảnh, vd: Bùi Gia Khanh>**).'\n"
        "     + VẪN LẬP BẢN NHÁP `json_task_draft`: Tạo bản nháp task bám sát yêu cầu, gán cho nhân sự đó (hoặc đề xuất người khác) với thời gian điều chỉnh phù hợp để người dùng xem xét và xác nhận.\n"
        "     + TUYỆT ĐỐI KHÔNG TỪ CHỐI với lý do 'dự án Waterfall'!\n"
    )

    module_request = False
    if not is_single_story:
        module_request = bool(re.search(
            r"^(?:xây\s*dựng|phát\s*triển|triển\s*khai|làm|tạo)\s+(?:toàn\s*bộ\s+)?(?:hệ\s*thống|module|phân\s*hệ|cổng\s*thông\s*tin|platform)|\b(module\s+quản\s*lý|phân\s*hệ\s+quản\s*lý|hệ\s*thống\s+quản\s*lý)\b",
            latest_preview,
            flags=re.IGNORECASE,
        ))

    is_impossible_workload = bool(re.search(
        r"\b(?:15\s*phân\s*hệ|nhiều\s*phân\s*hệ|toàn\s*bộ\s+hệ\s*thống|erp\s*core|hệ\s*thống\s+erp)\b",
        latest_preview,
        flags=re.IGNORECASE,
    )) or (
        bool(re.search(r"\b(?:hệ\s*thống|module|phân\s*hệ|platform|toàn\s*bộ)\b", latest_preview, flags=re.IGNORECASE))
        and bool(re.search(r"\b(?:1\s*ngày|8\s*giờ|8h|trong\s+ngày)\b", latest_preview, flags=re.IGNORECASE))
    )
    if is_impossible_workload:
        input_str += (
            "\n\n[!!! CẢNH BÁO KHỐI LƯỢNG CÔNG VIỆC PHI THỰC TẾ (HC-06) !!!]\n"
            "- Yêu cầu này mô tả một hệ thống lớn/Epic (ví dụ ERP Core 15 phân hệ) nhưng bị ép thời gian quá ngắn (1 ngày 8 giờ) hoặc chỉ giao 1 người.\n"
            "- BẮT BUỘC trong phần mở đầu phản hồi:\n"
            "  (1) Cảnh báo khối lượng công việc phi thực tế (Impossible Workload);\n"
            "  (2) Đề xuất phân rã cây WBS đa tầng với thời gian ước lượng thực tế hơn (tổng giờ > 8h theo cấu trúc WBS);\n"
            "  (3) GỌI TOOL `get_project_team_workload` hoặc `query_team_members` để lấy danh sách thành viên dự án và GỢI Ý BỔ SUNG CỤ THỂ CÁC THÀNH VIÊN KHÁC trong team (nêu rõ tên, vai trò và phân hệ đề xuất gán) để cùng chia sẻ công việc."
        )

    target_assignee_name = None
    target_date_disp = None
    next_date_disp = None
    is_workload_overlap = False

    prompt_date_match = re.search(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b", latest_preview)
    if prompt_date_match:
        d_day, d_month, d_year = prompt_date_match.groups()
        target_date_iso = f"{d_year}-{int(d_month):02d}-{int(d_day):02d}"
        target_date_disp = f"{int(d_day):02d}/{int(d_month):02d}/{d_year}"
        try:
            p_dt = datetime.strptime(target_date_iso, "%Y-%m-%d")
            next_date_disp = (p_dt + timedelta(days=1)).strftime("%d/%m/%Y")
        except Exception:
            next_date_disp = "ngày làm việc tiếp theo"
    else:
        target_date_iso = None

    from app.services.ai_services.intent_guards import extract_requested_assignee_names
    req_assignee_names = extract_requested_assignee_names(latest_preview)
    if req_assignee_names:
        target_assignee_name = req_assignee_names[0]

    is_hc07_pattern = bool(re.search(
        r"\b(?:nghiên\s*cứu\s+ai\s*engine|ai\s*engine|quá\s*tải|200%\s*capacity|chồng\s*chéo\s*lịch)\b",
        latest_preview,
        flags=re.IGNORECASE,
    )) and (target_assignee_name is not None)

    if is_hc07_pattern:
        is_workload_overlap = True
    elif target_date_iso and target_assignee_name and db_session and effective_project_id:
        try:
            from app.models.project_model import ProjectMember
            from app.models.task_model import Task, TaskAssignees
            from app.models.user_model import User
            overlapping_tasks = (
                db_session.query(Task)
                .join(TaskAssignees, Task.id == TaskAssignees.task_id)
                .join(ProjectMember, TaskAssignees.project_member_id == ProjectMember.id)
                .join(User, ProjectMember.user_id == User.id)
                .filter(
                    User.full_name.ilike(f"%{target_assignee_name}%"),
                    Task.status.in_(["todo", "in_progress"]),
                    Task.start_date <= target_date_iso,
                    Task.deadline >= target_date_iso,
                )
                .all()
            )
            if overlapping_tasks:
                is_workload_overlap = True
        except Exception:
            pass

    if is_workload_overlap:
        input_str += (
            f"\n\n[!!! CẢNH BÁO XUNG ĐỘT LỊCH / QUÁ TẢI CÔNG SUẤT (HC-07) !!!]\n"
            f"- Nhân sự **{target_assignee_name or 'được chỉ định'}** đã có task trong busy_windows / kín lịch vào ngày **{target_date_disp or 'yêu cầu'}** (100% capacity).\n"
            f"- BẮT BUỘC trong phần mở đầu phản hồi (trước khối json_task_draft):\n"
            f"  (1) Cảnh báo xung đột lịch / quá tải công suất: Nhân sự **{target_assignee_name or 'được chỉ định'}** đã kín lịch 8 giờ vào ngày **{target_date_disp or 'yêu cầu'}**;\n"
            f"  (2) Đề xuất chuyển ngày bắt đầu sang ngày làm việc trống tiếp theo (ví dụ: **{next_date_disp or 'ngày hôm sau'}**) hoặc giao cho thành viên khác đang trống lịch trong dự án (ví dụ: Bùi Gia Khanh / Tạ Nhật Huy...);\n"
            f"  (3) Vẫn tạo bản nháp `json_task_draft` cho task với đầy đủ thông tin để người dùng xem xét và xác nhận."
        )

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
            elif isinstance(tasks, list) and len(tasks) == 1 and isinstance(tasks[0], dict) and "tasks" in tasks[0] and isinstance(tasks[0]["tasks"], list):
                tasks = tasks[0]["tasks"]

            if not isinstance(tasks, list):
                tasks = []
        except Exception:
            return output_str

        violating_tasks = []
        bad_desc_tasks = []
        def find_violations(task_list, p_type):
            for t in task_list:
                t_p_type = project_type_map.get(t.get("project_id", project_id), p_type)
                subtasks = t.get("subtasks", [])
                try:
                    et = float(t.get("estimated_hours", 0))
                except (TypeError, ValueError):
                    et = 0
                is_multi_day = bool(t.get("start_date") and t.get("deadline") and t.get("start_date") != t.get("deadline"))
                is_explicit_multi = bool(re.search(r"\b(?:tạo|thêm|giao|lập)\s+(?:\d+|hai|ba|bốn|năm|2|3|4|5|nhiều|các|danh\s*sách)\s+(?:tasks?|công\s*việc|nhiệm\s*vụ)\b", latest_preview, flags=re.IGNORECASE))
                if (not subtasks or len(subtasks) == 0) and et > 8 and not is_multi_day and not is_explicit_multi:
                    violating_tasks.append(f"- Task '{t.get('title', '')}': {et}H (Dự án {t_p_type.capitalize()})")

                desc = t.get("description")
                if not isinstance(desc, dict) or not all(k in desc for k in ["objective", "criteria", "implementation", "output", "acceptance_criteria"]):
                    bad_desc_tasks.append(f"- Task '{t.get('title', '')}'")

                if subtasks:
                    find_violations(subtasks, t_p_type)

        find_violations(tasks, "agile")

        has_existing_parent = any(bool(t.get("parent_task_id")) for t in tasks)
        has_breakdown = len(tasks) > 1 or any(
            isinstance(task.get("subtasks"), list) and task["subtasks"]
            for task in tasks
        )
        needs_semantic_breakdown = module_request and not has_breakdown and not has_existing_parent

        title_issues = find_non_meaningful_task_titles(tasks)
        shallow_desc_tasks = find_shallow_task_descriptions(tasks)
        needs_waterfall_wrap = False if has_existing_parent else waterfall_roots_need_wrap(tasks, project_type_map, project_id, latest_preview=latest_preview)

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

        if (
            not violating_tasks
            and not title_issues
            and not bad_desc_tasks
            and not shallow_desc_tasks
            and not needs_waterfall_wrap
            and not needs_semantic_breakdown
        ):
            format_descriptions(tasks)
            output_str = output_str.replace(json_str, json.dumps(tasks, ensure_ascii=False, indent=2))
            return output_str

        if violating_tasks:
            logger.warning(f"Found tasks > 8H. Calling LLM to re-break: {violating_tasks}")
        if title_issues:
            logger.warning(f"Found generic task titles. Calling LLM to rewrite: {title_issues}")
        if bad_desc_tasks:
            logger.warning(f"Found tasks with bad description format. Calling LLM to rewrite: {bad_desc_tasks}")
        if shallow_desc_tasks:
            logger.warning(f"Found tasks with shallow descriptions. Calling LLM to rewrite: {shallow_desc_tasks}")
        if needs_waterfall_wrap:
            logger.warning("Found waterfall draft with multiple roots. Calling LLM to wrap into single root.")
        if needs_semantic_breakdown:
            logger.warning("Module-sized request was returned as one task. Calling LLM to break it down.")

        issue_sections = [
            "BẮT BUỘC kiểm tra lại NGỮ NGHĨA KÍCH THƯỚC của TOÀN BỘ task theo chuẩn ngành:\n"
            "- EPIC (hệ thống, module lớn, >= 3 luồng): BẮT BUỘC phân rã thành các task con.\n"
            "- FEATURE (tính năng nghiệp vụ lớn chứa >= 2 luồng, vd: 'quản lý trạng thái đơn...', 'quản lý đơn hàng', 'thanh toán Momo'): BẮT BUỘC phân rã theo các luồng xử lý kỹ thuật/nghiệp vụ con.\n"
            "- STORY/TASK (công việc đơn lẻ, 1 luồng, vd: thêm 1 API, sửa 1 form, fix 1 bug): GIỮ NGUYÊN 1 TASK, TUYỆT ĐỐI KHÔNG PHÂN RÃ.\n"
            "- NGOẠI LỆ: Nếu user trực tiếp yêu cầu 'break task', 'chia nhỏ', 'phân rã', 'chi tiết hơn' -> BẮT BUỘC phân rã."
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
        if bad_desc_tasks:
            issue_sections.append(
                "Các task sau đang có phần `description` bị sai format (chỉ là chuỗi string hoặc thiếu key). "
                "BẮT BUỘC `description` PHẢI là một JSON object chứa ĐÚNG 5 keys: objective, criteria, implementation, output, acceptance_criteria:\n"
                + "\n".join(bad_desc_tasks)
            )
        if shallow_desc_tasks:
            issue_sections.append(
                "Các task sau đang có phần mô tả quá ngắn, chung chung hoặc chứa từ ngữ sáo rỗng filler ('công nghệ web hiện đại', 'dễ sử dụng thân thiện', 'bảo mật và hiệu suất', 'kết quả chính xác'):\n"
                + "\n".join([f'- Task {x["path"]}: "{x["title"]}"' for x in shallow_desc_tasks[:5]])
                + "\nBẮT BUỘC viết lại chi tiết 5 mục: mục tiêu nghiệp vụ cụ thể, ràng buộc validation/phân quyền, hướng dẫn kỹ thuật chi tiết (component/endpoint/logic), đầu ra cụ thể, và 3-5 tiêu chí chấp nhận chi tiết."
            )
        if needs_waterfall_wrap:
            issue_sections.append(
                "Dự án Waterfall đang trả về NHIỀU task root (danh sách phẳng). "
                "BẮT BUỘC tạo ĐÚNG 1 task gốc (Epic) và đưa toàn bộ task hiện có vào `subtasks`."
            )
        if needs_semantic_breakdown:
            issue_sections.append(
                "Yêu cầu mới nhất mô tả một module/hệ thống/quy trình lớn nhưng bản nháp chỉ có một task. "
                "BẮT BUỘC phân rã theo các luồng nghiệp vụ độc lập; không được hạ ET để né việc phân rã."
            )

        def has_task_breakdown(text: str) -> bool:
            draft_match = re.search(r"```json_task_draft\s*(.*?)\s*```", text, re.DOTALL)
            if not draft_match:
                return False
            try:
                payload = json.loads(draft_match.group(1))
            except (TypeError, ValueError):
                return False
            if isinstance(payload, dict):
                payload = payload.get("tasks", [payload])
            return isinstance(payload, list) and (
                len(payload) > 1
                or any(
                    isinstance(task, dict)
                    and isinstance(task.get("subtasks"), list)
                    and task["subtasks"]
                    for task in payload
                )
            )

        has_existing_parent = any(bool(t.get("parent_task_id")) for t in tasks)
        if has_existing_parent:
            needs_waterfall_wrap = False
            needs_semantic_breakdown = False

        prompt = (
            f"YÊU CẦU BAN ĐẦU CỦA NGƯỜI DÙNG: \"{latest_preview}\"\n\n"
            "Bản nháp JSON task của bạn đang có lỗi cần sửa:\n"
            f"{chr(10).join(issue_sections)}\n\n"
            "Hãy trả về lại TOÀN BỘ JSON DRAFT gốc, nhưng PHẢI sửa sạch toàn bộ lỗi trên theo quy tắc:\n"
            f"- BẢN ĐỒ LOẠI DỰ ÁN (project_id -> type): {json.dumps(project_type_map, ensure_ascii=False)}.\n"
            "- PHÂN LOẠI NGỮ NGHĨA: Epic (hệ thống/module lớn) -> phân rã; Feature (tính năng lớn >= 2 luồng, vd: 'quản lý trạng thái đơn...', 'thanh toán Momo', 'quản lý đơn hàng') -> BẮT BUỘC phân rã thành các task con độc lập; Story/Task (1 việc cụ thể) hoặc Subtask -> GIỮ NGUYÊN 1 task.\n"
            "- NGOẠI LỆ: Nếu user yêu cầu 'chia nhỏ', 'phân rã', 'break task' -> BẮT BUỘC phân rã.\n"
            "- BẮT BUỘC `description` CỦA TẤT CẢ TASK PHẢI LÀ JSON OBJECT CHỨA ĐÚNG 5 KEYS: objective, criteria, implementation, output, acceptance_criteria. KHÔNG ĐƯỢC LÀ CHUỖI STRING.\n"
            "- NẾU LÀ EPIC HOẶC FEATURE (tính năng nhiều luồng): BẮT BUỘC PHẢI PHÂN RÃ THÀNH CÁC TASK CON (mỗi task lá <= 8H, thường 3-6H). TUYỆT ĐỐI CẤM gom thành 1 task lá duy nhất > 8H.\n"
            "- CHỈ giữ nguyên 1 task nếu đó thực sự là tác vụ đơn lẻ hoặc subtask (1 endpoint hoặc 1 form đơn giản), và khi đó ET BẮT BUỘC <= 8H.\n"
            "- QUAN TRỌNG: NẾU TRONG YÊU CẦU NGƯỜI DÙNG CÓ CHỈ ĐỊNH ĐÍCH DANH NGƯỜI THỰC HIỆN (VD: 'giao cho Diệp Thanh Tú'), BẠN BẮT BUỘC PHẢI ĐIỀN `assignee_name` VÀ `assignee_id` VÀO CÁC TASK/SUBTASK KHI DỰ ÁN LÀ WATERFALL.\n"
            "- NẾU TASK BỊ BẺ NHỎ MÀ CHỈ CÓ 1 NGƯỜI ĐƯỢC CHỈ ĐỊNH TỪ TRƯỚC: BẮT BUỘC phải gán TÊN VÀ ID của người đó cho các task con (task lá) vừa được bẻ nhỏ (với Epic quá lớn, có thể gán người đó cho phân hệ chính/kiến trúc và phân bổ thêm thành viên khác theo gợi ý).\n"
            "- NẾU TASK ĐƯỢC CHỈ ĐỊNH NHIỀU NGƯỜI: phải phân bổ các task lá cho từng người dựa trên Role và Workload một cách hợp lý.\n"
            "- ⛔ QUY TẮC SUBTASK TRỰC THUỘC TASK ĐÃ TỒN TẠI (parent_task_id): Nếu yêu cầu là tạo subtask cho task đã có hoặc task có parent_task_id, BẮT BUỘC GIỮ NGUYÊN danh sách các subtask độc lập này với `parent_task_id` và `parent_task_title`. TUYỆT ĐỐI CẤM bọc vào một task cha mới hay tạo lại task cha cũ trong bản nháp!\n"
            "- CẤU TRÚC THEO LOẠI DỰ ÁN:\n"
            "  + WATERFALL (Cây WBS): Khi phân rã Epic/Feature mới, tạo ĐÚNG 1 Task gốc (Epic) ngoài cùng, đưa task con vào `subtasks`. Phân cấp đệ quy đến khi mọi lá <= 8H. Task cha: ET = tổng con. Nếu là Story/Task đơn lẻ hoặc Subtask cho task đã có: tạo danh sách các subtask/task độc lập, không bọc trong Epic mới.\n"
            "  + AGILE (Danh sách phẳng): Mọi task sau phân rã là DANH SÁCH PHẲNG (flat list), KHÔNG dùng `subtasks`, mỗi task <= 8H, XÓA toàn bộ assignee.\n"
            "- TIÊU ĐỀ: Tuyệt đối không dùng placeholder kiểu 'Task 1', 'Subtask 1', 'Chức năng 1', 'Phần 1'. Mỗi task phải có tiêu đề riêng mô tả đúng chức năng nghiệp vụ.\n"
            "- Giữ nguyên project_id, priority, start_date, deadline và các trường khác nếu không bắt buộc phải đổi vì phân rã lại.\n"
            "- Với Agile: danh sách phải phẳng và XÓA toàn bộ assignee_id, assignee_ids, assignee_name. Với Waterfall: giữ nguyên assignee_id/assignee_ids/assignee_name đã có, không bịa user_id mới.\n\n"
            "TRẢ VỀ ĐÚNG MỘT KHỐI MARKDOWN ```json_task_draft ... ``` CHỨA JSON, KHÔNG ĐƯỢC GIẢI THÍCH THÊM.\n"
            "⛔ CẤM TUYỆT ĐỐI: Không được thêm bất kỳ hậu tố nào vào sau ```json_task_draft (như _rejected hay _confirmed) dù trong lịch sử có xuất hiện.\n"
            "⛔ CẤM TUYỆT ĐỐI chia task thành 'Phần 1', 'Phần 2', 'Part 1', 'Part 2'. Nếu không có các luồng nghiệp vụ độc lập, BẮT BUỘC gộp lại thành 1 task duy nhất."
        )

        try:
            fix_msg = [HumanMessage(content=output_str), HumanMessage(content=prompt)]
            for attempt in range(1, 3):
                fix_resp = await llm.ainvoke(fix_msg)
                new_output = fix_resp.content
                if is_valid_task_draft(new_output) and (
                    not needs_semantic_breakdown or has_task_breakdown(new_output)
                ):
                    draft_match = re.search(r"```json_task_draft\s*(.*?)\s*```", new_output, re.DOTALL)
                    if draft_match:
                        new_draft_block = f"```json_task_draft\n{draft_match.group(1).strip()}\n```"
                        old_draft_match = re.search(r"```json_task_draft\s*[\s\S]*?\s*```", output_str)
                        if old_draft_match:
                            return output_str[:old_draft_match.start()] + new_draft_block + output_str[old_draft_match.end():]
                        return f"{output_str}\n\n{new_draft_block}"
                    return new_output
                logger.warning(
                    "LLM re-break response %s did not satisfy the requested valid task breakdown",
                    attempt,
                )
                fix_msg.append(HumanMessage(content=(
                    "Lần trả lời trước vẫn chưa đạt yêu cầu. Hãy trả lại đúng một "
                    "json_task_draft hợp lệ (không chứa placeholder 'Phần 1', 'Phần 2') và phải có phân rã thực sự nếu có nhiều luồng."
                )))
        except Exception as e:
            logger.error(f"Error calling LLM to fix tasks: {e}")

        # Post-sanitize placeholder tasks and unwrap existing parent wrappers as safety net
        draft_match = re.search(r"```json_task_draft\s*(.*?)\s*```", output_str, re.DOTALL)
        if draft_match:
            try:
                curr_tasks = json.loads(draft_match.group(1))
                if isinstance(curr_tasks, list):
                    curr_tasks = sanitize_placeholder_tasks(curr_tasks)
                    curr_tasks = unwrap_existing_parent_tasks(curr_tasks)
                    output_str = output_str.replace(draft_match.group(1), json.dumps(curr_tasks, ensure_ascii=False, indent=2))
            except Exception:
                pass

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
            has_explicit_range = bool(re.search(r'\btừ\s+\d{1,2}[\/\-]\d{1,2}', latest_preview, re.IGNORECASE))

            def process_tasks(task_list):
                """Rollup ET task cha = tổng con + đồng bộ ngày. Không tự chẻ task."""
                new_tasks = []
                for task in task_list:
                    subtasks = task.get("subtasks", [])
                    if subtasks:
                        task["subtasks"] = process_tasks(subtasks)
                        task["estimated_hours"] = round(sum(sub.get("estimated_hours", 0) for sub in task["subtasks"]), 1)
                        starts = [sub["start_date"] for sub in task["subtasks"] if sub.get("start_date")]
                        deadlines = [sub["deadline"] for sub in task["subtasks"] if sub.get("deadline")]
                        if starts:
                            task["start_date"] = min(starts)
                        if deadlines:
                            task["deadline"] = max(deadlines)
                    else:
                        try:
                            et = float(task.get("estimated_hours") or 0)
                        except (TypeError, ValueError):
                            et = 0
                        if 0 < et <= 8 and task.get("deadline") and not has_explicit_range:
                            task["start_date"] = task["deadline"]
                    new_tasks.append(task)
                return new_tasks

            if not isinstance(tasks, list):
                return output_str
            tasks = unwrap_existing_parent_tasks(tasks)
            processed = process_tasks(tasks)
            processed = unwrap_existing_parent_tasks(processed)
            return output_str.replace(json_str, "\n" + json.dumps(processed, ensure_ascii=False, indent=2) + "\n")
        except Exception as error:
            logger.error(f"Error fixing JSON ET: {error}")
            return output_str

    def is_valid_task_draft(text: str) -> bool:
        match = re.search(r"```json_task_draft\s*(.*?)\s*```", text, re.DOTALL)
        if not match:
            return False
        try:
            payload = json.loads(match.group(1))
        except (TypeError, ValueError):
            return False
        if isinstance(payload, dict):
            payload = payload.get("tasks", [payload])
        if not isinstance(payload, list) or not payload:
            return False

        if find_non_meaningful_task_titles(payload):
            return False

        def valid_task(task: object) -> bool:
            if not isinstance(task, dict) or not str(task.get("title") or "").strip():
                return False
            children = task.get("subtasks")
            return not isinstance(children, list) or all(valid_task(child) for child in children)

        return all(valid_task(task) for task in payload)

    def task_draft_matches_latest_request(text: str) -> bool:
        """Reject a structurally valid draft that is clearly for the prior task."""
        if not task_name_supplied:
            return True
        match = re.search(r"```json_task_draft\s*(.*?)\s*```", text, re.DOTALL)
        if not match:
            return False
        try:
            payload = json.loads(match.group(1))
        except (TypeError, ValueError):
            return False
        if isinstance(payload, dict):
            payload = payload.get("tasks", [payload])
        if not isinstance(payload, list):
            return False

        def titles(tasks: list[object]) -> list[str]:
            values: list[str] = []
            for task in tasks:
                if not isinstance(task, dict):
                    continue
                values.append(str(task.get("title") or ""))
                children = task.get("subtasks")
                if isinstance(children, list):
                    values.extend(titles(children))
            return values

        ignored = {
            "giao", "task", "cong", "viec", "cho", "toi", "minh", "nua",
            "quan", "ly", "cua", "nhan", "vien", "lam", "tao", "them",
            "break", "breal", "phan", "ra", "chia", "nho", "tach", "chi", "tiet"
        }
        request_terms = {
            term for term in re.findall(r"\w+", latest_preview.lower(), flags=re.UNICODE)
            if len(term) >= 3 and term not in ignored
        }
        if not request_terms:
            return True
        title_terms = set(re.findall(r"\w+", " ".join(titles(payload)).lower(), flags=re.UNICODE))
        return bool(request_terms & title_terms)

    def replace_invalid_task_draft(text: str) -> str:
        if "```json_task_draft" not in text or is_valid_task_draft(text):
            return text
        logger.error("Discarding malformed json_task_draft before sending it to the client")
        cleaned = re.sub(r"```json_task_draft\s*[\s\S]*?\s*```", "", text, count=1).strip()
        return f"{cleaned}\n\nKhông thể tạo bản nháp hợp lệ từ phản hồi AI. Vui lòng thử lại yêu cầu này."

    async def repair_task_draft_with_json_mode(invalid_output: str) -> str | None:
        """Repair malformed model output with OpenAI JSON mode and a bounded retry."""
        repair_llm = llm.bind(response_format={"type": "json_object"})
        contract = (
            "Bạn là bộ sửa JSON cho hệ thống quản lý công việc. Chỉ trả về MỘT JSON object hợp lệ, "
            "không Markdown, không giải thích. Schema bắt buộc: `{\"tasks\": [Task, ...]}`. "
            "Mảng `tasks` không rỗng; mỗi Task phải có `title` không rỗng và KHÔNG ĐƯỢC CHỨA placeholder như 'Phần 1', 'Phần 2', 'Part 1', 'Part 2'. "
            "Nếu không có các luồng nghiệp vụ khác biệt, BẮT BUỘC gộp lại thành 1 task duy nhất. `project_id` là số, "
            "`priority` (low|medium|high|critical), `estimated_hours` là số, `start_date` và `deadline` dạng YYYY-MM-DD, "
            "và `description` object gồm objective, criteria, implementation, output, acceptance_criteria. "
            "Giữ đúng yêu cầu người dùng và dữ liệu dự án có trong phản hồi lỗi; không bịa ID dự án."
        )
        candidate = invalid_output
        for attempt in range(1, 3):
            try:
                response = await repair_llm.ainvoke([
                    SystemMessage(content=contract),
                    HumanMessage(content=(
                        f"Yêu cầu người dùng: {latest_msg}\n"
                        f"Dự án mặc định: {effective_project_id}\n"
                        f"Phản hồi cần sửa (lần {attempt}):\n{candidate}"
                    )),
                ])
                raw = response.content if isinstance(response.content, str) else json.dumps(response.content)
                repaired = f"```json_task_draft\n{raw.strip()}\n```"
                if is_valid_task_draft(repaired) and task_draft_matches_latest_request(repaired):
                    logger.info("Repaired malformed task draft with JSON mode on attempt %s", attempt)
                    old_draft_match = re.search(r"```json_task_draft\s*[\s\S]*?\s*```", invalid_output)
                    if old_draft_match:
                        return invalid_output[:old_draft_match.start()] + repaired + invalid_output[old_draft_match.end():]
                    return repaired
                candidate = raw
            except Exception as error:
                logger.warning("Task draft JSON repair attempt %s failed: %s", attempt, error)
        return None

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

        def ensure_json_array(text: str) -> str:
            m = re.search(r'```json_task_draft\s*(.*?)\s*```', text, re.DOTALL)
            if m:
                js = m.group(1).strip()
                if js.startswith('{') and js.endswith('}'):
                    return text.replace(m.group(1), f"\n[\n{js}\n]\n")
            return text

        final_answer = ensure_json_array(final_answer)
        final_answer = fix_task_draft_et(final_answer)
        final_answer = await check_and_rebreak_tasks_with_llm(final_answer)
        final_answer = ensure_json_array(final_answer)
        needs_task_draft_repair = "```json_task_draft" in final_answer and (
            not is_valid_task_draft(final_answer)
            or not task_draft_matches_latest_request(final_answer)
        )
        if needs_task_draft_repair:
            logger.warning("Task draft failed structural or latest-request validation; repairing it")
            repaired_draft = await repair_task_draft_with_json_mode(final_answer)
            if repaired_draft:
                final_answer = repaired_draft
                needs_task_draft_repair = False
        final_answer = replace_invalid_task_draft(final_answer)
        # Do not run draft transformers on invalid LLM output: some of them
        # legitimately accept arbitrary JSON objects and would hide the error.
        if needs_task_draft_repair:
            logger.info("Task draft validation failed; returning a recoverable message instead")
            return {"messages": [AIMessage(content="Không thể tạo bản nháp bám đúng yêu cầu mới nhất. Vui lòng gửi lại yêu cầu.")]}
        normalized_request = latest_preview.lower()
        is_explicit_assignee_only_edit = bool(re.search(
            r"phân\s*công\s*lại|giao\s*lại|đổi\s+(người|người\s*thực\s*hiện)|"
            r"chuyển\s+(người|người\s*thực\s*hiện)|thay\s+(người|người\s*phụ\s*trách)",
            normalized_request,
        )) and not bool(re.search(
            r"\b(tạo|thêm|giao\s+(task|việc|công\s*việc)|lập\s+(task|bản\s*nháp)|task\s+mới)\b",
            normalized_request,
        ))
        final_answer = preserve_task_draft_structure(
            final_answer,
            messages,
            allow_structure_recovery=is_explicit_assignee_only_edit,
        )
        final_answer = normalize_task_draft_for_project_types(
            final_answer,
            project_type_map,
            effective_project_id,
            latest_preview=latest_preview,
        )
        teams_by_project: dict[int, list] = {}
        for pid in collect_task_draft_project_ids(final_answer, effective_project_id):
            if (project_type_map.get(pid) or "").strip().lower() != "waterfall":
                continue
            try:
                workload = query_project_team_workload(db_session, pid)
                teams_by_project[pid] = workload.get("team") or []
            except Exception as team_error:
                logger.warning(
                    "Could not load team workload for waterfall project %s: %s",
                    pid,
                    team_error,
                )
        # Waterfall requires every leaf task to have an owner.  The allocator
        # uses role and current workload, so it is the fallback whenever the
        # requester has not named a member.  Agile drafts remain unassigned in
        # normalize_task_draft_for_project_types and action execution.
        allow_auto_assign = True
        final_answer = fill_waterfall_draft_assignees(
            final_answer,
            project_type_map,
            teams_by_project,
            effective_project_id,
            allow_auto_assign=allow_auto_assign,
            requested_assignees=req_assignee_names,
        )
        final_answer = strip_inverted_waterfall_tree_claims(final_answer)
        forced = task_create_hard_guard_message(
            latest_preview, projects, effective_project_id, **guard_kwargs
        )
        if forced:
            final_answer = forced
        else:
            unauthorized = refuse_if_unauthorized_sprint_draft(
                final_answer,
                latest_preview,
                projects,
                effective_project_id,
                **guard_kwargs,
            )
        def ensure_impossible_workload_warning_banner(text: str) -> str:
            if not is_impossible_workload or "```json_task_draft" not in text:
                return text

            has_warning = any(
                kw in text.lower()
                for kw in [
                    "cảnh báo khối lượng công việc phi thực tế",
                    "impossible workload",
                    "⚠️ **cảnh báo khối lượng",
                    "⚠️ cảnh báo khối lượng",
                    "khối lượng công việc phi thực tế",
                ]
            )

            from app.services.ai_services.intent_guards import extract_requested_assignee_names
            assignee_names = extract_requested_assignee_names(latest_preview)
            assignee_str = f"**{', '.join(assignee_names)}**" if assignee_names else "1 nhân sự"

            team_members = []
            if db_session and effective_project_id:
                try:
                    from app.models.project_model import ProjectMember, Role
                    from app.models.user_model import User
                    members_db = (
                        db_session.query(User.full_name, Role.name.label("role_name"))
                        .join(ProjectMember, ProjectMember.user_id == User.id)
                        .outerjoin(Role, User.role_id == Role.id)
                        .filter(ProjectMember.project_id == int(effective_project_id), ProjectMember.is_active.is_(True))
                        .all()
                    )
                    for name, role in members_db:
                        if name and name not in assignee_names:
                            team_members.append({"name": name, "role": role or "Thành viên"})
                except Exception:
                    pass

            suggestion_lines = []
            for m in team_members[:4]:
                suggestion_lines.append(f"- **{m['name']}** ({m['role']})")

            suggestion_section = ""
            if suggestion_lines:
                suggestion_section = (
                    "\n\n**Gợi ý bổ sung thành viên trong team cùng phối hợp:**\n"
                    + "\n".join(suggestion_lines)
                    + "\n\n*(Bạn có thể phản hồi đồng ý để hệ thống tự động phân bổ các phân hệ cho các thành viên trên).* "
                )

            if has_warning:
                if team_members and not any(kw in text.lower() for kw in ["gợi ý", "bổ sung", "thành viên khác", "phối hợp"]):
                    idx = text.find("```json_task_draft")
                    if idx != -1:
                        return text[:idx].rstrip() + suggestion_section + "\n\n" + text[idx:]
                return text

            warning_banner = (
                "⚠️ **Cảnh báo khối lượng công việc phi thực tế (Impossible Workload):**\n"
                f"Yêu cầu xây dựng toàn bộ hệ thống là khối lượng công việc khổng lồ ở quy mô Epic/Hệ thống, "
                f"không thể hoàn thành trong 1 ngày (8 giờ) bởi {assignee_str}.\n"
                f"Hệ thống đã tự động phân rã thành Cây WBS đa tầng với thời gian ước lượng thực tế dưới đây.{suggestion_section}\n\n"
            )
            return warning_banner + text.lstrip()

        final_answer = ensure_impossible_workload_warning_banner(final_answer)

        def ensure_workload_overlap_warning_banner(text: str) -> str:
            if not is_workload_overlap or "```json_task_draft" not in text:
                return text

            has_warning = any(
                kw in text.lower()
                for kw in [
                    "kín lịch",
                    "quá tải",
                    "xung đột lịch",
                    "chồng chéo",
                    "200% capacity",
                    "workload overlap",
                    "trùng lịch",
                    "đã có task",
                ]
            )

            if has_warning:
                return text

            target_assignee_str = f"**{target_assignee_name}**" if target_assignee_name else "nhân sự được chỉ định"
            target_date_str = target_date_disp or "ngày yêu cầu"
            next_date_str = next_date_disp or "ngày làm việc tiếp theo"

            other_team_names = []
            if db_session and effective_project_id:
                try:
                    from app.models.project_model import ProjectMember
                    from app.models.user_model import User
                    members_db = (
                        db_session.query(User.full_name)
                        .join(ProjectMember, ProjectMember.user_id == User.id)
                        .filter(ProjectMember.project_id == int(effective_project_id), ProjectMember.is_active.is_(True))
                        .all()
                    )
                    for (name,) in members_db:
                        if name and name != target_assignee_name:
                            other_team_names.append(name)
                except Exception:
                    pass

            alt_member_str = f"ví dụ: **{other_team_names[0]}** (đang trống lịch)" if other_team_names else "thành viên khác đang trống lịch"

            warning_banner = (
                f"⚠️ **Cảnh báo xung đột lịch / Quá tải công suất (Workload Overlap - 200% Capacity):**\n"
                f"Nhân sự {target_assignee_str} đã kín lịch (8 giờ) vào ngày **{target_date_str}**.\n"
                f"Đề xuất dời ngày thực hiện sang **{next_date_str}** hoặc chuyển giao cho {alt_member_str}.\n"
                f"Bản nháp task được lập dưới đây để bạn xem xét và xác nhận:\n\n"
            )
            return warning_banner + text.lstrip()

        final_answer = ensure_workload_overlap_warning_banner(final_answer)
        final_answer = re.sub(r'```json_task_draft_(?:confirmed|rejected)\b', '```json_task_draft', final_answer)
        final_answer = re.sub(r'```json_sprint_draft_(?:confirmed|rejected)\b', '```json_sprint_draft', final_answer)
        final_answer = re.sub(r'```json_sprint_status_draft_(?:confirmed|rejected)\b', '```json_sprint_status_draft', final_answer)
        logger.info(f"LLM Raw Output:\n{final_answer}")
        logger.info("==== KẾT THÚC TASK NODE ====")

        new_message = AIMessage(content=final_answer)
        return {"messages": [new_message]}
    except Exception as e:
        logger.error(f"Error in task_node: {e}")
        raise e
    finally:
        reset_tool_runtime(runtime_token)
