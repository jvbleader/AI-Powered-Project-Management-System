"use client";

import { useEffect, useMemo, useState } from "react";
import { aiApi, projectApi } from "@/services/api";
import { AssigneeSelect } from "@/components/assignee-select";
import ReactMarkdown from "react-markdown";
import {
  normalizeTaskPriority,
  taskPriorityLabel,
  taskPriorityPillStyle,
} from "@/lib/utils/format";
import {
  getStoredDraftStatus,
  isPersistedMessageId,
  setStoredDraftStatus,
} from "@/lib/assistant-storage";
import type { UserProfile } from "@/types";
import type { ProjectMemberResponse } from "@/services/api/projects";

type TaskDraft = {
  title: string;
  description?: string | Record<string, unknown>;
  priority?: "low" | "medium" | "high" | "critical";
  status?: "todo" | "in_progress" | "done";
  project_id?: number;
  assignee_id?: number;
  assignee_ids?: number[];
  assignee_name?: string;
  start_date?: string;
  deadline?: string;
  estimated_hours?: number;
  subtasks?: TaskDraft[];
};

function memberToUserProfile(member: ProjectMemberResponse): UserProfile {
  const name = member.userName || member.userEmail || "Người dùng";
  return {
    id: `usr-${member.userId}`,
    name,
    email: member.userEmail || "",
    role: member.roleName || "",
    title: member.roleName || "Thành viên dự án",
    initials: name.slice(0, 2).toUpperCase(),
    presence: member.isActive ? "online" : "offline",
    capacityHours: 40,
    workloadHours: 0,
    focusScore: 75,
    isActive: member.isActive,
  };
}

function formatDraftAssigneeNames(task: TaskDraft): string {
  if (task.assignee_name?.trim()) return task.assignee_name.trim();
  return "";
}

function formatDraftDescription(description: unknown): string {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (typeof description !== "object") return String(description);

  const desc = description as Record<string, unknown>;
  const mapping: Array<[string, string]> = [
    ["objective", "**1. Mục tiêu:**"],
    ["criteria", "**2. Tiêu chí / ràng buộc:**"],
    ["implementation", "**3. Cách làm:**"],
    ["output", "**4. Đầu ra:**"],
    ["acceptance_criteria", "**5. Tiêu chí chấp nhận:**"],
    ["acceptance", "**5. Tiêu chí chấp nhận:**"],
  ];
  const parts: string[] = [];
  for (const [key, label] of mapping) {
    if (key === "acceptance" && desc.acceptance_criteria) continue;
    const value = desc[key];
    if (value == null || value === "") continue;
    const text = Array.isArray(value)
      ? value.map((item) => `- ${String(item)}`).join("\n")
      : String(value);
    parts.push(`${label} ${text}`);
  }
  return parts.join("\n\n");
}

function replaceTaskAtPath(
  tasks: TaskDraft[],
  path: number[],
  replacement: TaskDraft,
): TaskDraft[] {
  const [index, ...rest] = path;
  return tasks.map((task, currentIndex) => {
    if (currentIndex !== index) return task;
    if (rest.length === 0) return replacement;
    return {
      ...task,
      subtasks: replaceTaskAtPath(task.subtasks || [], rest, replacement),
    };
  });
}

