import { useEffect, useEffectEvent, useState } from "react";

import { taskApi } from "@/services/api";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import type { EnrichedTask, Task, TaskLogworkEntry, UserProfile } from "@/types";
import { LogworkModal } from "./logwork-modal";

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
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [isLogworkModalOpen, setIsLogworkModalOpen] = useState(false);
  const [logworks, setLogworks] = useState<TaskLogworkEntry[]>([]);

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
      const [taskResponse, logworkResponse] = await Promise.all([
        taskApi.getEnrichedTask(nextTaskId, undefined, { users }),
        taskApi.listLogworks(nextTaskId),
      ]);
      setTask(taskResponse.data);
      setEditTitle(taskResponse.data.title);
      setEditDesc(taskResponse.data.description);
      setLogworks(logworkResponse.data);
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

  async function handleUpdate(updates: Partial<Task>) {
    if (!task) return;

    setIsSaving(true);
    try {
      await taskApi.update(task.id, updates);
      const refreshed = await taskApi.getEnrichedTask(task.id, undefined, { users });
      setTask(refreshed.data);
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
      const refreshed = await taskApi.getEnrichedTask(task.id, undefined, { users });
      setTask(refreshed.data);
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
    if (!canEditTask) {
      setIsEditingDesc(false);
      return;
    }

    if (editDesc !== task?.description) {
      void handleUpdate({ description: editDesc });
    }
    setIsEditingDesc(false);
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
          maxWidth: "800px",
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
            padding: "1.5rem",
            borderBottom: "1px solid var(--border)",
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                type="button"
                className="secondary-button"
                style={{ color: "var(--critical-fg)", borderColor: "var(--critical-border)" }}
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
                style={{ textDecoration: "none" }}
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
              >
                + Logwork
              </button>
            ) : null}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.5rem",
                cursor: "pointer",
                color: "var(--foreground-muted)",
              }}
            >
              &times;
            </button>
          </div>
        </div>

        <div className="task-detail-layout" style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
          <div style={{ flex: 2 }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--foreground-muted)" }}>
              Mô tả công việc
            </h3>
            {isEditingDesc ? (
              <div>
                <textarea
                  autoFocus
                  value={editDesc}
                  onChange={(event) => setEditDesc(event.target.value)}
                  rows={6}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    background: "var(--surface-sunken)",
                    color: "var(--foreground)",
                    resize: "vertical",
                    marginBottom: "0.5rem",
                  }}
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="primary-button" onClick={saveDesc} disabled={isSaving}>
                    Lưu
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setIsEditingDesc(false);
                      setEditDesc(task?.description || "");
                    }}
                    disabled={isSaving}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "0.75rem",
                  background: "var(--surface-sunken)",
                  borderRadius: "4px",
                  minHeight: "100px",
                  cursor: canEditTask ? "pointer" : "default",
                  whiteSpace: "pre-wrap",
                }}
                onClick={() => canEditTask && setIsEditingDesc(true)}
                title={canEditTask ? "Bấm để sửa mô tả" : undefined}
              >
                {isLoading ? "..." : task?.description || (
                  <span style={{ color: "var(--foreground-subtle)" }}>Chưa có mô tả.</span>
                )}
              </div>
            )}

            <div style={{ marginTop: "1.5rem" }}>
              <h3
                style={{
                  fontSize: "1rem",
                  marginBottom: "1rem",
                  color: "var(--foreground-muted)",
                }}
              >
                Logwork đã ghi nhận
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                {isLoading ? (
                  <div
                    style={{
                      padding: "1rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--surface-sunken)",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Đang tải logwork...
                  </div>
                ) : logworks.length ? (
                  logworks.map((entry) => (
                    <article
                      key={entry.id}
                      style={{
                        padding: "1rem",
                        borderRadius: "10px",
                        border: "1px solid var(--border)",
                        background: "var(--surface-sunken)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.55rem",
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
                  <div
                    style={{
                      padding: "1rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--surface-sunken)",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Task này chưa có logwork nào.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="task-detail-side">
            <div className="task-detail-assignee-card">
              <div className="task-detail-assignee-kicker">Người đang được giao</div>
              <strong>{isBacklog ? "Chưa phân công" : (resolvedAssignee?.name || task?.assigneeName || "Chưa phân công")}</strong>
              <span>{isBacklog ? "Chưa có thông tin email" : (resolvedAssignee?.email || task?.assigneeEmail || "Chưa có thông tin email")}</span>
            </div>

            <label className="task-detail-field">
              <span className="task-detail-field-label">Trạng thái</span>
              <select
                className="task-detail-control task-detail-select"
                value={task?.status || "TODO"}
                onChange={(event) => void handleUpdate({ status: event.target.value as Task["status"] })}
                disabled={isLoading || isSaving || !canUpdateStatus}
              >
                <option value="TODO">Cần làm</option>
                <option value="IN_PROGRESS">Đang tiến hành</option>
                <option value="DONE">Hoàn thành</option>
              </select>
            </label>

            <label className="task-detail-field">
              <span className="task-detail-field-label">Người thực hiện</span>
              <select
                className="task-detail-control task-detail-select"
                value={isBacklog ? "" : (task?.assigneeId || "")}
                onChange={(event) => void handleAssigneeChange(event.target.value)}
                disabled={isLoading || isSaving || !canEditAssignee}
                title={
                  isAgile 
                    ? "Trong mô hình Agile, người thực hiện được tự động gán khi kéo thả Task trên bảng Kanban." 
                    : (!canManage ? "Chỉ quản lý mới có quyền phân công người thực hiện trong dự án Waterfall." : "")
                }
              >
                <option value="">-- Chưa phân công --</option>
                {assigneeOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="task-detail-field">
              <span className="task-detail-field-label">Ưu tiên</span>
              <select
                className="task-detail-control task-detail-select"
                value={task?.priority || "MEDIUM"}
                onChange={(event) => void handleUpdate({ priority: event.target.value as Task["priority"] })}
                disabled={isLoading || isSaving || !canEditTask}
              >
                <option value="LOW">Thấp</option>
                <option value="MEDIUM">Trung bình</option>
                <option value="HIGH">Cao</option>
                <option value="CRITICAL">Khẩn cấp</option>
              </select>
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
          </aside>
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
