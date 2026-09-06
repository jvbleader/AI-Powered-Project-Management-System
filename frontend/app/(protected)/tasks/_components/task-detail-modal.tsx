import { useEffect, useEffectEvent, useRef, useState } from "react";

import { AssigneeSelect } from "@/components/assignee-select";
import { taskApi } from "@/services/api";
import { CustomSelect } from "@/components/custom-select";
import { LoadingState } from "@/components/loading-state";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { formatDateTime, canAccessLogworkApprovalsRole } from "@/lib/utils/format";
import { resolveAvatarUrl } from "@/lib/utils/avatar";
import type { EnrichedTask, Task, TaskLogworkEntry, UserProfile, TaskLog } from "@/types";
import { LogworkModal } from "./logwork-modal";
import { LogworkEntryDetailModal } from "./logwork-entry-detail-modal";

function truncateText(text: string, max = 52) {
  const value = text.trim();
  if (!value) return "Không có mô tả";
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function logworkStatusLabel(status: TaskLogworkEntry["status"]) {
  if (status === "APPROVED") return "Đã duyệt";
  if (status === "REJECTED") return "Từ chối";
  return "Chờ duyệt";
}

function logworkSummary(entry: TaskLogworkEntry) {
  return `${entry.hoursSpent}h · ${logworkStatusLabel(entry.status)} · ${truncateText(entry.title || entry.workContent)}`;
}

const ESTIMATE_SAVE_DELAY_MS = 2_000;

interface PendingEstimateUpdate {
  taskId: string;
  value: string;
  startDate: string;
  currentEstimate: number;
}

function stripMarkdown(md: string): string {
  if (!md) return "";
  let output = md;
  // Remove headers
  output = output.replace(/^#{1,6}\s+(.*)/gm, "$1");
  // Remove bold
  output = output.replace(/\*\*(.*?)\*\*/g, "$1");
  output = output.replace(/__(.*?)__/g, "$1");
  // Remove italic
  output = output.replace(/\*(.*?)\*/g, "$1");
  output = output.replace(/_(.*?)_/g, "$1");
  // Remove strikethrough
  output = output.replace(/~~(.*?)~~/g, "$1");
  // Remove inline code
  output = output.replace(/`(.*?)`/g, "$1");
  // Remove images
  output = output.replace(/!\[(.*?)\]\(.*?\)/g, "$1");
  // Remove links
  output = output.replace(/\[(.*?)\]\(.*?\)/g, "$1");
  // Remove blockquotes
  output = output.replace(/^\s*>\s+(.*)/gm, "$1");
  return output;
}

interface TaskDetailModalProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated: (updatedTask: Task) => void;
  onTaskDeleted?: (taskId: string) => Promise<void> | void;
  users: UserProfile[];
  viewerId: string;
  canManage: boolean;
  hideProjectLink?: boolean;
  hideDeleteTask?: boolean;
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function TaskDetailModal({
  taskId,
  isOpen,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
  users,
  viewerId,
  canManage,
  hideProjectLink = false,
  hideDeleteTask = false,
}: TaskDetailModalProps) {
  const { confirm, alert } = useConfirmDialog();
  const [task, setTask] = useState<EnrichedTask | Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [estimateDraft, setEstimateDraft] = useState("0");
  const [isLogworkModalOpen, setIsLogworkModalOpen] = useState(false);
  const [selectedLogworkEntry, setSelectedLogworkEntry] = useState<TaskLogworkEntry | null>(null);
  const estimateSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEstimateRef = useRef<PendingEstimateUpdate | null>(null);

  const [logworks, setLogworks] = useState<TaskLogworkEntry[]>([]);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);

  const canEditTask = canManage; // Theo yêu cầu: Chỉ Manager và Leader (canManage) mới được sửa tiêu đề, mô tả
  const canUpdateStatus = true; // Ai cũng có thể update status (vì cũng có quyền kéo thả)
  const canLogwork = true;

  const resolvedAssignee =
    task && "assignee" in task && task.assignee
      ? task.assignee
      : task?.assigneeId
        ? (users.find((user) => user.id === task.assigneeId) ??
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
            avatarUrl: resolveAvatarUrl({
              userId: task.assigneeId,
              email: task.assigneeEmail,
              name: task.assigneeName || "Người dùng",
            }),
          } satisfies UserProfile))
        : null;

  const projectMemberIds = task && "project" in task ? task.project?.memberIds : null;
  const projectUsers = projectMemberIds
    ? users.filter((u) => projectMemberIds.includes(u.id))
    : users;

  const assigneeOptions = canManage
    ? resolvedAssignee && !projectUsers.some((user) => user.id === resolvedAssignee.id)
      ? [resolvedAssignee, ...projectUsers]
      : projectUsers
    : resolvedAssignee && resolvedAssignee.id !== viewerId
      ? [resolvedAssignee, ...projectUsers.filter((user) => user.id === viewerId)]
      : projectUsers.filter((user) => user.id === viewerId);

  const isWaterfall = task && "project" in task && task.project?.projectType === "waterfall";
  const isAgile = task && "project" in task && task.project?.projectType === "agile";
  const isBacklog = isAgile && !task?.sprintId;

  // Người quản lý trong dự án waterfall có quyền assign thành viên. Còn agile thì kéo rồi tự gán trên Kanban.
  const canEditAssignee = isWaterfall ? canManage : false;
  const viewer = users.find((user) => user.id === viewerId);
  const canGoToLogworkApprovals = viewer ? canAccessLogworkApprovalsRole(viewer.role) : false;

  const loadTask = useEffectEvent(async (nextTaskId: string) => {
    setIsLoading(true);
    try {
      const [taskResponse, logworkResponse, logsResponse] = await Promise.all([
        taskApi.getEnrichedTask(nextTaskId, undefined, { users }),
        taskApi.listLogworks(nextTaskId),
        taskApi.getLogs(nextTaskId),
      ]);
      setTask(taskResponse.data);
      setEditTitle(taskResponse.data.title);
      setEditDesc(stripMarkdown(taskResponse.data.description || ""));
      setEstimateDraft(String(taskResponse.data.estimateHours || 0));
      setLogworks(logworkResponse.data);
      setTaskLogs(logsResponse.data);
    } catch (error: unknown) {
      await alert({
        title: "Không thể tải công việc",
        message: `Không thể tải thông tin công việc: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
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
    const handleNewNotification = () => {
      // If a task notification arrives and the modal is open for this task, we can refetch logs
      if (isOpen && taskId) {
        taskApi
          .getLogs(taskId)
          .then((res) => setTaskLogs(res.data))
          .catch(() => {});
      }
    };
    window.addEventListener("new_notification", handleNewNotification);
    return () => window.removeEventListener("new_notification", handleNewNotification);
  }, [isOpen, taskId]);

  useEffect(() => {
    return () => {
      if (estimateSaveTimerRef.current) {
        clearTimeout(estimateSaveTimerRef.current);
      }
    };
  }, []);

  async function handleUpdate(updates: Partial<Task>) {
    if (!task) return;

    setIsSaving(true);
    try {
      await taskApi.update(task.id, updates);
      const [refreshed, newLogs] = await Promise.all([
        taskApi.getEnrichedTask(task.id, undefined, { users }),
        taskApi.getLogs(task.id),
      ]);
      setTask(refreshed.data);
      setEditTitle(refreshed.data.title);
      setEditDesc(stripMarkdown(refreshed.data.description || ""));
      if ("estimateHours" in updates) {
        setEstimateDraft(String(refreshed.data.estimateHours || 0));
      }
      setTaskLogs(newLogs.data);
      onTaskUpdated(refreshed.data);
    } catch (error: unknown) {
      await alert({
        title: "Cập nhật thất bại",
        message: `Cập nhật thất bại: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function commitPendingEstimate() {
    if (estimateSaveTimerRef.current) {
      clearTimeout(estimateSaveTimerRef.current);
      estimateSaveTimerRef.current = null;
    }

    const pending = pendingEstimateRef.current;
    pendingEstimateRef.current = null;
    if (!pending || !task || pending.taskId !== task.id) return;

    const newEstimate = parseFloat(pending.value) || 0;
    if (newEstimate === pending.currentEstimate) {
      setEstimateDraft(String(pending.currentEstimate || 0));
      return;
    }

    const updates: Partial<Task> = { estimateHours: newEstimate };
    if (newEstimate > 0 && pending.startDate) {
      const daysRequired = Math.ceil(newEstimate / 8);
      const startDateObj = new Date(pending.startDate);
      startDateObj.setDate(startDateObj.getDate() + (daysRequired - 1));
      updates.dueDate = startDateObj.toISOString().split("T")[0];
    }

    await handleUpdate(updates);
  }

  function scheduleEstimateUpdate(value: string) {
    if (!task) return;

    setEstimateDraft(value);
    pendingEstimateRef.current = {
      taskId: task.id,
      value,
      startDate: task.startDate || "",
      currentEstimate: Number(task.estimateHours || 0),
    };

    if (estimateSaveTimerRef.current) {
      clearTimeout(estimateSaveTimerRef.current);
    }
    estimateSaveTimerRef.current = setTimeout(() => {
      void commitPendingEstimate();
    }, ESTIMATE_SAVE_DELAY_MS);
  }

  function handleClose() {
    void commitPendingEstimate();
    onClose();
  }

  async function handleAssigneeChange(nextAssigneeId: string) {
    if (!task) return;

    setIsSaving(true);
    try {
      await taskApi.updateAssignee(task.id, nextAssigneeId);
      const [refreshed, newLogs] = await Promise.all([
        taskApi.getEnrichedTask(task.id, undefined, { users }),
        taskApi.getLogs(task.id),
      ]);
      setTask(refreshed.data);
      setEditTitle(refreshed.data.title);
      setEditDesc(stripMarkdown(refreshed.data.description || ""));
      setTaskLogs(newLogs.data);
      onTaskUpdated(refreshed.data);
    } catch (error: unknown) {
      await alert({
        title: "Cập nhật thất bại",
        message: `Cập nhật người thực hiện thất bại: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
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

  async function handleDeleteTask() {
    if (!task) return;
    const confirmed = await confirm({
      title: "Xóa task",
      message: "Bạn có chắc chắn muốn xoá task này không?",
      confirmLabel: "Xóa",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    try {
      await taskApi.remove(task.id);
      if (onTaskDeleted) {
        await onTaskDeleted(task.id);
      } else {
        onClose();
      }
    } catch {
      await alert({ title: "Không thể xóa", message: "Lỗi khi xoá task" });
    } finally {
      setIsSaving(false);
    }
  }

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
      onMouseDown={handleClose}
    >
      <div
        className="task-detail-modal"
        style={{
          display: "flex",
          flexDirection: "column",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="task-detail-header">
          <div style={{ flex: 1, marginRight: "1rem" }}>
            <div
              style={{
                fontSize: "0.875rem",
                color: "var(--foreground-muted)",
                marginBottom: "0.5rem",
              }}
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
                {task?.title}
              </h2>
            )}
          </div>
          {(!hideDeleteTask || (!hideProjectLink && task?.projectId)) ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            {!hideDeleteTask ? (
              <button
                type="button"
                className="task-detail-delete-button"
                onClick={() => void handleDeleteTask()}
                disabled={isLoading || isSaving}
              >
                <TrashIcon />
                Xoá task
              </button>
            ) : null}
            {!hideProjectLink && task?.projectId ? (
              <a
                href={`/projects/${task.projectId}?tab=${isWaterfall ? "gantt" : "kanban"}&highlightTaskId=${task.id}&highlightColor=green`}
                className="secondary-button"
                style={{
                  textDecoration: "none",
                  padding: "0.5rem 1rem",
                  fontSize: "0.85rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Chuyển tới dự án
              </a>
            ) : null}
          </div>
          ) : null}
        </div>

        <div className="task-detail-layout task-detail-body">
          <div className="task-detail-left-column">
            <div className="task-detail-main">
              <div className="task-detail-fields-grid">
                <label className="task-detail-field">
                  <span className="task-detail-field-label">Trạng thái</span>
                  <CustomSelect
                    className="task-detail-control"
                    value={task?.status || "TODO"}
                    onChange={(val) => void handleUpdate({ status: val as Task["status"] })}
                    disabled={isLoading || isSaving || !canUpdateStatus}
                    style={{
                      color:
                        task?.status === "DONE"
                          ? "#15803d"
                          : task?.status === "IN_PROGRESS"
                            ? "#1d4ed8"
                            : "#b45309",
                      backgroundColor:
                        task?.status === "DONE"
                          ? "rgba(34, 197, 94, 0.15)"
                          : task?.status === "IN_PROGRESS"
                            ? "rgba(59, 130, 246, 0.15)"
                            : "rgba(250, 204, 21, 0.18)",
                    }}
                    options={[
                      { value: "TODO", label: "Cần làm" },
                      { value: "IN_PROGRESS", label: "Đang tiến hành" },
                      { value: "DONE", label: "Hoàn thành" },
                    ]}
                  />
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Người thực hiện</span>
                  <AssigneeSelect
                    className="task-detail-control"
                    value={isBacklog ? "" : task?.assigneeId || ""}
                    onChange={(val) => void handleAssigneeChange(val)}
                    disabled={isLoading || isSaving || !canEditAssignee}
                    title={
                      isAgile
                        ? "Trong mô hình Agile, người thực hiện được tự động gán khi kéo thả Task trên bảng Kanban."
                        : !canManage
                          ? "Chỉ quản lý mới có quyền phân công người thực hiện trong dự án Waterfall."
                          : ""
                    }
                    options={assigneeOptions}
                  />
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Ngày bắt đầu</span>
                  <span className="task-detail-date">
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
                    <span className="task-detail-date-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </span>
                  </span>
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Hạn chót</span>
                  <span className="task-detail-date">
                    <input
                      className="task-detail-control"
                      type="date"
                      value={task?.dueDate || ""}
                      onChange={(event) => void handleUpdate({ dueDate: event.target.value })}
                      disabled={isLoading || isSaving || !canEditTask}
                    />
                    <span className="task-detail-date-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </span>
                  </span>
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Ưu tiên</span>
                  <CustomSelect
                    className="task-detail-control"
                    value={task?.priority || "MEDIUM"}
                    onChange={(val) => void handleUpdate({ priority: val as Task["priority"] })}
                    disabled={isLoading || isSaving || !canEditTask}
                    style={{
                      color:
                        task?.priority === "CRITICAL"
                          ? "#b91c1c"
                          : task?.priority === "HIGH"
                            ? "#b45309"
                            : task?.priority === "MEDIUM"
                              ? "#15803d"
                              : "#0369a1",
                      backgroundColor:
                        task?.priority === "CRITICAL"
                          ? "rgba(220, 38, 38, 0.15)"
                          : task?.priority === "HIGH"
                            ? "rgba(217, 119, 6, 0.15)"
                            : task?.priority === "MEDIUM"
                              ? "rgba(22, 163, 74, 0.15)"
                              : "rgba(2, 132, 199, 0.15)",
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
                  <span className="task-detail-field-label">Thời gian ước tính</span>
                  <input
                    className="task-detail-control"
                    type="number"
                    min="0"
                    step="0.5"
                    value={estimateDraft}
                    onChange={(event) => scheduleEstimateUpdate(event.target.value)}
                    onBlur={() => void commitPendingEstimate()}
                    disabled={isLoading || isSaving || !canEditTask}
                  />
                </label>
              </div>

              <div className="task-detail-description-panel" style={{ marginTop: "1.5rem" }}>
                <span
                  className="task-detail-field-label"
                  style={{ marginBottom: "0.5rem", display: "block" }}
                >
                  Mô tả công việc
                </span>
                <textarea
                  className="task-detail-description"
                  value={editDesc}
                  onChange={(event) => setEditDesc(event.target.value)}
                  onBlur={saveDesc}
                  disabled={!canEditTask || isSaving}
                  placeholder={canEditTask ? "Thêm mô tả công việc..." : "Chưa có mô tả."}
                />
              </div>
            </div>
          </div>

          <div className="task-detail-right-column">
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                paddingBottom: "0.75rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                className="task-detail-field-label"
                style={{
                  marginBottom: "0.75rem",
                  display: "block",
                  flexShrink: 0,
                }}
              >
                Nhật ký thay đổi
              </span>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  paddingRight: "0.35rem",
                }}
              >
                {taskLogs.length === 0 ? (
                  <div style={{ color: "var(--foreground-muted)", fontSize: "0.9rem" }}>
                    Chưa có thay đổi nào.
                  </div>
                ) : (
                  taskLogs.map((log) => (
                    <div key={log.id} className="task-detail-timeline-item">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                        }}
                      >
                        <strong style={{ color: "var(--ink)" }}>
                          {log.user_name || "Hệ thống"}
                        </strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                      <div style={{ color: "var(--foreground)" }}>
                        {log.action === "assigned" ? (
                          <span>
                            Đã giao việc cho{" "}
                            <strong style={{ color: "var(--primary-fg)" }}>
                              {users.find((u) => u.id === log.new_value)?.name ||
                                log.new_value ||
                                "Trống"}
                            </strong>
                          </span>
                        ) : log.action === "updated" ? (
                          <span>
                            Đã cập nhật <strong>{log.field_changed}</strong>
                          </span>
                        ) : (
                          <span>
                            {log.action} {log.field_changed ? `- ${log.field_changed}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                paddingTop: "0.75rem",
              }}
            >
              <div className="task-detail-logwork-heading">
                <span className="task-detail-field-label">Logwork đã ghi nhận</span>
                {canLogwork ? (
                  <button
                    type="button"
                    className="task-detail-logwork-button"
                    onClick={() => setIsLogworkModalOpen(true)}
                    disabled={isLoading}
                  >
                    + Logwork
                  </button>
                ) : null}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  paddingRight: "0.35rem",
                }}
              >
                {isLoading ? (
                  <LoadingState variant="cards" />
                ) : logworks.length ? (
                  logworks.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedLogworkEntry(entry)}
                      className="task-detail-logwork-item"
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: "0.75rem",
                        }}
                      >
                        <strong style={{ color: "var(--ink)" }}>{entry.userName}</strong>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--foreground-muted)",
                            flexShrink: 0,
                          }}
                        >
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                      <div style={{ color: "var(--foreground)" }}>{logworkSummary(entry)}</div>
                    </button>
                  ))
                ) : (
                  <div style={{ color: "var(--foreground-muted)", fontSize: "0.9rem" }}>
                    Task này chưa có logwork nào.
                  </div>
                )}
              </div>
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

      <LogworkEntryDetailModal
        entry={selectedLogworkEntry}
        isOpen={!!selectedLogworkEntry}
        onClose={() => setSelectedLogworkEntry(null)}
        canGoToApprovals={canGoToLogworkApprovals}
      />
    </div>
  );
}
