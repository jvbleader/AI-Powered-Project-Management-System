import { useEffect, useState } from "react";

import { taskApi } from "@/services/api";
import type { EnrichedTask, Task, UserProfile } from "@/types";

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

  useEffect(() => {
    if (isOpen && taskId) {
      void loadTask(taskId);
    } else {
      setTask(null);
      setIsEditingTitle(false);
      setIsEditingDesc(false);
    }
  }, [isOpen, taskId]);

  const isAssignee = Boolean(task?.assigneeId && task.assigneeId === viewerId);
  const canEditTask = canManage;
  const canUpdateStatus = canManage || isAssignee;

  async function loadTask(nextTaskId: string) {
    setIsLoading(true);
    try {
      const response = await taskApi.getEnrichedTask(nextTaskId, undefined, { users });
      setTask(response.data);
      setEditTitle(response.data.title);
      setEditDesc(response.data.description);
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
  }

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
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "800px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}
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

        <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1, display: "flex", gap: "2rem" }}>
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
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  color: "var(--foreground-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Trạng thái
              </label>
              <select
                value={task?.status || "TODO"}
                onChange={(event) => void handleUpdate({ status: event.target.value as Task["status"] })}
                disabled={isLoading || isSaving || !canUpdateStatus}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              >
                <option value="TODO">Cần làm</option>
                <option value="IN_PROGRESS">Đang tiến hành</option>
                <option value="DONE">Hoàn thành</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  color: "var(--foreground-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Người thực hiện
              </label>
              <select
                value={task?.assigneeId || ""}
                onChange={(event) => void handleAssigneeChange(event.target.value)}
                disabled={isLoading || isSaving || !canEditTask}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              >
                <option value="">-- Chưa phân công --</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  color: "var(--foreground-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Ưu tiên
              </label>
              <select
                value={task?.priority || "MEDIUM"}
                onChange={(event) => void handleUpdate({ priority: event.target.value as Task["priority"] })}
                disabled={isLoading || isSaving || !canEditTask}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              >
                <option value="LOW">Thấp</option>
                <option value="MEDIUM">Trung bình</option>
                <option value="HIGH">Cao</option>
                <option value="CRITICAL">Khẩn cấp</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  color: "var(--foreground-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Ngày bắt đầu
              </label>
              <input
                type="date"
                value={task?.startDate || ""}
                onChange={(event) => void handleUpdate({ startDate: event.target.value })}
                disabled={isLoading || isSaving || !canEditTask}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  color: "var(--foreground-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Hạn chót
              </label>
              <input
                type="date"
                value={task?.dueDate || ""}
                onChange={(event) => void handleUpdate({ dueDate: event.target.value })}
                disabled={isLoading || isSaving || !canEditTask}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  color: "var(--foreground-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Thời gian ước tính (giờ)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={task?.estimateHours || 0}
                onChange={(event) =>
                  void handleUpdate({ estimateHours: parseFloat(event.target.value) || 0 })
                }
                disabled={isLoading || isSaving || !canEditTask}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
