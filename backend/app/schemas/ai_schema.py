from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class QuickResponseAction(str, Enum):
    DAILY_PRIORITY = "daily_priority"
    STALLED_TASKS = "stalled_tasks"
    CRITICAL_OVERDUE = "critical_overdue"
    FOLLOW_UP_MEMBERS = "follow_up_members"
    LEADER_BRIEF = "leader_brief"
    TASK_HEALTH = "task_health"
    GENERAL_QNA = "general_qna"
    OUT_OF_SCOPE = "out_of_scope"
    TASK_ASSIGNMENT = "task_assignment"


class QuickResponseRequest(BaseModel):
    action: Optional[QuickResponseAction] = None
    prompt: Optional[str] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    intent: Optional[str] = None


class ClassifyIntentResponse(BaseModel):
    intent: str


class QuickResponseEntity(BaseModel):
    type: Literal["task", "user", "project"]
    id: str
    label: str
    meta: Optional[str] = None


class QuickResponseResponse(BaseModel):
    action: QuickResponseAction
    title: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    entities: list[QuickResponseEntity] = Field(default_factory=list)
    generated_at: datetime
    data_freshness_note: str


class ConfirmTasksRequest(BaseModel):
    project_id: Optional[int] = None
    tasks_data: list[dict] = Field(description="Danh sách task nháp được UI gửi lên để confirm")


class ConfirmTasksResponse(BaseModel):
    message: str
    created_task_ids: list[int]


class AiMessageResponse(BaseModel):
    id: int
    sender: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class AiSessionResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreateAiSessionRequest(BaseModel):
    title: Optional[str] = "Cuộc trò chuyện mới"


class RouterSchema(BaseModel):
    next_node: Literal["qna", "task", "out_of_scope"] = Field(
        description=(
            "Lựa chọn luồng xử lý tiếp theo dựa trên ý định của người dùng:\n"
            "- 'qna': Dành cho việc tra cứu thông tin, đọc dữ liệu, phân tích tiến độ, xin lời khuyên, hỏi đáp (Chỉ yêu cầu đọc dữ liệu).\n"
            "- 'task': Dành riêng cho các yêu cầu mang tính sai khiến, ra lệnh TẠO MỚI công việc, hoặc chia nhỏ phân công công việc (Cần sinh ra dữ liệu mới).\n"
            "- 'out_of_scope': Khi câu hỏi hoàn toàn không liên quan đến công việc, phần mềm, hay quản lý dự án."
        )
    )


class QnAOutputSchema(BaseModel):
    title: str = Field(
        description="Tiêu đề ngắn gọn, bao quát ý chính của toàn bộ câu trả lời (VD: 'Tình hình tiến độ dự án Alpha', 'Danh sách các task đang trễ hạn')."
    )
    summary: str = Field(
        description="Nội dung trả lời chi tiết, diễn đạt tự nhiên như một trợ lý ảo giao tiếp với con người. Phải đi thẳng vào vấn đề, trả lời trực tiếp câu hỏi dựa trên dữ liệu đã tra cứu được, không vòng vo. Nếu có số liệu thì phải trích xuất chính xác."
    )
    evidence: list[str] = Field(
        default_factory=list,
        description="Danh sách các dẫn chứng cụ thể (bullet points) để minh họa cho phần summary. Ví dụ: các số liệu thống kê cụ thể, tên các task kèm ID, tên người phụ trách, thời hạn (deadline). Nếu không có dữ liệu dẫn chứng, hãy trả về mảng rỗng.",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="Danh sách các đề xuất hành động tiếp theo cho người dùng dựa trên dữ liệu hiện tại (VD: 'Nên nhắc nhở Nguyễn Văn A vì có 3 task quá hạn', 'Cần phân bổ thêm người cho dự án này'). Trả về mảng rỗng nếu không có đề xuất rõ ràng.",
    )


class DraftTaskSchema(BaseModel):
    title: str = Field(
        description="Tiêu đề (tên) của công việc. Phải ngắn gọn, rõ ràng, thể hiện trực tiếp hành động cần làm (VD: 'Thiết kế giao diện Login', 'Viết API tạo user')."
    )
    description: str = Field(
        description="Mô tả chi tiết nội dung công việc. Nếu người dùng không cung cấp hoặc cung cấp quá sơ sài, BẠN PHẢI TỰ ĐỘNG SUY LUẬN TỪ TIÊU ĐỀ và viết ra một mô tả chi tiết, chuyên nghiệp (bao gồm các bước thực hiện, yêu cầu đầu ra, hoặc Acceptance Criteria)."
    )
    assignee_id: Optional[int] = Field(
        default=None,
        description="ID của người được giao việc (user_id). BẠN BẮT BUỘC PHẢI TÌM CHÍNH XÁC user_id trong cơ sở dữ liệu (thông qua project_members hoặc users) để điền vào đây. Nếu không tìm thấy, nếu người đó đang quá tải, hoặc người dùng chưa chỉ định, hãy để null.",
    )
    priority: str = Field(
        description="Mức độ ưu tiên của công việc. Bắt buộc phải là một trong các giá trị sau: 'low', 'medium', 'high', 'urgent'. Hãy tự phân tích ngữ cảnh để chọn mức độ phù hợp."
    )
    subtasks: Optional[list['DraftTaskSchema']] = Field(
        default=None,
        description="Danh sách các công việc con (nếu đây là một Task to cần phân rã theo dạng cây).",
    )
    parent_task_id: Optional[int] = Field(
        default=None,
        description="ID của task cha NẾU người dùng yêu cầu thêm subtask vào một task đã có sẵn trong hệ thống.",
    )


class TaskOutputSchema(BaseModel):
    title: str = Field(
        description="Tiêu đề tổng quan phản hồi lại người dùng (VD: 'Đề xuất kế hoạch công việc Backend Sprint 1')."
    )
    summary: str = Field(
        description="Đoạn văn ngắn (2-3 câu) tóm tắt lại những gì bạn đã phân tích, lý do bạn chia task như vậy, tình trạng nhân sự hiện tại, và nhắc nhở người dùng kiểm tra lại danh sách task bên dưới."
    )
    draft_tasks: list[DraftTaskSchema] = Field(
        description="Danh sách các công việc cụ thể được bóc tách từ yêu cầu của người dùng. Mỗi phần tử là một task độc lập được cấu trúc rõ ràng."
    )
