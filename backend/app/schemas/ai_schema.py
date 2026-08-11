from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class QuickResponseAction(str, Enum):
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


class ConfirmTasksRequest(BaseModel):
    project_id: Optional[int] = None
    tasks_data: list[dict] = Field(description="Danh sách task nháp được UI gửi lên để confirm")
    message_id: Optional[int] = None


class ConfirmTasksResponse(BaseModel):
    message: str
    created_task_ids: list[int]


class ConfirmSprintStatusRequest(BaseModel):
    updates: list[dict] = Field(
        description="Danh sách cập nhật trạng thái sprint: sprint_id, status"
    )
    message_id: Optional[int] = None


class ConfirmSprintStatusResponse(BaseModel):
    message: str
    updated: list[dict]


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
            "- 'qna': Tra cứu thông tin, đọc dữ liệu, phân tích tiến độ, xin lời khuyên (chỉ đọc).\n"
            "- 'task': Tạo mới / phân công task hoặc tạo/đổi sprint qua bản nháp UI (không gồm xóa).\n"
            "- 'out_of_scope': Ngoài phạm vi, HOẶC yêu cầu xóa task/hết dữ liệu, HOẶC SQL ghi "
            "(DELETE/UPDATE/DROP/TRUNCATE)."
        )
    )
