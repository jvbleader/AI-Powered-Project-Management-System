import asyncio
import os
from colorama import Fore, Style, init
from app.core.connection import SessionLocal
from app.models.user_model import User
from app.models.department_model import Department
from app.models.notification_model import Notification
from app.services.ai_services.graph import project_graph
from langchain_core.messages import HumanMessage
import uuid
import argparse

# Initialize colorama
init(autoreset=True)

# Define Test Cases (Based on AI_TEST_FLOW.md)
TEST_CASES = [
    {
        "level": "CẤP ĐỘ 2: Task Trung bình",
        "name": "Giao task cho người bị trùng tên",
        "prompt": "Tạo cho tôi một task 'Fix bug Login' ở dự án Method, giao cho Linh.",
        "expected": "AI KHÔNG TỰ Ý CHỌN MÀ PHẢI liệt kê danh sách những người tên Linh (kèm thông tin phân biệt) để user chọn."
    },
    {
        "level": "CẤP ĐỘ 4: Breakdown Task",
        "name": "Tạo Task lớn (Bắt buộc phân rã)",
        "prompt": "Tạo cho tôi tính năng 'Thanh toán qua ví MoMo' ở dự án Method. Deadline là cuối tháng này. Tự chia việc cho team sao cho hợp lý nhé.",
        "expected": "AI tạo 1 Task Cha và tự động phân rã thành các Subtasks nhỏ hơn."
    },
    {
        "level": "SIÊU THỰC TẾ 1: Quản lý rủi ro",
        "name": "Truy quét Task quá hạn để đôn đốc",
        "prompt": "Liệt kê cho tôi tất cả các task đang bị quá hạn (Overdue) trong dự án Method AI. Ghi rõ tên người đang ôm task đó để tôi đi giục.",
        "expected": "AI sử dụng tool query_tasks lọc các task trễ hạn (chưa done), và in ra danh sách kèm tên người gán."
    },
    {
        "level": "SIÊU THỰC TẾ 2: Điều phối nhân sự khẩn cấp",
        "name": "Xin nghỉ đột xuất và nhờ gán lại việc",
        "prompt": "Chiều nay tôi phải đi viện gấp. Hãy tìm trong dự án Method xem ai đang rảnh việc nhất (ít task nhất) thì gán hết các task Đang làm (In Progress) của tôi sang cho người đó làm đỡ nhé.",
        "expected": "AI tìm task của người dùng, tìm thành viên rảnh nhất qua get_user_workload, và dùng công cụ update_task để chuyển giao."
    },
    {
        "level": "SIÊU THỰC TẾ 3: Phân tích hiệu suất (SQL Fallback)",
        "name": "Bình chọn nhân viên chăm chỉ",
        "prompt": "Dựa vào dữ liệu chấm công (logwork) từ trước đến nay của dự án Method AI, hãy thống kê cho tôi Top 3 người làm việc chăm chỉ nhất (log nhiều giờ nhất).",
        "expected": "AI tự động dùng SQL Toolkit để query bảng logworks, group by và sum số giờ làm việc, kết nối với bảng user để in ra Top 3."
    },
    {
        "level": "SIÊU THỰC TẾ 4: Xử lý giao tiếp lóng ngóng",
        "name": "Yêu cầu mập mờ từ sếp",
        "prompt": "Sếp bảo cái màn hình trang chủ bị lệch css kìa, tạo ngay một bug assign cho thằng Hùng đi.",
        "expected": "AI nhận ra câu nói thiếu Ngữ cảnh dự án (Project ID) và tên Hùng có thể bị trùng/không rõ ràng. AI phải dừng lại và hỏi người dùng dự án nào và Hùng nào."
    },
    {
        "level": "LẮT LÉO 1: Phân quyền truy cập",
        "name": "Đòi xem dự án không có quyền",
        "prompt": "Lọc cho tôi danh sách các task đang làm trong dự án 'Tuyệt Mật Phi Vụ Triệu Đô'.",
        "expected": "AI kiểm tra danh sách accessible projects, thấy không có dự án này, từ chối trả lời và báo Không có quyền/Không tồn tại."
    },
    {
        "level": "LẮT LÉO 2: Đa dự án",
        "name": "Truy vấn dự án Agile (AI Computer Seller)",
        "prompt": "Trong dự án AI Computer Seller, team đã hoàn thành được bao nhiêu task rồi?",
        "expected": "AI tự nhận biết cần dùng Project ID của AI Computer Seller (chứ không phải Method), gọi query_tasks và đếm số task Done."
    },
    {
        "level": "LẮT LÉO 3: Tra cứu chéo nhiều dự án",
        "name": "So sánh khối lượng công việc",
        "prompt": "So sánh xem giữa dự án Method AI và dự án AI Computer Seller, team đang phải làm nhiều task hơn ở dự án nào?",
        "expected": "AI gọi query_tasks cho CẢ 2 dự án, đếm số task đang Active/In Progress và đưa ra so sánh."
    },
    {
        "level": "LẮT LÉO 4: Gài bẫy quy trình",
        "name": "Tạo Sprint cho dự án Waterfall",
        "prompt": "Trong dự án Method AI, tạo cho tôi một Sprint mới đặt tên là Sprint Khẩn Cấp để chạy deadline.",
        "expected": "AI check Project Type, phát hiện Method AI là Waterfall nên TỪ CHỐI khéo léo yêu cầu tạo Sprint."
    },
    {
        "level": "MEMORY TEST 1: Theo dõi ngữ cảnh",
        "name": "Tạo task và bổ sung thông tin (Follow-up)",
        "prompt": [
            "Tạo cho tôi một task mới tên là 'Thiết kế giao diện Đăng nhập', assign cho tôi.",
            "Ở dự án Method nhé. Deadline là thứ 6 tuần sau."
        ],
        "expected": "Step 1: AI hỏi tên dự án vì thiếu. Step 2: AI nhớ lại yêu cầu ở Step 1, kết hợp thông tin Step 2 để tạo task."
    },
    {
        "level": "MEMORY TEST 2: Hiểu đại từ nhân xưng",
        "name": "Hỏi thông tin tiếp nối",
        "prompt": [
            "Trong dự án Method, ai đang rảnh nhất (có ít task nhất)?",
            "Giao cho người đó task 'Tối ưu hóa Database' nhé."
        ],
        "expected": "Step 1: AI tìm ra người rảnh nhất. Step 2: AI hiểu 'người đó' là ai và tự động lấy ID để gán task."
    }
]

