import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { AssigneeSelect } from "@/components/assignee-select";
import { taskApi } from "@/services/api";
import { CustomSelect } from "@/components/custom-select";
import {
  formatDateTime,
  canAccessLogworkApprovalsRole,
  canDeleteTaskRole,
  canEditPendingLogwork,
  logworkStatusClassName,
  logworkStatusLabel,
} from "@/lib/utils/format";
import type { EnrichedTask, Task, TaskLogworkEntry, UserProfile, TaskLog } from "@/types";
import { LogworkModal } from "./logwork-modal";
import { LogworkEntryDetailModal } from "./logwork-entry-detail-modal";
import { ConfirmModal } from "@/components/confirm-modal";

function truncateText(text: string, max = 52) {
  const value = text.trim();
  if (!value) return "Không có mô tả";
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function calculateDueDateFromEstimate(startDateStr: string, hours: number): string | null {
  if (!startDateStr || hours <= 0 || hours > 99999 || isNaN(hours)) return null;
  try {
    const daysRequired = Math.ceil(hours / 8);
    if (daysRequired > 36500) return null;
    const startDateObj = new Date(startDateStr);
    if (isNaN(startDateObj.getTime())) return null;
    startDateObj.setDate(startDateObj.getDate() + (daysRequired - 1));
    if (isNaN(startDateObj.getTime())) return null;
    return startDateObj.toISOString().split("T")[0];
  } catch {
    return null;
  }
}


function parseAssigneeLogIds(value: string | null | undefined) {
  if (!value?.trim()) return [];

  return value
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => (token.startsWith("usr-") ? token : `usr-${token}`));
}

function resolveAssigneeIdsToNames(ids: string[], users: UserProfile[]) {
  return ids
    .map((id) => {
      const user = users.find(
        (candidate) =>
          candidate.id === id ||
          candidate.id === id.replace(/^usr-/, "") ||
          candidate.employeeCode === id,
      );
      return user?.name || id;
    })
    .filter(Boolean)
    .join(", ");
}

