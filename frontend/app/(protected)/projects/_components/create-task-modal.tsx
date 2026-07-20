import { useMemo, useState } from "react";

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
  const [parentTaskId, setParentTaskId] = useState(defaultParentTaskId);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parentTaskOptions = useMemo(
    () => tasks.filter((task) => task.projectId === projectId),
    [projectId, tasks],
  );

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!title.trim() || !startDate || !dueDate) {
      setFormError("Vui lòng nhập tiêu đề, ngày bắt đầu và hạn chót.");
      return;
    }

    if (dueDate < startDate) {
      setFormError("Hạn chót phải sau hoặc bằng ngày bắt đầu.");
      return;
    }

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
        assigneeId: assigneeId,
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
      setFormError(error instanceof Error ? error.message : "Lỗi tạo công việc.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.56)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1.5rem",
      }}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        style={{
          background: "var(--surface)",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "820px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 28px 80px rgba(15, 23, 42, 0.3)",
          border: "1px solid rgba(148, 163, 184, 0.22)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: "1.5rem 1.5rem 1rem",
            borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.8rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--foreground-muted)",
                marginBottom: "0.4rem",
              }}
            >
              Dự án hiện tại
            </div>
            <h2 id="create-task-title" style={{ margin: 0, fontSize: "1.4rem" }}>
              Tạo công việc mới
            </h2>
            <p style={{ margin: "0.5rem 0 0", color: "var(--foreground-muted)", lineHeight: 1.6 }}>
              Tạo task ngay trong dự án <strong style={{ color: "var(--foreground)" }}>{projectName}</strong> và gán người phụ trách, timeline, parent task nếu cần.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng popup"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-sunken)",
              color: "var(--foreground-muted)",
              width: "40px",
              height: "40px",
              borderRadius: "999px",
              cursor: "pointer",
              fontSize: "1.1rem",
            }}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.5rem" }}
        >
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                padding: "1.25rem",
                borderRadius: "18px",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--foreground-muted)",
                }}
              >
                Thông tin cơ bản
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                  Dự án
                </label>
                <input
                  value={projectName}
                  readOnly
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    borderRadius: "14px",
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
                  placeholder="Ví dụ: Hoàn thiện API cho task detail"
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
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
                  rows={6}
                  placeholder="Mô tả ngắn gọn mục tiêu, phạm vi và đầu ra mong đợi..."
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    borderRadius: "14px",
                    border: "1px solid var(--border)",
                    background: "var(--surface-sunken)",
                    color: "var(--foreground)",
                    resize: "vertical",
                    minHeight: "140px",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                padding: "1.25rem",
                borderRadius: "18px",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--foreground-muted)",
                }}
              >
                Phân công và timeline
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                    Người thực hiện
                  </label>
                  <select
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.85rem 1rem",
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
                      padding: "0.85rem 1rem",
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                    Ngày bắt đầu *
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      const newStartDate = event.target.value;
                      setStartDate(newStartDate);
                      const parsedHours = parseFloat(estimatedHours) || 0;
                      if (parsedHours > 0 && newStartDate) {
                        const daysRequired = Math.ceil(parsedHours / 8);
                        const startDateObj = new Date(newStartDate);
                        startDateObj.setDate(startDateObj.getDate() + (daysRequired - 1));
                        setDueDate(startDateObj.toISOString().split("T")[0]);
                      }
                    }}
                    required
                    style={{
                      width: "100%",
                      padding: "0.85rem 1rem",
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
                      padding: "0.85rem 1rem",
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
                    onChange={(event) => {
                      const newEstimate = event.target.value;
                      setEstimatedHours(newEstimate);
                      const parsed = parseFloat(newEstimate) || 0;
                      if (parsed > 0 && startDate) {
                        const daysRequired = Math.ceil(parsed / 8);
                        const startDateObj = new Date(startDate);
                        startDateObj.setDate(startDateObj.getDate() + (daysRequired - 1));
                        setDueDate(startDateObj.toISOString().split("T")[0]);
                      }
                    }}
                    placeholder="Ví dụ: 6"
                    style={{
                      width: "100%",
                      padding: "0.85rem 1rem",
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
                    padding: "0.85rem 1rem",
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
            </div>
          </div>

          {formError ? (
            <div
              style={{
                padding: "0.95rem 1rem",
                borderRadius: "14px",
                border: "1px solid rgba(220, 38, 38, 0.22)",
                background: "rgba(254, 242, 242, 0.92)",
                color: "#b91c1c",
                fontSize: "0.95rem",
              }}
            >
              {formError}
            </div>
          ) : null}

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
      </section>
    </div>
  );
}
