import { AiInsight, AiMessage, AiReport } from "@/types";

export const aiInsights: AiInsight[] = [
  {
    id: "ins-001",
    title: "Rủi ro triển khai của Sprint 06",
    summary:
      "Phần giao diện điều hành đang đi đúng tiến độ, nhưng nhóm chỉ số phân tích vẫn bị chặn do thiếu schema dữ liệu sprint.",
    type: "risk",
    source: "Tasks FP-105, FP-102",
    actionLabel: "Chốt contract dữ liệu",
  },
  {
    id: "ins-002",
    title: "Tỷ lệ logwork đang cải thiện",
    summary:
      "Tỷ lệ cập nhật đã tăng lên 86% sau khi bổ sung nhắc việc hằng ngày, phù hợp để giữ lại trong bản MVP.",
    type: "opportunity",
    source: "Worklogs last 3 days",
    actionLabel: "Triển khai luồng nhắc việc",
  },
  {
    id: "ins-003",
    title: "Chế độ tra cứu nhanh đã khá sẵn sàng",
    summary:
      "Luồng phân tích ý định đã xử lý tốt các câu hỏi ngắn; bước tiếp theo là gắn truy xuất dữ liệu theo công cụ xác định.",
    type: "summary",
    source: "AI module WBS",
    actionLabel: "Bổ sung kiểm thử router",
  },
];


export const aiMessages: AiMessage[] = [
  {
    id: "msg-001",
    role: "user",
    content: "Hãy tóm tắt giúp tôi các điểm nghẽn của sprint hiện tại.",
  },
  {
    id: "msg-002",
    role: "assistant",
    content:
      "Sprint 06 hiện đã hoàn thành 68%. Rủi ro lớn nhất là FP-105 do schema cho analytics vẫn chưa được chốt. FP-104 đã quá hạn 1 ngày và cần hoàn thiện quy tắc kiểm tra logwork.",
  },
  {
    id: "msg-003",
    role: "user",
    content: "Tuần này những ai đang gần chạm ngưỡng công suất?",
  },
  {
    id: "msg-004",
    role: "assistant",
    content:
      "Minh Le đang ở mức 93% công suất và Khoa Nguyen ở mức 92%. Hai thành viên này không nên nhận thêm công việc khẩn cấp cho đến khi FP-102 và FP-106 được đẩy tiếp.",
  },
];


export const aiReports: AiReport[] = [
  {
    id: "rep-001",
    title: "Sức khỏe sprint theo tuần",
    summary: "Sprint đang tiến triển tốt, nhưng nhóm analytics và quy tắc logwork vẫn cần contract backend chặt chẽ hơn.",
    chartLabel: "Burn-up và chồng quá hạn",
    metric: "68% hoàn thành",
  },
  {
    id: "rep-002",
    title: "Danh sách theo dõi công suất",
    summary: "Năng lực backend là điểm nghẽn rõ nhất trong toàn bộ danh mục dự án ở thời điểm hiện tại.",
    chartLabel: "Biểu đồ công suất theo thành viên",
    metric: "2 thành viên vượt 90%",
  },
  {
    id: "rep-003",
    title: "Đánh giá mức sẵn sàng của AI",
    summary: "Chế độ tra cứu nhanh sẵn sàng hơn báo cáo dài vì contract dữ liệu hiện rõ ràng và ổn định hơn.",
    chartLabel: "Radar trưởng thành luồng intent",
    metric: "Còn 3 contract chờ chốt",
  },
];


export const suggestedPrompts = [
  "Sprint hiện tại đang bị chặn ở những điểm nào?",
  "Hiển thị danh sách thành viên chưa cập nhật logwork hôm nay.",
  "Tóm tắt các công việc quá hạn trên toàn bộ dự án.",
  "Tạo một báo cáo tuần ngắn gọn dành cho quản lý.",
];

