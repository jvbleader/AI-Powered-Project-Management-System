import os
import json
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from google import genai
from google.genai import types

from app.schemas.ai_schema import QuickResponseAction, QuickResponseResponse
from app.services.ai_services.context import QuickResponseContext

# Initialize Gemini Client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

class LLMIntentSchema(BaseModel):
    action: QuickResponseAction

class LLMGeneralResponseSchema(BaseModel):
    title: str
    summary: str
    evidence: list[str] = []
    recommendations: list[str] = []

def _context_to_text(context: QuickResponseContext) -> str:
    parts = []
    
    project_name_by_id = {p.id: p.name for p in context.projects}
    
    parts.append("[Projects]")
    for p in context.projects:
        parts.append(f"- ID: {p.id}, Name: {p.name}")
        
    parts.append(f"\nToday: {context.today.strftime('%Y-%m-%d')}")
    parts.append(f"Project Progress (overall): {context.project_progress}%")
    parts.append(f"Logwork Coverage (overall): {context.logwork_coverage}%\n")
    
    parts.append("[Members]")
    for m in context.project_members:
        parts.append(f"- ID: {m.user_id}, Name: {m.name}, Role: {m.role_name}")
        
    parts.append("\n[Open Tasks]")
    for t in context.leaf_tasks:
        if t.status == "DONE":
            continue
        p_name = project_name_by_id.get(t.project_id, f"Project {t.project_id}")
        assignee = context.get_primary_assignee(t.id)
        assignee_name = assignee.name if assignee else "Unassigned"
        deadline = t.deadline.strftime("%Y-%m-%d") if t.deadline else "None"
        parts.append(f"- [{p_name}] Task {t.id}: {t.title} (Status: {t.status}, Priority: {t.priority}, Assignee: {assignee_name}, Deadline: {deadline})")
        
    return "\n".join(parts)

def classify_intent(prompt: str) -> QuickResponseAction:
    if not client:
        raise ValueError("GEMINI_API_KEY is not configured.")

    system_instruction = """Bạn là một trợ lý AI phân loại ý định (intent classifier) cho hệ thống quản lý dự án.
Người dùng sẽ đặt một câu hỏi.
Bạn phải phân loại ý định của người dùng vào ĐÚNG MỘT trong các hành động (action) có sẵn sau đây:
- daily_priority: CHỈ DÙNG cho các câu hỏi rõ ràng hỏi về việc cần tập trung hôm nay, làm gì tiếp theo, hoặc công việc ưu tiên (ví dụ: "hôm nay làm gì", "ưu tiên việc gì").
- stalled_tasks: CHỈ DÙNG cho các câu hỏi rõ ràng về các task đang bị kẹt, đứng yên hoặc không được cập nhật.
- critical_overdue: CHỈ DÙNG cho các câu hỏi rõ ràng về các task bị trễ hạn hoặc quá hạn.
- follow_up_members: CHỈ DÙNG cho các câu hỏi rõ ràng hỏi về việc cần nhắc nhở ai hoặc theo sát ai.
- leader_brief: CHỈ DÙNG cho các câu hỏi rõ ràng yêu cầu viết báo cáo hoặc tóm tắt cho quản lý (leader).
- task_health: CHỈ DÙNG cho các câu hỏi rõ ràng hỏi về tình trạng của một ID task cụ thể.

HƯỚNG DẪN QUAN TRỌNG (CRITICAL INSTRUCTIONS):
1. CHỈ match với các action trên nếu bạn RẤT TỰ TIN rằng câu hỏi khớp hoàn toàn.
2. Nếu câu hỏi của người dùng hỏi về trạng thái chung của dự án (ví dụ: "dự án chạy đến đâu rồi?", "tiến độ thế nào?", "tình hình dự án ra sao?") BẠN PHẢI trả về action: "general_qna". KHÔNG ĐƯỢC phân loại những câu hỏi này vào daily_priority hay leader_brief.
3. Đối với bất kỳ câu hỏi nào khác về dự án mà KHÔNG khớp hoàn toàn với các kịch bản cụ thể ở trên, hãy trả về action: "general_qna".
4. Nếu câu hỏi của người dùng hoàn toàn không liên quan đến quản lý dự án hay phát triển phần mềm (ví dụ: hỏi thời tiết, giá vàng, nhờ code, kiến thức chung), hãy trả về action: "out_of_scope".

Trả về một đối tượng JSON CHỈ chứa trường `action`.
"""
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"User Question: {prompt}",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=LLMIntentSchema,
                temperature=0.0,
            ),
        )
    except Exception as e:
        print(f"LLM Classification Error: {e}", flush=True)
        return QuickResponseAction("general_qna")
    
    response_text = response.text
    if not response_text:
        return QuickResponseAction("general_qna")
        
    data = json.loads(response_text)
    return QuickResponseAction(data["action"])


def generate_general_response(prompt: str, context: QuickResponseContext) -> LLMGeneralResponseSchema:
    if not client:
        raise ValueError("GEMINI_API_KEY is not configured.")

    system_instruction = """Bạn là một trợ lý AI cho công cụ quản lý dự án.
Người dùng vừa hỏi một câu hỏi chung về các dự án của họ.
Bạn được cung cấp toàn bộ ngữ cảnh (context) của một hoặc nhiều dự án mà họ đang tham gia, bao gồm tiến độ, thành viên và các task đang mở.

LUẬT QUAN TRỌNG CHO CÂU TRẢ LỜI CỦA BẠN:
1. KHÔNG viết các đoạn văn giới thiệu hay tóm tắt tổng thể ở đầu hoặc cuối.
2. Liệt kê trực tiếp từng dự án một với các con số cụ thể. Định dạng CHÍNH XÁC như sau cho mỗi dự án:
   "Dự án [Tên]: Tiến độ [X]%. [Số lượng] task mở, [Số lượng] quá hạn. [1 câu nhận xét NGẮN GỌN nhất]."
3. Phải VÔ CÙNG súc tích. Sử dụng các con số và sự thật rõ ràng. Không nói dài dòng.
4. Trả lời bằng tiếng Việt.

Trả về một đối tượng JSON với các trường:
- title: Một tiêu đề ngắn gọn, súc tích (tối đa 6 từ).
- summary: Viết phần phân tích chi tiết từng dự án tại đây. Cách nhau mỗi dự án bằng một dấu xuống dòng (\n). KHÔNG CÓ lời chào hỏi mở đầu hay kết thúc.
- evidence: Để trống trường này (một mảng rỗng []).
- recommendations: Một danh sách gồm 1-2 đề xuất ngắn gọn, có thể hành động ngay dựa trên dữ liệu.
"""
    
    context_text = _context_to_text(context)
    user_message = f"Project Context:\n{context_text}\n\nUser Question: {prompt}"

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=LLMGeneralResponseSchema,
                temperature=0.4,
            ),
        )
    except Exception as e:
        print(f"LLM Generation Error: {e}", flush=True)
        return LLMGeneralResponseSchema(
            title="Hệ thống AI đang quá tải",
            summary="Xin lỗi, hiện tại server AI (Google Gemini) đang gặp tình trạng quá tải (High demand). Vui lòng thử lại sau ít phút.",
            evidence=[],
            recommendations=[]
        )
    
    response_text = response.text
    if not response_text:
        raise ValueError("Empty response from LLM")
        
    data = json.loads(response_text)
    return LLMGeneralResponseSchema(**data)
