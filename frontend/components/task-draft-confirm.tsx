"use client";

import { useState, useEffect, useMemo } from "react";
import { aiApi } from "@/services/api";
import { CustomSelect } from "@/components/custom-select";
import ReactMarkdown from "react-markdown";

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
  const [rejectedPaths, setRejectedPaths] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [descPreviewMode, setDescPreviewMode] = useState(false);

  // Xử lý auto-format list khi nhấn Enter
  const handleDescKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      const el = e.currentTarget;
      const val = el.value;
      const start = el.selectionStart;
      const end = el.selectionEnd;

      const lastNewline = val.lastIndexOf('\n', start - 1);
      const currentLine = val.substring(lastNewline + 1, start);

      const match = currentLine.match(/^(\s*)([-*]\s+|\d+\.\s+)(.*)$/);
      if (match) {
        e.preventDefault();
        const [, spaces, bullet, content] = match;
        if (!content.trim()) {
          const newVal = val.substring(0, lastNewline + 1) + val.substring(end);
          setEditingTask({ ...editingTask!, description: newVal });
          setTimeout(() => {
            el.selectionStart = el.selectionEnd = lastNewline + 1;
          }, 0);
        } else {
          let newBullet = bullet;
          const numMatch = bullet.match(/^(\d+)\.\s+/);
          if (numMatch) {
            newBullet = `${parseInt(numMatch[1], 10) + 1}. `;
          }
          const insertText = `\n${spaces}${newBullet}`;
          const newVal = val.substring(0, start) + insertText + val.substring(end);
          setEditingTask({ ...editingTask!, description: newVal });
          setTimeout(() => {
            el.selectionStart = el.selectionEnd = start + insertText.length;
          }, 0);
        }
      }
    }
  };

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
        try { setTasksData(JSON.parse(savedEdits)); } catch (e) { }
      }
      const savedRejects = localStorage.getItem(`draft_rejects_${draftHash}`);
      if (savedRejects) {
        try { setRejectedPaths(new Set(JSON.parse(savedRejects))); } catch (e) { }
      }
    }
  }, [draftHash]);

  const saveTasksData = (newData: TaskDraft[]) => {
    setTasksData(newData);
    if (typeof window !== "undefined") {
      localStorage.setItem(`draft_edits_${draftHash}`, JSON.stringify(newData));
    }
  };

  const saveRejectedPaths = (newRejects: Set<string>) => {
    setRejectedPaths(newRejects);
    if (typeof window !== "undefined") {
      localStorage.setItem(`draft_rejects_${draftHash}`, JSON.stringify(Array.from(newRejects)));
    }
  };

  const [editingTaskPath, setEditingTaskPath] = useState<number[] | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDraft | null>(null);

  if (tasksData.length === 0) {
    try {
      JSON.parse(draft);
    } catch {
      return (
        <div style={{ margin: "16px 0", display: "flex", alignItems: "center", gap: "12px", padding: "16px", borderRadius: "12px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontFamily: "sans-serif", fontSize: "14px" }}>
          <svg style={{ animation: "spin 1s linear infinite" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          Đang xử lý phân chia công việc...
        </div>
      );
    }
    return null;
  }

  const handleToggleReject = (pathStr: string) => {
    const newSet = new Set(rejectedPaths);
    if (newSet.has(pathStr)) {
      newSet.delete(pathStr);
    } else {
      newSet.add(pathStr);
    }
    saveRejectedPaths(newSet);
  };

  const handleConfirmSelected = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const filterTasks = (tasks: TaskDraft[], currentPath: number[]): TaskDraft[] => {
        return tasks.map((t, i) => {
          const path = [...currentPath, i];
          const pathStr = path.join("-");

          // If this path is rejected or any parent is rejected (though parent reject means this code might not be reached if properly implemented, but let's just check prefix)
          const isRejected = path.some((_, idx) => rejectedPaths.has(path.slice(0, idx + 1).join("-")));
          if (isRejected) return null;

          const newTask = { ...t };
          if (newTask.subtasks && newTask.subtasks.length > 0) {
            newTask.subtasks = filterTasks(newTask.subtasks, path);
            if (newTask.subtasks.length === 0) {
              delete newTask.subtasks;
            }
          }
          return newTask;
        }).filter(Boolean) as TaskDraft[];
      };

      const payload = filterTasks(tasksData, []);

      if (payload.length === 0) {
        return handleRejectAll();
      }

      await aiApi.confirmTasks(projectId ? Number(projectId) : null, payload);

      if (messageId && !messageId.startsWith("assistant-")) {
        const editedDraft = JSON.stringify(payload, null, 2);
        const newMarkdown = "```json_task_draft_confirmed\n" + editedDraft + "\n```";
        await aiApi.updateMessage(messageId, newMarkdown).catch(console.error);
      }
      setIsSuccess(true);
      if (typeof window !== "undefined") {
        localStorage.removeItem(`draft_edits_${draftHash}`);
        localStorage.removeItem(`draft_rejects_${draftHash}`);
      }
    } catch (e: any) {
      setError(e.message || "Có lỗi xảy ra khi tạo task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectAll = async () => {
    try {
      setIsSubmitting(true);
      if (messageId && !messageId.startsWith("assistant-")) {
        const newMarkdown = "```json_task_draft_rejected\n" + JSON.stringify(tasksData, null, 2) + "\n```";
        await aiApi.updateMessage(messageId, newMarkdown).catch(console.error);
      }
      setIsRejected(true);
      if (typeof window !== "undefined") {
        localStorage.removeItem(`draft_edits_${draftHash}`);
        localStorage.removeItem(`draft_rejects_${draftHash}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: "16px", borderRadius: "12px", border: "1px solid #bbf7d0", backgroundColor: "#f0fdf4", padding: "20px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: "40px", width: "40px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: "#dcfce7", border: "1px solid #86efac", color: "#16a34a" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#166534", letterSpacing: "0.025em", whiteSpace: "normal", wordWrap: "break-word" }}>Tạo task thành công</h4>
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
            const pathStr = path.join("-");
            const isInherentlyRejected = path.some((_, idx) => rejectedPaths.has(path.slice(0, idx + 1).join("-")));

            return (
              <div key={pathStr} style={{ marginLeft: depth > 0 ? `${depth * 20}px` : "0", borderLeft: depth > 0 ? "2px solid #e4e4e7" : "none", paddingLeft: depth > 0 ? "16px" : "0", marginTop: depth > 0 ? "8px" : "0", boxSizing: "border-box", minWidth: 0 }}>
                <div
                  onClick={(e) => {
                    if (isInherentlyRejected) return;
                    e.stopPropagation();
                    setEditingTaskPath(path);
                    setEditingTask({ ...task });
                  }}
                  style={{
                    position: "relative", borderRadius: "12px", border: "1px solid #e4e4e7",
                    backgroundColor: isInherentlyRejected ? "#fafafa" : "#ffffff",
                    padding: "16px", transition: "all 0.2s",
                    cursor: isInherentlyRejected ? "default" : "pointer",
                    boxSizing: "border-box", width: "100%", minWidth: 0,
                    opacity: isInherentlyRejected ? 0.6 : 1,
                    filter: isInherentlyRejected ? "grayscale(50%)" : "none"
                  }}
                  onMouseOver={(e) => {
                    if (!isInherentlyRejected) {
                      e.currentTarget.style.backgroundColor = "#f4f4f5";
                      e.currentTarget.style.borderColor = "#d4d4d8";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.05)";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isInherentlyRejected) {
                      e.currentTarget.style.backgroundColor = "#ffffff";
                      e.currentTarget.style.borderColor = "#e4e4e7";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }
                  }}>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "6px" }}>
                    <h5 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#18181b", overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal", flex: 1 }}>
                      {isInherentlyRejected && <del>{task.title || "Chưa có tiêu đề"}</del>}
                      {!isInherentlyRejected && (task.title || "Chưa có tiêu đề")}
                    </h5>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleReject(pathStr);
                      }}
                      style={{
                        padding: "4px 8px", fontSize: "11px", fontWeight: 600, borderRadius: "6px", cursor: "pointer", flexShrink: 0,
                        backgroundColor: rejectedPaths.has(pathStr) ? "#e4e4e7" : "#fee2e2",
                        color: rejectedPaths.has(pathStr) ? "#52525b" : "#dc2626",
                        border: `1px solid ${rejectedPaths.has(pathStr) ? "#d4d4d8" : "#fca5a5"}`,
                        display: "flex", justifyContent: "center", alignItems: "center", gap: "4px"
                      }}
                    >
                      {rejectedPaths.has(pathStr) ? (
                        <>Khôi phục</>
                      ) : (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Loại bỏ</>
                      )}
                    </button>
                  </div>

                  {task.description && (
                    <div style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#52525b", lineHeight: "1.625", whiteSpace: "normal" }} className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                      <ReactMarkdown>{task.description}</ReactMarkdown>
                    </div>
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
                    {task.estimated_hours !== undefined && (
                      <span title="Thời gian ước tính (ET)" style={{ display: "inline-flex", alignItems: "center", gap: "4px", borderRadius: "6px", backgroundColor: "#fef3c7", padding: "4px 10px", color: "#b45309", border: "1px solid #fde68a" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        {task.estimated_hours}h
                      </span>
                    )}
                    {task.start_date && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", borderRadius: "6px", backgroundColor: "#f3f4f6", padding: "4px 10px", color: "#4b5563", border: "1px solid #e5e7eb" }}>
                        Bắt đầu: {task.start_date}
                      </span>
                    )}
                    {task.deadline && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", borderRadius: "6px", backgroundColor: "#f3f4f6", padding: "4px 10px", color: "#4b5563", border: "1px solid #e5e7eb" }}>
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

        <div style={{ display: "flex", gap: "8px", marginTop: "12px", paddingTop: "16px", borderTop: "1px dashed #e4e4e7" }}>
          <button
            onClick={handleRejectAll}
            disabled={isSubmitting}
            style={{
              flex: 1, padding: "10px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: isSubmitting ? "not-allowed" : "pointer",
              backgroundColor: "#ffffff", color: "#52525b", border: "1px solid #e4e4e7", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px"
            }}
          >
            Hủy toàn bộ
          </button>
          <button
            onClick={handleConfirmSelected}
            disabled={isSubmitting}
            style={{
              flex: 2, padding: "10px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: isSubmitting ? "not-allowed" : "pointer",
              backgroundColor: isSubmitting ? "#bfdbfe" : "#2563eb", color: "#ffffff", border: "1px solid transparent", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px"
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            {isSubmitting ? "Đang xử lý..." : "Xác nhận các task đã chọn"}
          </button>
        </div>

        {error && <div style={{ marginTop: "8px", fontSize: "13px", color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", border: "1px solid #fca5a5" }}>{error}</div>}
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
                  onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value })}
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span className="task-detail-field-label">Mô tả công việc (Hỗ trợ Markdown)</span>
                    <div style={{ display: "flex", gap: "0.25rem", background: "rgba(15, 23, 42, 0.05)", padding: "0.25rem", borderRadius: "8px" }}>
                      <button
                        onClick={() => setDescPreviewMode(false)}
                        style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", borderRadius: "6px", border: "none", cursor: "pointer", background: !descPreviewMode ? "#ffffff" : "transparent", color: !descPreviewMode ? "var(--ink)" : "var(--foreground-muted)", boxShadow: !descPreviewMode ? "0 1px 2px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s", fontWeight: !descPreviewMode ? 600 : 400 }}
                      >
                        Chỉnh sửa
                      </button>
                      <button
                        onClick={() => setDescPreviewMode(true)}
                        style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", borderRadius: "6px", border: "none", cursor: "pointer", background: descPreviewMode ? "#ffffff" : "transparent", color: descPreviewMode ? "var(--ink)" : "var(--foreground-muted)", boxShadow: descPreviewMode ? "0 1px 2px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s", fontWeight: descPreviewMode ? 600 : 400 }}
                      >
                        Xem trước
                      </button>
                    </div>
                  </div>

                  {!descPreviewMode ? (
                    <textarea
                      value={editingTask.description || ""}
                      onChange={(event) => setEditingTask({ ...editingTask, description: event.target.value })}
                      onKeyDown={handleDescKeyDown}
                      rows={8}
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
                  ) : (
                    <div
                      className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
                      style={{
                        width: "100%",
                        padding: "0.85rem 1rem",
                        borderRadius: "12px",
                        border: "1px solid rgba(148, 163, 184, 0.15)",
                        background: "rgba(248, 250, 252, 0.3)",
                        color: "var(--ink)",
                        marginBottom: "0.25rem",
                        fontSize: "0.92rem",
                        lineHeight: "1.6",
                        minHeight: "180px",
                        maxHeight: "400px",
                        overflowY: "auto"
                      }}
                    >
                      {editingTask.description ? <ReactMarkdown>{editingTask.description}</ReactMarkdown> : <span style={{ color: "var(--foreground-muted)", fontStyle: "italic" }}>Chưa có mô tả</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", paddingTop: "0.5rem" }}>
                  <label className="task-detail-field">
                    <span className="task-detail-field-label">Trạng thái</span>
                    <CustomSelect
                      className="task-detail-control"
                      value={editingTask.status || "todo"}
                      onChange={(val) => setEditingTask({ ...editingTask, status: val as any })}
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
                      onChange={(val) => setEditingTask({ ...editingTask, priority: val as any })}
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
                      onChange={(event) => setEditingTask({ ...editingTask, assignee_name: event.target.value })}
                      style={{ fontFamily: "inherit" }}
                    />
                  </label>

                  <label className="task-detail-field">
                    <span className="task-detail-field-label">Ngày bắt đầu</span>
                    <input className="task-detail-control" type="date" value={editingTask.start_date || ""} onChange={(e) => setEditingTask({ ...editingTask, start_date: e.target.value })} style={{ fontFamily: "inherit" }} />
                  </label>

                  <label className="task-detail-field">
                    <span className="task-detail-field-label">Hạn chót</span>
                    <input className="task-detail-control" type="date" value={editingTask.deadline || ""} onChange={(e) => setEditingTask({ ...editingTask, deadline: e.target.value })} style={{ fontFamily: "inherit" }} />
                  </label>

                  <label className="task-detail-field">
                    <span className="task-detail-field-label">Thời gian ước tính (giờ)</span>
                    <input
                      className="task-detail-control"
                      type="number"
                      placeholder="0"
                      value={editingTask.estimated_hours || ""}
                      onChange={(e) => setEditingTask({ ...editingTask, estimated_hours: e.target.value ? parseFloat(e.target.value) : undefined })}
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
