"use client";

import { useState } from "react";
import { aiApi } from "@/services/api";

type TaskDraft = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  assignee_id?: number;
  assignee_name?: string;
};

export function TaskDraftConfirm({
  draft,
  projectId,
}: {
  draft: string;
  projectId?: string | null;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let tasksData: TaskDraft[] = [];
  try {
    tasksData = JSON.parse(draft);
    if (!Array.isArray(tasksData)) {
      throw new Error("Dữ liệu không phải là một mảng.");
    }
  } catch (e) {
    return <div className="p-3 text-red-500 bg-red-50 rounded-md border border-red-200">❌ Lỗi: AI trả về định dạng không hợp lệ.</div>;
  }

  if (tasksData.length === 0) {
    return null;
  }

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await aiApi.confirmTasks(projectId ? Number(projectId) : null, tasksData);
      setIsSuccess(true);
    } catch (e: any) {
      setError(e.message || "Có lỗi xảy ra khi tạo task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div style={{ margin: "12px 0", padding: "16px", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a", fontWeight: "bold" }}>✓</div>
        <div>
          <h4 style={{ color: "#166534", fontWeight: 600, margin: "0 0 4px 0", fontSize: "15px" }}>Tạo thành công {tasksData.length} công việc!</h4>
          <p style={{ margin: 0, fontSize: "13px", color: "#15803d" }}>Bạn có thể tải lại bảng công việc để xem các task mới.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ margin: "16px 0", border: "1px solid #bfdbfe", borderRadius: "8px", overflow: "hidden", backgroundColor: "#ffffff", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" }}>
      <div style={{ backgroundColor: "#eff6ff", padding: "10px 16px", borderBottom: "1px solid #dbeafe", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontWeight: 600, color: "#1e40af", display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Bản nháp {tasksData.length} công việc
        </h4>
      </div>
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {tasksData.map((task, idx) => (
          <div key={idx} style={{ padding: "12px", backgroundColor: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: "6px", textAlign: "left" }}>
            <h5 style={{ margin: "0 0 6px 0", fontWeight: 600, color: "#1e293b", fontSize: "14px" }}>{task.title || "Chưa có tiêu đề"}</h5>
            {task.description && <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#64748b", lineHeight: "1.5" }}>{task.description}</p>}
            <div style={{ display: "flex", gap: "8px", fontSize: "11px", fontWeight: 500 }}>
              {task.priority && (
                <span style={{ 
                  padding: "2px 8px", borderRadius: "9999px", textTransform: "capitalize",
                  backgroundColor: task.priority === 'high' ? '#fee2e2' : task.priority === 'medium' ? '#ffedd5' : '#dcfce7',
                  color: task.priority === 'high' ? '#b91c1c' : task.priority === 'medium' ? '#c2410c' : '#15803d'
                }}>
                  {task.priority}
                </span>
              )}
              {task.assignee_id && (
                <span style={{ padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#dbeafe", color: "#1d4ed8" }}>
                  👤 {task.assignee_name || `User ID: ${task.assignee_id}`}
                </span>
              )}
            </div>
          </div>
        ))}

        {error && <div style={{ color: "#ef4444", fontSize: "13px", marginTop: "8px", textAlign: "left" }}>{error}</div>}

        <button
          onClick={handleConfirm}
          disabled={isSubmitting}
          style={{
            marginTop: "8px", width: "100%", padding: "10px", backgroundColor: "#2563eb", color: "#ffffff", 
            border: "none", borderRadius: "6px", fontWeight: 500, fontSize: "14px", 
            cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "background-color 0.2s"
          }}
          onMouseOver={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = "#1d4ed8")}
          onMouseOut={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = "#2563eb")}
        >
          {!isSubmitting && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
          {isSubmitting ? "Đang tạo..." : `Xác nhận tạo ${tasksData.length} task`}
        </button>
      </div>
    </div>
  );
}
