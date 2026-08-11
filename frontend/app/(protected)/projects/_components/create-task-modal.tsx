import { useEffect, useMemo, useState } from "react";

import { taskApi } from "@/services/api";
import { AssigneeSelect } from "@/components/assignee-select";
import { CustomSelect } from "@/components/custom-select";
import type { EnrichedTask, UserProfile } from "@/types";

interface CreateTaskModalProps {
  projectId: string;
  projectName: string;
  projectType: string;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  users: UserProfile[];
  tasks: EnrichedTask[];
  defaultParentTaskId?: string;
}

const today = new Date().toISOString().split("T")[0];

function resolveTaskDates(task: EnrichedTask | undefined) {
  const startDate = task?.startDate || today;
  const dueDate = task?.dueDate || task?.startDate || today;
  return { startDate, dueDate };
}

export function CreateTaskModal({
  projectId,
  projectName,
  projectType,
  currentUserId,
  isOpen,
  onClose,
  onSuccess,
  users,
  tasks,
  defaultParentTaskId = "",
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"TODO" | "IN_PROGRESS" | "DONE">("TODO");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [assigneeId, setAssigneeId] = useState(() => projectType === "waterfall" ? currentUserId : "");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [parentTaskId, setParentTaskId] = useState(defaultParentTaskId);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parentTaskOptions = useMemo(
    () => tasks.filter((task) => task.projectId === projectId),
    [projectId, tasks],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setParentTaskId(defaultParentTaskId);
    const parent = tasks.find((task) => String(task.id) === String(defaultParentTaskId));
    const dates = resolveTaskDates(parent);
    setStartDate(dates.startDate);
    setDueDate(dates.dueDate);
  }, [isOpen, defaultParentTaskId, tasks]);

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
        status: status,
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
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="task-detail-modal"
        role="dialog"
        data-testid="create-task-modal"
        aria-modal="true"
        aria-labelledby="create-task-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: "800px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ padding: "1.5rem", borderBottom: "1px solid rgba(148, 163, 184, 0.15)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground-muted)", letterSpacing: "0.02em" }}>Dự án: {projectName}</span>
            </div>
            <h2 id="create-task-title" style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Tạo công việc mới
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--foreground-muted)", padding: "0.25rem 0.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            &times;
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="task-detail-layout"
          data-testid="create-task-form"
          style={{ padding: "0 1.5rem 1.5rem 1.5rem", overflow: "auto", flex: 1, display: "flex", flexDirection: "column" }}
        >
          <div style={{ flexShrink: 0, marginBottom: "0.5rem", paddingTop: "1.5rem" }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <span className="task-detail-field-label" style={{ marginBottom: "0.5rem", display: "block" }}>
                Tiêu đề công việc<span className="required-asterisk" aria-hidden="true">*</span>
              </span>
              <input
                data-testid="task-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                placeholder="Ví dụ: Hoàn thiện API cho task detail"
                style={{
                  width: "100%",
                  padding: "0.85rem 1rem",
                  borderRadius: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  background: "rgba(248, 250, 252, 0.5)",
                  color: "var(--ink)",
                  fontSize: "1.05rem",
                  fontWeight: 600,
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
            
            <div style={{ marginBottom: "0.75rem", marginTop: "1.25rem" }}>
              <span className="task-detail-field-label" style={{ marginBottom: "0.5rem", display: "block" }}>Mô tả công việc</span>
              <textarea
                data-testid="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={6}
                style={{
                  width: "100%",
                  padding: "0.85rem 1rem",
                  borderRadius: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  background: "rgba(248, 250, 252, 0.5)",
                  color: "var(--ink)",
                  resize: "vertical",
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
                placeholder="Mô tả ngắn gọn mục tiêu, phạm vi và đầu ra mong đợi..."
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", paddingTop: "1rem" }}>
              <label className="task-detail-field">
                <span className="task-detail-field-label">Trạng thái</span>
                <CustomSelect
                  testId="task-status"
                  className="task-detail-control"
                  value={status}
                  onChange={(val) => setStatus(val as any)}
                  style={{
                    color: status === "DONE" ? "#15803d" : status === "IN_PROGRESS" ? "#1d4ed8" : "#b45309",
                    backgroundColor: status === "DONE" ? "rgba(34, 197, 94, 0.15)" : status === "IN_PROGRESS" ? "rgba(59, 130, 246, 0.15)" : "rgba(250, 204, 21, 0.18)"
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
                  testId="task-priority"
                  className="task-detail-control"
                  value={priority}
                  onChange={(val) => setPriority(val as any)}
                  style={{
                    color: priority === "CRITICAL" ? "#b91c1c" : priority === "HIGH" ? "#b45309" : priority === "MEDIUM" ? "#15803d" : "#0369a1",
                    backgroundColor: priority === "CRITICAL" ? "rgba(220, 38, 38, 0.15)" : priority === "HIGH" ? "rgba(217, 119, 6, 0.15)" : priority === "MEDIUM" ? "rgba(22, 163, 74, 0.15)" : "rgba(2, 132, 199, 0.15)"
                  }}
                  options={[
                    { value: "LOW", label: "Thấp" },
                    { value: "MEDIUM", label: "Trung bình" },
                    { value: "HIGH", label: "Cao" },
                    { value: "CRITICAL", label: "Khẩn cấp" },
                  ]}
                />
              </label>

              <label className="task-detail-field" style={{ opacity: projectType === "agile" ? 0.5 : 1 }}>
                <span className="task-detail-field-label">Người thực hiện</span>
                <AssigneeSelect
                  value={assigneeId}
                  onChange={(val) => setAssigneeId(val)}
                  options={users}
                  className="task-detail-control"
                  disabled={projectType === "agile"}
                />
              </label>

              {projectType !== "agile" && (
                <label className="task-detail-field">
                  <span className="task-detail-field-label">Parent task</span>
                  <CustomSelect
                    testId="task-parent"
                    className="task-detail-control"
                    value={parentTaskId}
                    onChange={(nextParentId) => {
                      setParentTaskId(nextParentId);
                      const parent = tasks.find((task) => String(task.id) === String(nextParentId));
                      if (parent) {
                        const dates = resolveTaskDates(parent);
                        setStartDate(dates.startDate);
                        setDueDate(dates.dueDate);
                      }
                    }}
                    placeholder="-- Không có --"
                    style={{
                      color: parentTaskId ? "#1e3a5f" : "#64748b",
                      backgroundColor: parentTaskId
                        ? "rgba(59, 130, 246, 0.12)"
                        : "rgba(148, 163, 184, 0.12)",
                    }}
                    options={[
                      { value: "", label: "-- Không có --" },
                      ...parentTaskOptions.map((task) => ({
                        value: task.id,
                        label: task.key ? `${task.key} - ${task.title}` : task.title,
                      })),
                    ]}
                  />
                </label>
              )}

              <label className="task-detail-field">
                <span className="task-detail-field-label">
                  Ngày bắt đầu<span className="required-asterisk" aria-hidden="true">*</span>
                </span>
                <span className="task-detail-date">
                  <input
                    data-testid="task-start-date"
                    className="task-detail-control"
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
                    style={{ fontFamily: "inherit" }}
                  />
                  <span className="task-detail-date-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                </span>
              </label>

              <label className="task-detail-field">
                <span className="task-detail-field-label">
                  Hạn chót<span className="required-asterisk" aria-hidden="true">*</span>
                </span>
                <span className="task-detail-date">
                  <input
                    data-testid="task-due-date"
                    className="task-detail-control"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    required
                    style={{ fontFamily: "inherit" }}
                  />
                  <span className="task-detail-date-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                </span>
              </label>

              <label className="task-detail-field">
                <span className="task-detail-field-label">Thời gian ước tính (giờ)</span>
                <input
                  data-testid="task-estimated-hours"
                  className="task-detail-control"
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
                  style={{ fontFamily: "inherit" }}
                />
              </label>
            </div>
            
            {formError && (
              <div
                style={{
                  marginTop: "1.25rem",
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
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "2rem" }}>
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
              data-testid="create-task-submit"
              className="primary-button"
              disabled={isLoading || !title.trim() || !startDate || !dueDate}
            >
              {isLoading ? "Đang tạo..." : "Tạo công việc"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