export function TaskDraftConfirm({
  draft,
  projectId,
  messageId,
  initialStatus = "pending",
  onDraftResolved,
}: {
  draft: string;
  projectId?: string | null;
  messageId?: string;
  initialStatus?: "pending" | "confirmed" | "rejected";
  onDraftResolved?: (messageId: string, status: "confirmed" | "rejected") => void;
}) {
  const persistedStatus = messageId ? getStoredDraftStatus(messageId) : null;
  const resolvedInitialStatus =
    initialStatus !== "pending"
      ? initialStatus
      : persistedStatus === "confirmed" || persistedStatus === "rejected"
        ? persistedStatus
        : "pending";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(resolvedInitialStatus === "confirmed");
  const [isRejected, setIsRejected] = useState(resolvedInitialStatus === "rejected");
  const [error, setError] = useState<string | null>(null);
  const [rejectedPaths, setRejectedPaths] = useState<Set<string>>(new Set());
  const [editingPath, setEditingPath] = useState<number[] | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDraft | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberResponse[]>([]);
  const [loadedProject, setLoadedProject] = useState<{
    id: string;
    type: "agile" | "waterfall" | null;
  } | null>(null);

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

  const hasPersistedMessage = isPersistedMessageId(messageId);
  const resolvedProjectId = projectId || (tasksData[0]?.project_id ? String(tasksData[0].project_id) : null);
  const projectType =
    loadedProject?.id === resolvedProjectId ? loadedProject.type : null;
  const assigneeOptions = useMemo(
    () => projectMembers.filter((member) => member.isActive).map(memberToUserProfile),
    [projectMembers],
  );

  useEffect(() => {
    let cancelled = false;
    if (!resolvedProjectId) return () => { cancelled = true; };

    projectApi
      .get(resolvedProjectId)
      .then(async (response) => {
        if (cancelled) return;
        const type = response.data.projectType;
        setLoadedProject({ id: resolvedProjectId, type });
        if (type !== "waterfall") {
          setProjectMembers([]);
          return;
        }
        const membersResponse = await projectApi.listMembers(resolvedProjectId);
        if (!cancelled) setProjectMembers(membersResponse.data || []);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedProject({ id: resolvedProjectId, type: null });
          setProjectMembers([]);
        }
      });
    return () => { cancelled = true; };
  }, [resolvedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined" || resolvedInitialStatus !== "pending") {
      if (typeof window !== "undefined") {
        localStorage.removeItem(`draft_rejects_${draftHash}`);
      }
      return;
    }
    const savedRejects = localStorage.getItem(`draft_rejects_${draftHash}`);
    if (savedRejects) {
      try { setRejectedPaths(new Set(JSON.parse(savedRejects))); } catch { /* ignore */ }
    }
  }, [draftHash, resolvedInitialStatus]);

  const saveRejectedPaths = (newRejects: Set<string>) => {
    setRejectedPaths(newRejects);
    if (typeof window !== "undefined") {
      localStorage.setItem(`draft_rejects_${draftHash}`, JSON.stringify(Array.from(newRejects)));
    }
  };

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

  const openEditor = (task: TaskDraft, path: number[]) => {
    setEditingPath(path);
    const nextTask = {
      ...task,
      assignee_ids: task.assignee_ids ? [...task.assignee_ids] : undefined,
    };
    if (projectType === "agile") {
      delete nextTask.assignee_id;
      delete nextTask.assignee_ids;
      delete nextTask.assignee_name;
    }
    setEditingTask(nextTask);
    setError(null);
  };

  const handleSaveTask = async () => {
    if (!editingTask || !editingPath || !messageId || !hasPersistedMessage) return;
    if (!editingTask.title.trim()) {
      setError("Tên task không được để trống.");
      return;
    }
    try {
      setIsSavingDraft(true);
      setError(null);
      const taskToSave = {
        ...editingTask,
        title: editingTask.title.trim(),
      };
      if (projectType === "agile") {
        delete taskToSave.assignee_id;
        delete taskToSave.assignee_ids;
        delete taskToSave.assignee_name;
      }
      const nextTasks = replaceTaskAtPath(tasksData, editingPath, taskToSave);
      const response = await aiApi.updateDraft(
        Number(messageId),
        "json_task_draft",
        nextTasks,
      );
      setTasksData(response.payload as TaskDraft[]);
      setEditingPath(null);
      setEditingTask(null);
    } catch (e: any) {
      setError(e.message || "Không thể lưu thay đổi bản nháp.");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const markResolved = (status: "confirmed" | "rejected") => {
    if (messageId) {
      setStoredDraftStatus(messageId, status);
      onDraftResolved?.(messageId, status);
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(`draft_rejects_${draftHash}`);
    }
  };

  const handleConfirmSelected = async () => {
    if (!hasPersistedMessage || !messageId) {
      setError("Bản nháp chưa được lưu. Vui lòng đợi tin nhắn lưu xong rồi xác nhận lại.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);

      const allRejected = tasksData.every((_, index) =>
        rejectedPaths.has(String(index))
      );
      if (allRejected) {
        await handleRejectAll();
        return;
      }

      await aiApi.confirmTasks(Number(messageId), {
        projectId: projectId ? Number(projectId) : null,
        rejectedPaths: Array.from(rejectedPaths),
      });
      setIsSuccess(true);
      markResolved("confirmed");
    } catch (e: any) {
      setError(e.message || "Có lỗi xảy ra khi tạo task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectAll = async () => {
    if (!hasPersistedMessage || !messageId) {
      setError("Bản nháp chưa được lưu. Vui lòng đợi tin nhắn lưu xong rồi thử lại.");
      return;
    }
    try {
      setIsSubmitting(true);
      await aiApi.rejectDraft(Number(messageId), "json_task_draft");
      setIsRejected(true);
      markResolved("rejected");
    } catch (e: any) {
      setError(e.message || "Không thể từ chối bản nháp.");
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

  const actionsDisabled = isSubmitting || isSavingDraft || !hasPersistedMessage;

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
            const description = formatDraftDescription(task.description);

            return (
              <div key={pathStr} style={{ marginLeft: depth > 0 ? `${depth * 20}px` : "0", borderLeft: depth > 0 ? "2px solid #e4e4e7" : "none", paddingLeft: depth > 0 ? "16px" : "0", marginTop: depth > 0 ? "8px" : "0", boxSizing: "border-box", minWidth: 0 }}>
                <div
                  onClick={() => {
                    if (!isInherentlyRejected && hasPersistedMessage) {
                      openEditor(task, path);
                    }
                  }}
                  style={{
                    position: "relative", borderRadius: "12px", border: "1px solid #e4e4e7",
                    backgroundColor: isInherentlyRejected ? "#fafafa" : "#ffffff",
                    padding: "16px",
                    cursor: isInherentlyRejected || !hasPersistedMessage ? "default" : "pointer",
                    boxSizing: "border-box", width: "100%", minWidth: 0,
                    opacity: isInherentlyRejected ? 0.6 : 1,
                    filter: isInherentlyRejected ? "grayscale(50%)" : "none"
                  }}
                >
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

                  {description && (
                    <div style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#52525b", lineHeight: "1.625", whiteSpace: "normal" }} className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                      <ReactMarkdown>{description}</ReactMarkdown>
                    </div>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "11px", fontWeight: 600, letterSpacing: "0.025em" }}>
                    {task.priority && (() => {
                      const priorityKey = normalizeTaskPriority(task.priority);
                      const pill = taskPriorityPillStyle(priorityKey);
                      return (
                        <span style={{
                          display: "inline-flex", alignItems: "center", borderRadius: "6px", padding: "4px 8px",
                          textTransform: "uppercase",
                          color: pill.color,
                          backgroundColor: pill.backgroundColor,
                          border: `1px solid ${pill.borderColor}`,
                        }}>
                          {taskPriorityLabel(priorityKey)}
                        </span>
                      );
                    })()}
                    {formatDraftAssigneeNames(task) && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", backgroundColor: "#eff6ff", padding: "4px 10px", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        {formatDraftAssigneeNames(task)}
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

        {!hasPersistedMessage && (
          <div style={{ fontSize: "13px", color: "#1d4ed8", backgroundColor: "#eff6ff", padding: "12px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
            Đang lưu bản nháp vào hội thoại. Nút xác nhận sẽ mở sau khi lưu xong.
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginTop: "12px", paddingTop: "16px", borderTop: "1px dashed #e4e4e7" }}>
          <button
            onClick={handleRejectAll}
            disabled={actionsDisabled}
            style={{
              flex: 1, padding: "10px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: actionsDisabled ? "not-allowed" : "pointer",
              backgroundColor: "#ffffff", color: "#52525b", border: "1px solid #e4e4e7", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px",
              opacity: actionsDisabled ? 0.7 : 1
            }}
          >
            Hủy toàn bộ
          </button>
          <button
            onClick={handleConfirmSelected}
            disabled={actionsDisabled}
            style={{
              flex: 2, padding: "10px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: actionsDisabled ? "not-allowed" : "pointer",
              backgroundColor: actionsDisabled ? "#bfdbfe" : "#2563eb", color: "#ffffff", border: "1px solid transparent", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px"
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            {isSubmitting ? "Đang xử lý..." : "Xác nhận các task đã chọn"}
          </button>
        </div>

        {error && <div style={{ marginTop: "8px", fontSize: "13px", color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", border: "1px solid #fca5a5" }}>{error}</div>}
      </div>

      {editingTask && editingPath && (
        <div
          onClick={() => {
            if (!isSavingDraft) {
              setEditingTask(null);
              setEditingPath(null);
            }
          }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(15, 23, 42, 0.55)" }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto", borderRadius: "16px", background: "#fff", boxShadow: "0 24px 60px rgba(15, 23, 42, 0.25)" }}
          >
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a" }}>Chỉnh sửa task trong bản nháp</h3>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#64748b" }}>Lưu thay đổi sẽ cập nhật trực tiếp bản draft mà hệ thống dùng để tạo task.</p>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <label style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Tên task</span>
                <input value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
              </label>
              <label style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Mô tả</span>
                <textarea value={formatDraftDescription(editingTask.description)} onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })} rows={9} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, resize: "vertical", fontFamily: "inherit" }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Trạng thái</span>
                <select value={editingTask.status || "todo"} onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value as TaskDraft["status"] })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }}>
                  <option value="todo">Cần làm</option>
                  <option value="in_progress">Đang thực hiện</option>
                  <option value="done">Hoàn thành</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Ưu tiên</span>
                <select value={editingTask.priority || "medium"} onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as TaskDraft["priority"] })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }}>
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                  <option value="critical">Khẩn cấp</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Ngày bắt đầu</span>
                <input type="date" value={editingTask.start_date || ""} onChange={(e) => setEditingTask({ ...editingTask, start_date: e.target.value || undefined })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Hạn chót</span>
                <input type="date" value={editingTask.deadline || ""} onChange={(e) => setEditingTask({ ...editingTask, deadline: e.target.value || undefined })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Thời gian ước tính (giờ)</span>
                <input type="number" min="0" step="0.5" value={editingTask.estimated_hours ?? ""} onChange={(e) => setEditingTask({ ...editingTask, estimated_hours: e.target.value ? Number(e.target.value) : undefined })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
              </label>
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Người thực hiện</span>
                {projectType === "agile" && (
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    Dự án Agile luôn để trống người thực hiện khi tạo task.
                  </span>
                )}
                <AssigneeSelect
                  value={(editingTask.assignee_ids || (editingTask.assignee_id ? [editingTask.assignee_id] : [])).map((id) => `usr-${id}`)}
                  options={assigneeOptions}
                  disabled={!resolvedProjectId || projectType !== "waterfall"}
                  placeholder="-- Chưa phân công --"
                  onChange={(selectedIds) => {
                    const ids = selectedIds
                      .map((id) => Number(id.replace(/^usr-/, "")))
                      .filter((id) => Number.isInteger(id) && id > 0);
                    const names = ids
                      .map((id) => projectMembers.find((member) => member.userId === id)?.userName)
                      .filter(Boolean) as string[];
                    setEditingTask({
                      ...editingTask,
                      assignee_ids: ids.length ? ids : undefined,
                      assignee_id: ids[0],
                      assignee_name: names.length ? names.join(", ") : undefined,
                    });
                  }}
                />
              </div>
            </div>
            <div style={{ padding: "16px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <button type="button" disabled={isSavingDraft} onClick={() => { setEditingTask(null); setEditingPath(null); }} style={{ padding: "9px 16px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>Hủy</button>
              <button type="button" disabled={isSavingDraft} onClick={handleSaveTask} style={{ padding: "9px 16px", border: 0, borderRadius: 8, background: "#2563eb", color: "#fff" }}>{isSavingDraft ? "Đang lưu..." : "Lưu vào bản nháp"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
