import { useEffect, useEffectEvent, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";

import { KeyValueList, StatusPill } from "@/components/ui";
import { AssigneeSelect } from "@/components/assignee-select";
import { taskApi } from "@/services/api";
import { CustomSelect } from "@/components/custom-select";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import type { EnrichedTask, Task, TaskLogworkEntry, UserProfile, TaskLog } from "@/types";
import { LogworkModal } from "./logwork-modal";

function stripMarkdown(md: string): string {
  if (!md) return "";
  let output = md;
  // Remove headers
  output = output.replace(/^#{1,6}\s+(.*)/gm, '$1');
  // Remove bold
  output = output.replace(/\*\*(.*?)\*\*/g, '$1');
  output = output.replace(/__(.*?)__/g, '$1');
  // Remove italic
  output = output.replace(/\*(.*?)\*/g, '$1');
  output = output.replace(/_(.*?)_/g, '$1');
  // Remove strikethrough
  output = output.replace(/~~(.*?)~~/g, '$1');
  // Remove inline code
  output = output.replace(/`(.*?)`/g, '$1');
  // Remove images
  output = output.replace(/!\[(.*?)\]\(.*?\)/g, '$1');
  // Remove links
  output = output.replace(/\[(.*?)\]\(.*?\)/g, '$1');
  // Remove blockquotes
  output = output.replace(/^\s*>\s+(.*)/gm, '$1');
  return output;
}

interface TaskDetailModalProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated: (updatedTask: Task) => void;
  users: UserProfile[];
  viewerId: string;
  canManage: boolean;
}

export function TaskDetailModal({
  taskId,
  isOpen,
  onClose,
  onTaskUpdated,
  users,
  viewerId,
  canManage,
}: TaskDetailModalProps) {
  const [task, setTask] = useState<EnrichedTask | Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [isLogworkModalOpen, setIsLogworkModalOpen] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when task updates
  useEffect(() => {
    if (isOpen && task) {
      setEditTitle(task.title);
      setEditDesc(stripMarkdown(task.description || ""));
    }
  }, [isOpen, task]);

  // Auto-resize description textarea
  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = "auto";
      descRef.current.style.height = descRef.current.scrollHeight + "px";
    }
  }, [editDesc, isOpen]);

  const [logworks, setLogworks] = useState<TaskLogworkEntry[]>([]);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);

  const isAssignee = Boolean(task?.assigneeId && task.assigneeId === viewerId);
  const canEditTask = canManage; // Theo yêu cầu: Chỉ Manager và Leader (canManage) mới được sửa tiêu đề, mô tả
  const canUpdateStatus = true; // Ai cũng có thể update status (vì cũng có quyền kéo thả)
  const canLogwork = true;

  const resolvedAssignee =
    task && "assignee" in task && task.assignee
      ? task.assignee
      : task?.assigneeId
        ? users.find((user) => user.id === task.assigneeId) ??
        ({
          id: task.assigneeId,
          name: task.assigneeName || "Người dùng",
          email: task.assigneeEmail || "",
          role: "MEMBER",
          roles: ["MEMBER"],
          title: task.assigneeEmail || "Thành viên dự án",
          initials: (task.assigneeName || "ND")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join(""),
          presence: "online",
          capacityHours: 40,
          workloadHours: 0,
          focusScore: 0,
          isActive: true,
          status: "ACTIVE",
        } satisfies UserProfile)
        : null;

  const projectMemberIds = task && "project" in task ? task.project?.memberIds : null;
  const projectUsers = projectMemberIds ? users.filter(u => projectMemberIds.includes(u.id)) : users;

  const assigneeOptions = canManage
    ? (resolvedAssignee && !projectUsers.some((user) => user.id === resolvedAssignee.id)
      ? [resolvedAssignee, ...projectUsers]
      : projectUsers)
    : (resolvedAssignee && resolvedAssignee.id !== viewerId
      ? [resolvedAssignee, ...projectUsers.filter((user) => user.id === viewerId)]
      : projectUsers.filter((user) => user.id === viewerId));

  const isWaterfall = task && "project" in task && task.project?.projectType === "waterfall";
  const isAgile = task && "project" in task && task.project?.projectType === "agile";
  const isBacklog = isAgile && !task?.sprintId;

  // Người quản lý trong dự án waterfall có quyền assign thành viên. Còn agile thì kéo rồi tự gán trên Kanban.
  const canEditAssignee = isWaterfall ? canManage : false;

  const loadTask = useEffectEvent(async (nextTaskId: string) => {
    setIsLoading(true);
    try {
      const [taskResponse, logworkResponse, logsResponse] = await Promise.all([
        taskApi.getEnrichedTask(nextTaskId, undefined, { users }),
        taskApi.listLogworks(nextTaskId),
        taskApi.getLogs(nextTaskId)
      ]);
      setTask(taskResponse.data);
      setEditTitle(taskResponse.data.title);
      setEditDesc(taskResponse.data.description);
      setLogworks(logworkResponse.data);
      setTaskLogs(logsResponse.data);
    } catch (error: unknown) {
      alert(
        `Không thể tải thông tin công việc: ${error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      onClose();
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    if (isOpen && taskId) {
      queueMicrotask(() => {
        void loadTask(taskId);
      });
    }
  }, [isOpen, taskId]);

  useEffect(() => {
    const handleNewNotification = (e: any) => {
      // If a task notification arrives and the modal is open for this task, we can refetch logs
      if (isOpen && taskId) {
        taskApi.getLogs(taskId).then(res => setTaskLogs(res.data)).catch(() => {});
      }
    };
    window.addEventListener('new_notification', handleNewNotification);
    return () => window.removeEventListener('new_notification', handleNewNotification);
  }, [isOpen, taskId]);

  async function handleUpdate(updates: Partial<Task>) {
    if (!task) return;

    setIsSaving(true);
    try {
      await taskApi.update(task.id, updates);
      const [refreshed, newLogs] = await Promise.all([
        taskApi.getEnrichedTask(task.id, undefined, { users }),
        taskApi.getLogs(task.id)
      ]);
      setTask(refreshed.data);
      setTaskLogs(newLogs.data);
      onTaskUpdated(refreshed.data);
    } catch (error: unknown) {
      alert(`Cập nhật thất bại: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAssigneeChange(nextAssigneeId: string) {
    if (!task) return;

    setIsSaving(true);
    try {
      await taskApi.updateAssignee(task.id, nextAssigneeId);
      const [refreshed, newLogs] = await Promise.all([
        taskApi.getEnrichedTask(task.id, undefined, { users }),
        taskApi.getLogs(task.id)
      ]);
      setTask(refreshed.data);
      setTaskLogs(newLogs.data);
      onTaskUpdated(refreshed.data);
    } catch (error: unknown) {
      alert(
        `Cập nhật người thực hiện thất bại: ${error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  const saveTitle = () => {
    if (!canEditTask) {
      setIsEditingTitle(false);
      return;
    }

    if (editTitle.trim() && editTitle !== task?.title) {
      void handleUpdate({ title: editTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const saveDesc = () => {
    if (!canEditTask) return;

    if (editDesc !== task?.description) {
      void handleUpdate({ description: editDesc });
    }
  };

  if (!isOpen || !taskId) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="task-detail-modal"
        style={{
          width: "100%",
          maxWidth: "1100px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: "1.5rem 1.5rem 0.5rem 1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, marginRight: "1rem" }}>
            <div
              style={{ fontSize: "0.875rem", color: "var(--foreground-muted)", marginBottom: "0.5rem" }}
            >
              {task?.key}
            </div>
            {isEditingTitle ? (
              <input
                autoFocus
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => event.key === "Enter" && saveTitle()}
                style={{
                  width: "100%",
                  fontSize: "1.25rem",
                  fontWeight: 600,
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              />
            ) : (
              <h2
                id="task-detail-title"
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  cursor: canEditTask ? "pointer" : "default",
                  padding: "0.5rem",
                  marginLeft: "-0.5rem",
                  borderRadius: "4px",
                }}
                onClick={() => canEditTask && setIsEditingTitle(true)}
                title={canEditTask ? "Bấm để sửa tiêu đề" : undefined}
              >
                {isLoading ? "Đang tải..." : task?.title}
              </h2>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              className="secondary-button"
              style={{ color: "var(--critical-fg)", borderColor: "var(--critical-border)", padding: "0.5rem 1rem", fontSize: "0.85rem" }}
              onClick={async () => {
                if (confirm("Bạn có chắc chắn muốn xoá task này không?")) {
                  try {
                    if (task) {
                      await taskApi.remove(task.id);
                      window.location.reload();
                    }
                  } catch (e) {
                    alert("Lỗi khi xoá task");
                  }
                }
              }}
              disabled={isLoading}
            >
              Xoá task
            </button>
            {task?.projectId ? (
              <a
                href={`/projects/${task.projectId}?tab=${isWaterfall ? 'gantt' : 'kanban'}&highlightTaskId=${task.id}&highlightColor=green`}
                className="secondary-button"
                style={{ textDecoration: "none", padding: "0.5rem 1rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                Chuyển tới dự án
              </a>
            ) : null}
            {canLogwork ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => setIsLogworkModalOpen(true)}
                disabled={isLoading}
                style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
              >
                + Logwork
              </button>
            ) : null}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.35rem",
                cursor: "pointer",
                color: "var(--foreground-muted)",
                padding: "0.25rem 0.5rem"
              }}
            >
              &times;
            </button>
          </div>
        </div>

        <div className="task-detail-layout" style={{ padding: "0 1.5rem 1.5rem 1.5rem", overflow: "hidden", flex: 1, display: "flex", flexDirection: "row", gap: "1.5rem" }}>
          <div style={{ flex: 2, display: "flex", flexDirection: "column", minWidth: 0, overflowY: "auto", paddingRight: "0.5rem" }}>
            <div style={{ flexShrink: 0, marginBottom: "0.5rem" }}>
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ marginTop: "1rem" }}>
                <span className="task-detail-field-label" style={{ marginBottom: "0.5rem", display: "block" }}>
                  Mô tả công việc
                </span>
                <textarea
                  ref={descRef}
                  value={editDesc}
                  onChange={(e) => {
                    setEditDesc(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  onBlur={saveDesc}
                  disabled={!canEditTask || isSaving}
                  placeholder={canEditTask ? "Thêm mô tả công việc..." : "Chưa có mô tả."}
                  style={{
                    width: "100%",
                    minHeight: "150px",
                    padding: "1rem",
                    background: "rgba(15, 23, 42, 0.02)",
                    borderRadius: "12px",
                    border: "1px solid rgba(15, 23, 42, 0.03)",
                    fontSize: "0.95rem",
                    lineHeight: "1.7",
                    color: "var(--ink)",
                    resize: "vertical",
                    outline: "none",
                    fontFamily: "inherit",
                    whiteSpace: "pre-wrap",
                    overflow: "hidden"
                  }}
                  onFocus={(e) => {
                    if (canEditTask) {
                      e.target.style.borderColor = "var(--accent)";
                      e.target.style.background = "#ffffff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (document.activeElement !== e.target) {
                      e.target.style.borderColor = "rgba(15, 23, 42, 0.03)";
                      e.target.style.background = "rgba(15, 23, 42, 0.02)";
                    }
                  }}
                />
              </div>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1.25rem",
              paddingTop: "0.5rem"
            }}>
              <label className="task-detail-field">
                <span className="task-detail-field-label">Trạng thái</span>
                <CustomSelect
                  className="task-detail-control"
                  value={task?.status || "TODO"}
                  onChange={(val) => void handleUpdate({ status: val as Task["status"] })}
                  disabled={isLoading || isSaving || !canUpdateStatus}
                  style={{
                    color: task?.status === "DONE" ? "#15803d" : task?.status === "IN_PROGRESS" ? "#1d4ed8" : "#b45309",
                    backgroundColor: task?.status === "DONE" ? "rgba(34, 197, 94, 0.15)" : task?.status === "IN_PROGRESS" ? "rgba(59, 130, 246, 0.15)" : "rgba(250, 204, 21, 0.18)"
                  }}
                  options={[
                    { value: "TODO", label: "Cần làm" },
                    { value: "IN_PROGRESS", label: "Đang tiến hành" },
                    { value: "DONE", label: "Hoàn thành" },
                  ]}
                />
              </label>

              <label className="task-detail-field">
                <span className="task-detail-field-label">Ưu tiên</span>
                <CustomSelect
                  className="task-detail-control"
                  value={task?.priority || "MEDIUM"}
                  onChange={(val) => void handleUpdate({ priority: val as Task["priority"] })}
                  disabled={isLoading || isSaving || !canEditTask}
                  style={{
                    color: task?.priority === "CRITICAL" ? "#b91c1c" : task?.priority === "HIGH" ? "#b45309" : task?.priority === "MEDIUM" ? "#15803d" : "#0369a1",
                    backgroundColor: task?.priority === "CRITICAL" ? "rgba(220, 38, 38, 0.15)" : task?.priority === "HIGH" ? "rgba(217, 119, 6, 0.15)" : task?.priority === "MEDIUM" ? "rgba(22, 163, 74, 0.15)" : "rgba(2, 132, 199, 0.15)"
                  }}
                  options={[
                    { value: "LOW", label: "Thấp" },
                    { value: "MEDIUM", label: "Trung bình" },
                    { value: "HIGH", label: "Cao" },
                    { value: "CRITICAL", label: "Khẩn cấp" },
                  ]}
                />
              </label>

              <label className="task-detail-field">
                <span className="task-detail-field-label">Người thực hiện</span>
                <AssigneeSelect
                  className="task-detail-control"
                  value={isBacklog ? "" : (task?.assigneeId || "")}
                  onChange={(val) => void handleAssigneeChange(val)}
                  disabled={isLoading || isSaving || !canEditAssignee}
                  title={
                    isAgile
                      ? "Trong mô hình Agile, người thực hiện được tự động gán khi kéo thả Task trên bảng Kanban."
                      : (!canManage ? "Chỉ quản lý mới có quyền phân công người thực hiện trong dự án Waterfall." : "")
                  }
                  options={assigneeOptions}
                />
              </label>

              <label className="task-detail-field">
                <span className="task-detail-field-label">Ngày bắt đầu</span>
                <input
                  className="task-detail-control"
                  type="date"
                  value={task?.startDate || ""}
                  onChange={(event) => {
                    const newStartDate = event.target.value;
                    const updates: Partial<Task> = { startDate: newStartDate };
                    if (task?.estimateHours && task.estimateHours > 0 && newStartDate) {
                      const daysRequired = Math.ceil(task.estimateHours / 8);
                      const startDateObj = new Date(newStartDate);
                      startDateObj.setDate(startDateObj.getDate() + (daysRequired - 1));
                      updates.dueDate = startDateObj.toISOString().split("T")[0];
                    }
                    void handleUpdate(updates);
                  }}
                  disabled={isLoading || isSaving || !canEditTask}
                />
              </label>

              <label className="task-detail-field">
                <span className="task-detail-field-label">Hạn chót</span>
                <input
                  className="task-detail-control"
                  type="date"
                  value={task?.dueDate || ""}
                  onChange={(event) => void handleUpdate({ dueDate: event.target.value })}
                  disabled={isLoading || isSaving || !canEditTask}
                />
              </label>

              <label className="task-detail-field">
                <span className="task-detail-field-label">Thời gian ước tính (giờ)</span>
                <input
                  className="task-detail-control"
                  type="number"
                  min="0"
                  step="0.5"
                  value={task?.estimateHours || 0}
                  onChange={(event) => {
                    const newEstimate = parseFloat(event.target.value) || 0;
                    const updates: Partial<Task> = { estimateHours: newEstimate };
                    if (newEstimate > 0 && task?.startDate) {
                      const daysRequired = Math.ceil(newEstimate / 8);
                      const startDateObj = new Date(task.startDate);
                      startDateObj.setDate(startDateObj.getDate() + (daysRequired - 1));
                      updates.dueDate = startDateObj.toISOString().split("T")[0];
                    }
                    void handleUpdate(updates);
                  }}
                  disabled={isLoading || isSaving || !canEditTask}
                />
              </label>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <span
              className="task-detail-field-label"
              style={{
                marginBottom: "1rem",
                display: "block",
                flexShrink: 0,
              }}
            >
              Logwork đã ghi nhận
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
                overflowY: "auto",
                paddingRight: "0.5rem",
                flex: 1,
                background: "var(--surface-sunken)",
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid var(--border)",
              }}
            >
              {isLoading ? (
                <div style={{ color: "var(--foreground-muted)" }}>Đang tải logwork...</div>
              ) : logworks.length ? (
                logworks.map((entry) => (
                  <article
                    key={entry.id}
                    style={{
                      padding: "1rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.55rem",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        flexWrap: "wrap",
                        alignItems: "baseline",
                      }}
                    >
                      <div>
                        <strong style={{ display: "block", marginBottom: "0.15rem" }}>
                          {entry.userName}
                        </strong>
                        <span style={{ color: "var(--foreground-muted)", fontSize: "0.88rem" }}>
                          Ngày logwork: {formatDate(entry.workDate)}
                        </span>
                      </div>
                      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                        <strong style={{ display: "block" }}>{entry.hoursSpent}h</strong>
                        <span style={{ color: "var(--foreground-muted)", fontSize: "0.8rem" }}>
                          {formatDateTime(entry.createdAt)}
                        </span>
                        <span style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "0.15rem 0.5rem",
                          borderRadius: "1rem",
                          backgroundColor: entry.status === 'APPROVED' ? 'rgba(34, 197, 94, 0.15)' : entry.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                          color: entry.status === 'APPROVED' ? 'var(--success-fg)' : entry.status === 'REJECTED' ? 'var(--critical-fg)' : 'var(--warning-fg)'
                        }}>
                          {entry.status === 'APPROVED' ? 'Đã duyệt' : entry.status === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt'}
                        </span>
                      </div>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                      {entry.workContent}
                    </div>
                    {entry.comment ? (
                      <div
                        style={{
                          paddingTop: "0.55rem",
                          borderTop: "1px dashed var(--border)",
                          color: "var(--foreground-muted)",
                          fontSize: "0.92rem",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        Ghi chú: {entry.comment}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div style={{ color: "var(--foreground-muted)" }}>
                  Task này chưa có logwork nào.
                </div>
              )}
            </div>
          </div>
          </div> {/* Close Left Column */}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: "300px", borderLeft: "1px solid var(--border)", paddingLeft: "1.5rem", overflowY: "auto" }}>
            <span
              className="task-detail-field-label"
              style={{
                marginBottom: "1rem",
                display: "block",
                flexShrink: 0,
              }}
            >
              Nhật ký thay đổi (Task Log)
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {taskLogs.length === 0 ? (
                <div style={{ color: "var(--foreground-muted)", fontSize: "0.9rem" }}>Chưa có thay đổi nào.</div>
              ) : (
                taskLogs.map((log) => (
                  <div key={log.id} style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.9rem", paddingBottom: "0.5rem", borderBottom: "1px dashed var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <strong style={{ color: "var(--ink)" }}>{log.user_name || "Hệ thống"}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>{formatDateTime(log.created_at)}</span>
                    </div>
                    <div style={{ color: "var(--foreground)" }}>
                      {log.action === "assigned" ? (
                         <span>Đã giao việc cho <strong style={{color: "var(--primary-fg)"}}>{users.find(u => u.id === log.new_value)?.name || log.new_value || "Trống"}</strong></span>
                      ) : log.action === "updated" ? (
                         <span>Đã cập nhật <strong>{log.field_changed}</strong></span>
                      ) : (
                         <span>{log.action} {log.field_changed ? `- ${log.field_changed}` : ""}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {task ? (
        <LogworkModal
          isOpen={isLogworkModalOpen}
          onClose={() => setIsLogworkModalOpen(false)}
          taskId={task.id}
          userId={viewerId}
          onSuccess={async () => {
            const response = await taskApi.listLogworks(task.id);
            setLogworks(response.data);
          }}
        />
      ) : null}
    </div>
  );
}
