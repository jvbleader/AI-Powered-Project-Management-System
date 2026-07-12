import { useEffect, useMemo, useState } from "react";

import { taskApi } from "@/services/api";
import type { EnrichedTask, UserProfile } from "@/types";

interface CreateTaskModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  users: UserProfile[];
  tasks: EnrichedTask[];
  defaultParentTaskId?: string;
}

const today = new Date().toISOString().split("T")[0];

export function CreateTaskModal({
  projectId,
  projectName,
  isOpen,
  onClose,
  onSuccess,
  users,
  tasks,
  defaultParentTaskId = "",
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [assigneeId, setAssigneeId] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [parentTaskId, setParentTaskId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setStartDate(today);
    setDueDate(today);
    setAssigneeId("");
    setEstimatedHours("");
    setParentTaskId(defaultParentTaskId);
  }, [defaultParentTaskId, isOpen]);

  const parentTaskOptions = useMemo(
    () => tasks.filter((task) => task.projectId === projectId),
    [projectId, tasks],
  );

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !startDate || !dueDate) return;

    setIsLoading(true);
    try {
      await taskApi.create({
        projectId,
        title: title.trim(),
        description: description.trim(),
        status: "TODO",
        priority,
        startDate,
        dueDate,
        estimateHours: estimatedHours ? parseFloat(estimatedHours) : 0,
        assigneeId,
        sprintId: null,
        parentTaskId: parentTaskId || null,
        spentHours: 0,
        tags: [],
        blockers: [],
        commentsCount: 0,
        lastActivity: "",
        key: "",
        reporterId: "",
      });
      onSuccess();
      onClose();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Lỗi tạo công việc.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          padding: "2rem",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "760px",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
        }}
      >
        <h2 style={{ margin: "0 0 1.5rem 0" }}>Tạo công việc mới</h2>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
              Dự án
            </label>
            <input
              value={projectName}
              readOnly
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "999px",
                border: "1px solid var(--border)",
                background: "var(--surface-sunken)",
                color: "var(--foreground-muted)",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
              Tiêu đề *
            </label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "14px",
                border: "1px solid var(--border)",
                background: "var(--surface-sunken)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
              Mô tả
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "14px",
                border: "1px solid var(--border)",
                background: "var(--surface-sunken)",
                color: "var(--foreground)",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                Người thực hiện
              </label>
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "14px",
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
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                Mức độ ưu tiên
              </label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as typeof priority)}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "14px",
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
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                Ngày bắt đầu *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "14px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                Hạn chót *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "14px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                Ước tính (giờ)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={estimatedHours}
                onChange={(event) => setEstimatedHours(event.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "14px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-sunken)",
                  color: "var(--foreground)",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
              Parent task
            </label>
            <select
              value={parentTaskId}
              onChange={(event) => setParentTaskId(event.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "14px",
                border: "1px solid var(--border)",
                background: "var(--surface-sunken)",
                color: "var(--foreground)",
              }}
            >
              <option value="">-- Không có --</option>
              {parentTaskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.key} - {task.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              className="secondary-button"
              disabled={isLoading}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isLoading || !title.trim() || !startDate || !dueDate}
            >
              {isLoading ? "Đang tạo..." : "Tạo mới"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