function formatAssigneeChangeMessage(
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
  users: UserProfile[],
) {
  const previousIds = parseAssigneeLogIds(oldValue);
  const currentIds = parseAssigneeLogIds(newValue);
  const previousSet = new Set(previousIds);
  const currentSet = new Set(currentIds);
  const addedIds = currentIds.filter((id) => !previousSet.has(id));
  const removedIds = previousIds.filter((id) => !currentSet.has(id));

  return {
    addedNames: addedIds.length ? resolveAssigneeIdsToNames(addedIds, users) : "",
    removedNames: removedIds.length ? resolveAssigneeIdsToNames(removedIds, users) : "",
  };
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
  showGoToProject?: boolean;
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
  showGoToProject = true,
}: TaskDetailModalProps) {
  const [task, setTask] = useState<EnrichedTask | Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [estimateDraft, setEstimateDraft] = useState("0");
  const [isLogworkModalOpen, setIsLogworkModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [selectedLogworkEntry, setSelectedLogworkEntry] = useState<TaskLogworkEntry | null>(null);
  const [editingLogworkEntry, setEditingLogworkEntry] = useState<TaskLogworkEntry | null>(null);
  const estimateSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEstimateRef = useRef<PendingEstimateUpdate | null>(null);

  const [logworks, setLogworks] = useState<TaskLogworkEntry[]>([]);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmDeleteOpen(false);
    }
  }, [isOpen]);

  const canEditTask = true; // Cho phép tất cả thành viên trong dự án có thể chỉnh sửa chi tiết task
  const canUpdateStatus = true; // Ai cũng có thể update status (vì cũng có quyền kéo thả)
  const canLogwork = true;

  const resolvedAssignees: UserProfile[] = (() => {
    if (task && "assignees" in task && Array.isArray(task.assignees) && task.assignees.length) {
      return task.assignees.filter(Boolean) as UserProfile[];
    }
    const ids = task?.assigneeIds?.length
      ? task.assigneeIds
      : task?.assigneeId
        ? [task.assigneeId]
        : [];
    return ids
      .map((assigneeId) => {
        const fromUsers = users.find((user) => user.id === assigneeId);
        if (fromUsers) return fromUsers;
        const preview = task?.assignees?.find((assignee) => assignee.id === assigneeId);
        return {
          id: assigneeId,
          name: preview?.name || task?.assigneeName || "Người dùng",
          email: preview?.email || task?.assigneeEmail || "",
          role: "MEMBER",
          roles: ["MEMBER"],
          title: preview?.email || task?.assigneeEmail || "Thành viên dự án",
          initials: (preview?.name || task?.assigneeName || "ND")
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
          // UserAvatar derives the fallback from assigneeId consistently.
          avatarUrl: undefined,
        } satisfies UserProfile;
      });
  })();

  const projectMemberIds = task && "project" in task ? task.project?.memberIds : null;
  const projectUsers = projectMemberIds
    ? users.filter((u) => projectMemberIds.includes(u.id))
    : users;

  const extraAssignees = resolvedAssignees.filter(
    (assignee) => !projectUsers.some((user) => user.id === assignee.id),
  );
  const assigneeOptions = [...extraAssignees, ...projectUsers];

  const isWaterfall = task && "project" in task && task.project?.projectType === "waterfall";
  const isAgile = task && "project" in task && task.project?.projectType === "agile";
  const isBacklog = isAgile && !task?.sprintId;

  const hasChildren = Boolean(task?.hasChildren);
  // Cho phép chỉnh sửa người thực hiện trên task lá (không có subtask con)
  const canEditAssignee = !hasChildren;
  const viewer = users.find((user) => user.id === viewerId);
  const canGoToLogworkApprovals = viewer ? canAccessLogworkApprovalsRole(viewer.role) : false;
  const canDeleteTask = Boolean(
    canManage ||
      (viewer &&
        (canDeleteTaskRole(viewer.role, viewer.department) ||
          (task && "project" in task && task.project?.managerId === viewer.id)))
  );

  const descendantIds = useMemo(() => {
    if (!task || !projectTasks.length) return new Set<string>();
    const descendants = new Set<string>();
    const queue = [task.id];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const t of projectTasks) {
        if (t.parentTaskId === currentId && !descendants.has(t.id)) {
          descendants.add(t.id);
          queue.push(t.id);
        }
      }
    }
    return descendants;
  }, [task, projectTasks]);

  const parentTaskOptions = useMemo(() => {
    if (!task) return [];
    return projectTasks.filter(
      (candidate) => candidate.id !== task.id && !descendantIds.has(candidate.id)
    );
  }, [task, projectTasks, descendantIds]);

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
      if (taskResponse.data.projectId) {
        taskApi
          .list({ projectId: taskResponse.data.projectId })
          .then((res) => setProjectTasks(res.data))
          .catch(() => {});
      }
    } catch (error: unknown) {
      alert(
        `Không thể tải thông tin công việc: ${
          error instanceof Error ? error.message : "Unknown error"
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
    const handleNewNotification = () => {
      if (isOpen && taskId) {
        void Promise.all([
          taskApi.getLogs(taskId).then((res) => setTaskLogs(res.data)),
          taskApi.listLogworks(taskId).then((res) => setLogworks(res.data)),
        ]).catch(() => {});
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
      if ("parentTaskId" in updates && refreshed.data.projectId) {
        taskApi
          .list({ projectId: refreshed.data.projectId })
          .then((res) => setProjectTasks(res.data))
          .catch(() => {});
      }
      onTaskUpdated(refreshed.data);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || "Cập nhật thất bại";
      alert(`Cập nhật thất bại: ${msg}`);
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
    if (!pending || !task || pending.taskId !== task.id || hasChildren) return;

    let newEstimate = parseFloat(pending.value) || 0;
    if (newEstimate > 99999) {
      newEstimate = 99999;
    }
    if (newEstimate === pending.currentEstimate) {
      setEstimateDraft(String(pending.currentEstimate || 0));
      return;
    }

    const updates: Partial<Task> = { estimateHours: newEstimate };
    if (pending.startDate) {
      const calculated = calculateDueDateFromEstimate(pending.startDate, newEstimate);
      if (calculated) {
        updates.dueDate = calculated;
      }
    }

    await handleUpdate(updates);
  }

  function scheduleEstimateUpdate(value: string) {
    if (!task || hasChildren) return;

    let sanitized = value;
    if (sanitized.length > 5) {
      sanitized = sanitized.slice(0, 5);
    }
    const parsed = parseFloat(sanitized);
    if (!isNaN(parsed) && parsed > 99999) {
      sanitized = "99999";
    }

    setEstimateDraft(sanitized);
    pendingEstimateRef.current = {
      taskId: task.id,
      value: sanitized,
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
    if (isConfirmDeleteOpen || isLogworkModalOpen || selectedLogworkEntry) {
      return;
    }
    void commitPendingEstimate();
    onClose();
  }

  async function handleAssigneeChange(nextAssigneeIds: string[]) {
    if (!task) return;

    setIsSaving(true);
    try {
      await taskApi.updateAssignee(task.id, nextAssigneeIds);
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
      alert(
        `Cập nhật người thực hiện thất bại: ${
          error instanceof Error ? error.message : "Unknown error"
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

  async function handleDeleteTask() {
    if (!task) return;

    setIsSaving(true);
    try {
      await taskApi.remove(task.id);
      if (onTaskDeleted) {
        await onTaskDeleted(task.id);
      } else {
        onClose();
      }
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || "Lỗi khi xoá task";
      alert(msg);
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
                {isLoading ? "Đang tải..." : task?.title}
              </h2>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {canDeleteTask && (
              <button
                type="button"
                className="secondary-button"
                style={{
                  color: "var(--critical-fg)",
                  borderColor: "var(--critical-border)",
                  padding: "0.5rem 1rem",
                  fontSize: "0.85rem",
                }}
                onClick={() => setIsConfirmDeleteOpen(true)}
                disabled={isLoading || isSaving}
              >
                Xoá task
              </button>
            )}
            {showGoToProject && task?.projectId ? (
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
            {canLogwork ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setEditingLogworkEntry(null);
                  setIsLogworkModalOpen(true);
                }}
                disabled={isLoading}
                style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
              >
                + Logwork
              </button>
            ) : null}
            <button
              onClick={handleClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.35rem",
                cursor: "pointer",
                color: "var(--foreground-muted)",
                padding: "0.25rem 0.5rem",
              }}
            >
              &times;
            </button>
          </div>
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
                  <span className="task-detail-field-label">Người thực hiện</span>
                  <AssigneeSelect
                    className="task-detail-control"
                    value={isBacklog ? [] : task?.assigneeIds?.length ? task.assigneeIds : task?.assigneeId ? [task.assigneeId] : []}
                    onChange={(val) => void handleAssigneeChange(val)}
                    disabled={isLoading || isSaving || !canEditAssignee}
                    title={
                      hasChildren
                        ? "Người thực hiện task cha được lấy từ tất cả người thực hiện các task lá."
                        : ""
                    }
                    options={assigneeOptions}
                  />
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Thời gian ước tính</span>
                  <input
                    className="task-detail-control"
                    type="number"
                    min="0"
                    max="99999"
                    step="0.5"
                    value={estimateDraft}
                    onChange={(event) => scheduleEstimateUpdate(event.target.value)}
                    onBlur={() => void commitPendingEstimate()}
                    disabled={isLoading || isSaving || !canEditTask || hasChildren}
                    title={
                      hasChildren
                        ? "Thời gian ước tính của task cha được tính tự động từ tổng các task con."
                        : ""
                    }
                  />
                </label>

                {!isAgile && (
                  <label className="task-detail-field" style={{ gridColumn: "1 / -1" }}>
                    <span className="task-detail-field-label">Parent task</span>
                    <CustomSelect
                      testId="task-parent-select"
                      className="task-detail-control"
                      value={task?.parentTaskId || ""}
                      onChange={(nextParentId) => {
                        void handleUpdate({ parentTaskId: nextParentId ? String(nextParentId) : null });
                      }}
                      disabled={isLoading || isSaving || !canEditTask}
                      placeholder="-- Không có (Task gốc) --"
                      style={{
                        color: task?.parentTaskId ? "#1e3a5f" : "#64748b",
                        backgroundColor: task?.parentTaskId
                          ? "rgba(59, 130, 246, 0.12)"
                          : "rgba(148, 163, 184, 0.12)",
                      }}
                      options={[
                        { value: "", label: "-- Không có (Task gốc) --" },
                        ...parentTaskOptions.map((candidate) => ({
                          value: candidate.id,
                          label: candidate.key ? `${candidate.key} - ${candidate.title}` : candidate.title,
                        })),
                      ]}
                    />
                  </label>
                )}

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
                          const calculated = calculateDueDateFromEstimate(newStartDate, task.estimateHours);
                          if (calculated) {
                            updates.dueDate = calculated;
                          }
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
                Nhật ký thay đổi (Task Log)
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
                          (() => {
                            const { addedNames, removedNames } = formatAssigneeChangeMessage(
                              log.old_value,
                              log.new_value,
                              users,
                            );

                            if (!addedNames && !removedNames) {
                              return <span>Đã cập nhật người thực hiện</span>;
                            }

                            return (
                              <span>
                                {addedNames ? (
                                  <>
                                    Đã giao việc cho{" "}
                                    <strong style={{ color: "var(--primary-fg)" }}>{addedNames}</strong>
                                  </>
                                ) : null}
                                {addedNames && removedNames ? ". " : null}
                                {removedNames ? (
                                  <>
                                    Đã xóa{" "}
                                    <strong style={{ color: "var(--primary-fg)" }}>{removedNames}</strong>{" "}
                                    khỏi task
                                  </>
                                ) : null}
                              </span>
                            );
                          })()
                        ) : log.action === "updated" ? (
                          <span>
                            Đã cập nhật{" "}
                            <strong>
                              {(
                                {
                                  parent_task_id: "parent task",
                                  title: "tiêu đề",
                                  description: "mô tả",
                                  status: "trạng thái",
                                  priority: "độ ưu tiên",
                                  estimated_hours: "thời gian ước tính",
                                  start_date: "ngày bắt đầu",
                                  deadline: "hạn chót",
                                  sprint_id: "sprint",
                                } as Record<string, string>
                              )[log.field_changed ?? ""] ?? log.field_changed}
                            </strong>
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
              <span
                className="task-detail-field-label"
                style={{
                  marginBottom: "0.75rem",
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
                  gap: "1rem",
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  paddingRight: "0.35rem",
                }}
              >
                {isLoading ? (
                  <div style={{ color: "var(--foreground-muted)", fontSize: "0.9rem" }}>
                    Đang tải logwork...
                  </div>
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
                      <div className="task-detail-logwork-meta">
                        <span className="task-detail-logwork-hours">{entry.hoursSpent}h</span>
                        <span className={`logwork-status-pill ${logworkStatusClassName(entry.status)}`}>
                          {logworkStatusLabel(entry.status)}
                        </span>
                        <span className="task-detail-logwork-note">{truncateText(entry.workContent)}</span>
                      </div>
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
          onClose={() => {
            setIsLogworkModalOpen(false);
            setEditingLogworkEntry(null);
          }}
          taskId={task.id}
          userId={viewerId}
          entry={editingLogworkEntry}
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
        onGoToApprovals={() => {
          setSelectedLogworkEntry(null);
          onClose();
        }}
        canGoToApprovals={canGoToLogworkApprovals}
        canEdit={
          selectedLogworkEntry
            ? canEditPendingLogwork(selectedLogworkEntry.status, selectedLogworkEntry.userId, viewerId)
            : false
        }
        onEdit={() => {
          if (!selectedLogworkEntry) return;
          setEditingLogworkEntry(selectedLogworkEntry);
          setSelectedLogworkEntry(null);
          setIsLogworkModalOpen(true);
        }}
      />

      <ConfirmModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={async () => {
          await handleDeleteTask();
          setIsConfirmDeleteOpen(false);
        }}
        title="Xoá task"
        message="Bạn có chắc chắn muốn xoá task này không? Hành động này không thể hoàn tác."
        confirmText="Xoá"
      />
    </div>
  );
}
