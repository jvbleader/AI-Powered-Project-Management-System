"use client";

import { useState, useEffect, useMemo } from "react";
import { aiApi } from "@/services/api";
import { CustomSelect } from "@/components/custom-select";

type TaskDraft = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical";
  status?: "todo" | "in_progress" | "done";
  assignee_id?: number;
  assignee_name?: string;
  start_date?: string;
  deadline?: string;
  estimated_hours?: number;
  subtasks?: TaskDraft[];
};

export function TaskDraftConfirm({
  draft,
  projectId,
  messageId,
  initialStatus = "pending",
}: {
  draft: string;
  projectId?: string | null;
  messageId?: string;
  initialStatus?: "pending" | "confirmed" | "rejected";
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(initialStatus === "confirmed");
  const [isRejected, setIsRejected] = useState(initialStatus === "rejected");
  const [error, setError] = useState<string | null>(null);
  
  const draftHash = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < draft.length; i++) {
      hash = ((hash << 5) - hash) + draft.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }, [draft]);
  
  const [tasksData, setTasksData] = useState<TaskDraft[]>(() => {
    try {
      const data = JSON.parse(draft);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedEdits = localStorage.getItem(`draft_edits_${draftHash}`);
      if (savedEdits) {
        try {
          setTasksData(JSON.parse(savedEdits));
        } catch(e) {}
      }
    }
  }, [draftHash]);

  // Handle saving edits to localStorage
  const saveTasksData = (newData: TaskDraft[]) => {
    setTasksData(newData);
    if (typeof window !== "undefined") {
      localStorage.setItem(`draft_edits_${draftHash}`, JSON.stringify(newData));
    }
  };
  
  const [editingTaskPath, setEditingTaskPath] = useState<number[] | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDraft | null>(null);

  if (tasksData.length === 0) {
    try {
      JSON.parse(draft);
    } catch {
      return <div className="p-3 text-red-500 bg-red-50 rounded-md border border-red-200 font-sans">Lỗi: AI trả về định dạng không hợp lệ.</div>;
    }
    return null;
  }

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await aiApi.confirmTasks(projectId ? Number(projectId) : null, tasksData);
      setIsSuccess(true);
      
      if (messageId && !messageId.startsWith("assistant-")) {
        const editedDraft = JSON.stringify(tasksData, null, 2);
        const newMarkdown = "```json_task_draft_confirmed\n" + editedDraft + "\n```";
        await aiApi.updateMessage(messageId, newMarkdown).catch(console.error);
      }
      
      if (typeof window !== "undefined") {
        localStorage.removeItem(`draft_edits_${draftHash}`);
      }
    } catch (e: any) {
      setError(e.message || "Có lỗi xảy ra khi tạo task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsRejected(true);
    if (messageId && !messageId.startsWith("assistant-")) {
      const editedDraft = JSON.stringify(tasksData, null, 2);
      const newMarkdown = "```json_task_draft_rejected\n" + editedDraft + "\n```";
      await aiApi.updateMessage(messageId, newMarkdown).catch(console.error);
    }
    
    if (typeof window !== "undefined") {
      localStorage.removeItem(`draft_edits_${draftHash}`);
    }
  };

  if (isSuccess) {
    return (
      <div style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: "16px", borderRadius: "12px", border: "1px solid #bbf7d0", backgroundColor: "#f0fdf4", padding: "20px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: "40px", width: "40px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: "#dcfce7", border: "1px solid #86efac", color: "#16a34a" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#166534", letterSpacing: "0.025em", whiteSpace: "normal", wordWrap: "break-word" }}>Tạo thành công {tasksData.length} công việc</h4>
          <p style={{ margin: 0, fontSize: "12px", color: "#15803d", whiteSpace: "normal", wordWrap: "break-word", lineHeight: 1.5 }}>Bản nháp đã được ghi nhận vào hệ thống. Hãy tải lại bảng công việc.</p>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: "16px", borderRadius: "12px", border: "1px solid #fecaca", backgroundColor: "#fef2f2", padding: "20px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: "40px", width: "40px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#991b1b", letterSpacing: "0.025em", whiteSpace: "normal", wordWrap: "break-word" }}>Bản nháp đã bị hủy</h4>
          <p style={{ margin: 0, fontSize: "12px", color: "#b91c1c", whiteSpace: "normal", wordWrap: "break-word", lineHeight: 1.5 }}>Bạn đã từ chối bản nháp công việc này.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      margin: "16px 0", 
      overflow: "hidden", 
      borderRadius: "12px", 
      border: "1px solid #e4e4e7", 
      borderBottom: "4px solid #d4d4d8",
      backgroundColor: "#ffffff", 
      boxShadow: "0 8px 12px -2px rgba(0,0,0,0.12), 0 4px 6px -1px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)", 
      fontFamily: "sans-serif", 
      color: "#18181b",
      boxSizing: "border-box",
      maxWidth: "100%"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e4e4e7", backgroundColor: "#fafafa", padding: "16px 20px" }}>
        <h4 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "14px", fontWeight: 600, color: "#09090b", letterSpacing: "0.025em" }}>
          <svg style={{ color: "#3b82f6" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Bản nháp {tasksData.length} công việc
        </h4>
      </div>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "20px", boxSizing: "border-box", width: "100%" }}>
        {(() => {
          const renderTask = (task: TaskDraft, path: number[], depth: number = 0) => {
            return (
              <div key={path.join("-")} style={{ marginLeft: depth > 0 ? `${depth * 20}px` : "0", borderLeft: depth > 0 ? "2px solid #e4e4e7" : "none", paddingLeft: depth > 0 ? "16px" : "0", marginTop: depth > 0 ? "8px" : "0", boxSizing: "border-box", minWidth: 0 }}>
                  <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTaskPath(path);
                    setEditingTask({ ...task });
                  }}
                  style={{ position: "relative", borderRadius: "12px", border: "1px solid #e4e4e7", backgroundColor: "#ffffff", padding: "16px", transition: "all 0.2s", cursor: "pointer", boxSizing: "border-box", width: "100%", minWidth: 0 }}
                  onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "#f4f4f5"; e.currentTarget.style.borderColor = "#d4d4d8"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.05)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.borderColor = "#e4e4e7"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                  <h5 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 600, color: "#18181b", overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal" }}>{task.title || "Chưa có tiêu đề"}</h5>
                  {task.description && (
                    <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#52525b", lineHeight: "1.625", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "normal" }}>{task.description}</p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "11px", fontWeight: 600, letterSpacing: "0.025em" }}>
                    {task.priority && (
                      <span style={{ 
                        display: "inline-flex", alignItems: "center", borderRadius: "6px", padding: "4px 8px", textTransform: "uppercase",
                        backgroundColor: task.priority === 'high' ? '#fee2e2' : task.priority === 'medium' ? '#fef3c7' : '#dcfce7',
                        color: task.priority === 'high' ? '#b91c1c' : task.priority === 'medium' ? '#b45309' : '#15803d',
                        border: `1px solid ${task.priority === 'high' ? '#fca5a5' : task.priority === 'medium' ? '#fde68a' : '#86efac'}`
                      }}>
                        {task.priority}
                      </span>
                    )}
                    {task.assignee_name && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", backgroundColor: "#eff6ff", padding: "4px 10px", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        {task.assignee_name}
                      </span>
                    )}
                    {task.start_date && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", backgroundColor: "#f3f4f6", padding: "4px 10px", color: "#4b5563", border: "1px solid #e5e7eb" }}>
                        Bắt đầu: {task.start_date}
                      </span>
                    )}
                    {task.deadline && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", backgroundColor: "#f3f4f6", padding: "4px 10px", color: "#4b5563", border: "1px solid #e5e7eb" }}>
                        Hạn chót: {task.deadline}
                      </span>
                    )}
                  </div>
                </div>
                {task.subtasks && task.subtasks.map((sub, i) => renderTask(sub, [...path, i], depth + 1))}
              </div>
            );
          };
          return tasksData.map((task, idx) => renderTask(task, [idx]));
        })()}

        {error && <div style={{ marginTop: "8px", fontSize: "13px", color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", border: "1px solid #fca5a5" }}>{error}</div>}

        <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
          <button
            onClick={handleReject}
            disabled={isSubmitting}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "12px", padding: "12px", fontSize: "14px", fontWeight: 600, transition: "all 0.2s", cursor: isSubmitting ? "not-allowed" : "pointer", border: "1px solid #fecaca",
              backgroundColor: "#fef2f2", color: "#dc2626"
            }}
            onMouseOver={(e) => { if (!isSubmitting) { e.currentTarget.style.backgroundColor = "#fee2e2"; e.currentTarget.style.borderColor = "#fca5a5"; } }}
            onMouseOut={(e) => { if (!isSubmitting) { e.currentTarget.style.backgroundColor = "#fef2f2"; e.currentTarget.style.borderColor = "#fecaca"; } }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            Hủy bỏ
          </button>

          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "12px", padding: "12px", fontSize: "14px", fontWeight: 600, transition: "all 0.2s", cursor: isSubmitting ? "not-allowed" : "pointer", border: "none",
              backgroundColor: isSubmitting ? "#93c5fd" : "#2563eb", color: "#ffffff"
            }}
            onMouseOver={(e) => { if (!isSubmitting) { e.currentTarget.style.backgroundColor = "#1d4ed8"; e.currentTarget.style.transform = "scale(1.01)"; e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(37, 99, 235, 0.3)"; } }}
            onMouseOut={(e) => { if (!isSubmitting) { e.currentTarget.style.backgroundColor = "#2563eb"; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; } }}
            onMouseDown={(e) => { if (!isSubmitting) e.currentTarget.style.transform = "scale(0.99)"; }}
            onMouseUp={(e) => { if (!isSubmitting) e.currentTarget.style.transform = "scale(1.01)"; }}
          >
            {!isSubmitting && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            {isSubmitting ? "Đang xử lý..." : "Xác nhận"}
          </button>
        </div>
      </div>

      {editingTaskPath !== null && editingTask && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
          <div className="task-detail-modal" style={{ width: "100%", maxWidth: "800px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "1.5rem 1.5rem 0.5rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, marginRight: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: "0.35rem", fontWeight: 650 }}>
                      Chỉnh sửa bản nháp
                    </div>
                    <input
                        autoFocus
                        value={editingTask.title}
                        onChange={(event) => setEditingTask({...editingTask, title: event.target.value})}
                        style={{
                          width: "100%",
                          fontSize: "1.25rem",
                          fontWeight: 650,
                          padding: "0.65rem 1rem",
                          borderRadius: "12px",
                          border: "1px solid rgba(148, 163, 184, 0.25)",
                          background: "rgba(248, 250, 252, 0.5)",
                          color: "var(--ink)",
                          fontFamily: "inherit",
                          outline: "none",
                          transition: "all 0.2s"
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = "var(--accent)";
                            e.target.style.boxShadow = "0 0 0 4px rgba(37, 99, 235, 0.1)";
                            e.target.style.background = "#ffffff";
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = "rgba(148, 163, 184, 0.25)";
                            e.target.style.boxShadow = "none";
                            e.target.style.background = "rgba(248, 250, 252, 0.5)";
                        }}
                    />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button 
                        className="primary-button" 
                        onClick={() => {
                          const newData = JSON.parse(JSON.stringify(tasksData));
                          let current: any = newData;
                          for (let i = 0; i < editingTaskPath.length - 1; i++) {
                            if (i === 0) current = current[editingTaskPath[i]];
                            else current = current.subtasks[editingTaskPath[i]];
                          }
                          if (editingTaskPath.length === 1) {
                            newData[editingTaskPath[0]] = editingTask;
                          } else {
                            current.subtasks[editingTaskPath[editingTaskPath.length - 1]] = editingTask;
                          }
                          saveTasksData(newData);
                          setEditingTaskPath(null);
                        }} 
                        style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                    >
                        Lưu nháp
                    </button>
                    <button onClick={() => setEditingTaskPath(null)} style={{ background: "none", border: "none", fontSize: "1.35rem", cursor: "pointer", color: "var(--foreground-muted)", padding: "0.25rem 0.5rem" }}>&times;</button>
                </div>
            </div>
            
            <div className="task-detail-layout" style={{ padding: "0 1.5rem 1.5rem 1.5rem", overflow: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ flexShrink: 0, marginBottom: "0.5rem" }}>
                    <div style={{ marginBottom: "0.75rem" }}>
                        <span className="task-detail-field-label" style={{ marginBottom: "0.5rem" }}>Mô tả công việc</span>
                        <textarea
                            value={editingTask.description || ""}
                            onChange={(event) => setEditingTask({...editingTask, description: event.target.value})}
                            rows={4}
                            style={{
                              width: "100%",
                              padding: "0.85rem 1rem",
                              borderRadius: "12px",
                              border: "1px solid rgba(148, 163, 184, 0.25)",
                              background: "rgba(248, 250, 252, 0.5)",
                              color: "var(--ink)",
                              resize: "vertical",
                              marginBottom: "0.25rem",
                              fontSize: "0.92rem",
                              lineHeight: "1.6",
                              outline: "none",
                              fontFamily: "inherit",
                              transition: "all 0.2s"
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = "var(--accent)";
                                e.target.style.boxShadow = "0 0 0 4px rgba(37, 99, 235, 0.1)";
                                e.target.style.background = "#ffffff";
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = "rgba(148, 163, 184, 0.25)";
                                e.target.style.boxShadow = "none";
                                e.target.style.background = "rgba(248, 250, 252, 0.5)";
                            }}
                        />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", paddingTop: "0.5rem" }}>
                        <label className="task-detail-field">
                          <span className="task-detail-field-label">Trạng thái</span>
                          <CustomSelect 
                            className="task-detail-control" 
                            value={editingTask.status || "todo"}
                            onChange={(val) => setEditingTask({...editingTask, status: val as any})}
                            style={{ 
                              color: editingTask.status === "done" ? "#15803d" : editingTask.status === "in_progress" ? "#1d4ed8" : "#b45309", 
                              backgroundColor: editingTask.status === "done" ? "rgba(34, 197, 94, 0.15)" : editingTask.status === "in_progress" ? "rgba(59, 130, 246, 0.15)" : "rgba(250, 204, 21, 0.18)"
                            }}
                            options={[
                              { value: "todo", label: "Cần làm" },
                              { value: "in_progress", label: "Đang tiến hành" },
                              { value: "done", label: "Hoàn thành" },
                            ]}
                          />
                        </label>
                        
                        <label className="task-detail-field">
                          <span className="task-detail-field-label">Ưu tiên</span>
                          <CustomSelect
                            className="task-detail-control"
                            value={editingTask.priority || "medium"}
                            onChange={(val) => setEditingTask({...editingTask, priority: val as any})}
                            style={{
                              color: editingTask.priority === "high" ? "#b45309" : editingTask.priority === "medium" ? "#15803d" : "#0369a1",
                              backgroundColor: editingTask.priority === "high" ? "rgba(217, 119, 6, 0.15)" : editingTask.priority === "medium" ? "rgba(22, 163, 74, 0.15)" : "rgba(2, 132, 199, 0.15)"
                            }}
                            options={[
                              { value: "low", label: "Thấp" },
                              { value: "medium", label: "Trung bình" },
                              { value: "high", label: "Cao" },
                              { value: "critical", label: "Khẩn cấp" },
                            ]}
                          />
                        </label>
        
                        <label className="task-detail-field">
                          <span className="task-detail-field-label">Người thực hiện</span>
                          <input
                            className="task-detail-control"
                            value={editingTask.assignee_name || ""}
                            onChange={(event) => setEditingTask({...editingTask, assignee_name: event.target.value})}
                            style={{ fontFamily: "inherit" }}
                          />
                        </label>
        
                        <label className="task-detail-field">
                          <span className="task-detail-field-label">Ngày bắt đầu</span>
                          <input className="task-detail-control" type="date" value={editingTask.start_date || ""} onChange={(e) => setEditingTask({...editingTask, start_date: e.target.value})} style={{ fontFamily: "inherit" }} />
                        </label>
                        
                        <label className="task-detail-field">
                          <span className="task-detail-field-label">Hạn chót</span>
                          <input className="task-detail-control" type="date" value={editingTask.deadline || ""} onChange={(e) => setEditingTask({...editingTask, deadline: e.target.value})} style={{ fontFamily: "inherit" }} />
                        </label>
                        
                        <label className="task-detail-field">
                          <span className="task-detail-field-label">Thời gian ước tính (giờ)</span>
                          <input 
                            className="task-detail-control" 
                            type="number" 
                            placeholder="0" 
                            value={editingTask.estimated_hours || ""}
                            onChange={(e) => setEditingTask({...editingTask, estimated_hours: e.target.value ? parseFloat(e.target.value) : undefined})}
                            style={{ fontFamily: "inherit" }}
                          />
                        </label>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