async def run_test_case(db, user, test_case, index):
    print(f"\n{Fore.CYAN}{'='*60}")
    print(f"{Fore.YELLOW}Test Case {index}: {test_case['name']} ({test_case['level']})")
    print(f"{Fore.WHITE}Prompt: {test_case['prompt']}")
    print(f"{Fore.GREEN}Expected: {test_case['expected']}")
    print(f"{Fore.CYAN}{'-'*60}")
    
    # Generate unique thread ID for each test to avoid memory pollution
    thread_id = f"test_auto_{uuid.uuid4().hex[:8]}"
    
    config = {
        "configurable": {
            "thread_id": thread_id,
            "db": db,
            "current_user": user,
            "project_id": test_case.get("project_id", None) # Tuỳ chọn truyền project ID mặc định
        }
    }
    
    prompts = test_case["prompt"]
    if isinstance(prompts, str):
        prompts = [prompts]
        
    print(f"{Fore.MAGENTA}Đang chạy AI... (Vui lòng đợi)")
    final_response = ""
    
    for step, prompt in enumerate(prompts):
        if len(prompts) > 1:
            print(f"\n{Fore.WHITE}--- BƯỚC {step+1} ---")
        print(f"{Fore.WHITE}Prompt: {prompt}")
        
        messages = [HumanMessage(content=prompt)]
        state = {"messages": messages}
        
        try:
            async for event in project_graph.astream(state, config=config, stream_mode="values"):
                if "messages" in event:
                    final_response = event["messages"][-1].content
            
            print(f"{Fore.BLUE}AI Response:\n{Style.RESET_ALL}{final_response}")
        except Exception as e:
            error_msg = f"ERROR: {str(e)}"
            print(f"{Fore.RED}{error_msg}")
            return error_msg
            
    return final_response

async def main():
    parser = argparse.ArgumentParser(description="Chạy bộ Test Automation cho AI Assistant")
    parser.add_argument("--user-id", type=int, default=32, help="ID của User dùng để test (Mặc định: 32)")
    
    args = parser.parse_args()
    
    db = SessionLocal()
    user = db.query(User).filter(User.id == args.user_id).first()
    
    if not user:
        print(f"{Fore.RED}LỖI: Không tìm thấy User với ID {args.user_id}")
        return
        
    print(f"{Fore.GREEN}Đang thực thi Test dưới danh nghĩa User: {user.full_name or user.email} (ID: {user.id})")
    
    report_content = f"# Báo cáo Test Automation AI Assistant\n"
    report_content += f"**User Test:** {user.full_name or user.email} (ID: {user.id})\n\n"
    
    for i, test_case in enumerate(TEST_CASES, 1):
        result = await run_test_case(db, user, test_case, i)
        
        # Append to report
        report_content += f"## Test {i}: {test_case['name']} ({test_case['level']})\n"
        
        prompts = test_case['prompt']
        if isinstance(prompts, str):
            report_content += f"**Prompt:** {prompts}\n\n"
        else:
            report_content += "**Prompts (Flow):**\n"
            for step, p in enumerate(prompts):
                report_content += f"- *Step {step+1}:* {p}\n"
            report_content += "\n"
            
        report_content += f"**Expected:** {test_case['expected']}\n\n"
        report_content += f"**AI Response:**\n```text\n{result}\n```\n\n"
        report_content += "---\n\n"
    
    # Save report
    report_path = "/app/automation_test_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)
    
    print(f"\n{Fore.GREEN}Đã hoàn thành chạy {len(TEST_CASES)} test cases!")
    print(f"{Fore.GREEN}Báo cáo được lưu tại: {report_path}")

if __name__ == "__main__":
    asyncio.run(main())
