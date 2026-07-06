import { AiMessage, AiReport, AiWorkspaceBrief } from "@/types";
import { aiMessages, aiReports, suggestedPrompts } from "@/lib/mock/data";
import { respond } from "./core";

function quickAnswer(prompt: string) {
  const text = prompt.toLowerCase();

  if (text.includes("block")) {
    return "Current blockers are FP-105 for sprint analytics schema and FP-104 for worklog validation rules.";
  }

  if (text.includes("logwork")) {
    return "One teammate is missing a June 29 worklog entry, and overall coverage is 86%.";
  }

  if (text.includes("overdue")) {
    return "There are 3 overdue tasks across the portfolio, with FP-104 and FP-105 driving the highest risk.";
  }

  return "Sprint 06 is 68% complete. Delivery is healthy on UI, but backend contracts are the main dependency.";
}

export const aiApi = {
  async quickQuery(prompt: string) {
    return respond<AiMessage>(
      {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: quickAnswer(prompt),
      },
      200,
    );
  },

  async getWorkspaceBrief() {
    const data: AiWorkspaceBrief = {
      messages: aiMessages,
      reports: aiReports,
      prompts: suggestedPrompts,
      memoryModes: [
        "Tra cứu nhanh -> công cụ truy xuất xác định -> phản hồi ngắn gọn",
        "Chế độ báo cáo -> số liệu + ngữ cảnh truy xuất -> tường thuật + gợi ý biểu đồ",
        "Bộ nhớ dài hạn -> bộ đệm hội thoại gần nhất -> tóm tắt ngữ cảnh tích lũy",
      ],
    };

    return respond(data, 120);
  },

  async getReports() {
    return respond<AiReport[]>(aiReports, 110);
  },
};
