import { useState, type FormEvent } from "react";
import { roleLabel } from "@/lib/utils/format";
import type { UserProfile } from "@/types";
import { projectApi } from "@/services/api";
import styles from "../../team/styles/team.module.css";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  viewerId: string;
  accessibleUsers: UserProfile[];
  onProjectCreated: (projectId: string) => void;
}

export function CreateProjectModal({ isOpen, onClose, viewerId, accessibleUsers, onProjectCreated }: CreateProjectModalProps) {
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectStart, setNewProjectStart] = useState("2026-07-01");
  const [newProjectEnd, setNewProjectEnd] = useState("2026-08-15");
  const [newProjectManagerId, setNewProjectManagerId] = useState(viewerId);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  function buildProjectCode(name: string) {
    const words = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
      .filter(Boolean);
  
    return `FP-${words.join("").slice(0, 8) || "NEW"}`;
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!newProjectName.trim() || !newProjectDescription.trim() || !newProjectStart || !newProjectEnd) {
      setFormError("Vui lòng nhập đầy đủ tên dự án, mô tả, ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (newProjectEnd < newProjectStart) {
      setFormError("Ngày kết thúc dự kiến phải sau ngày bắt đầu.");
      return;
    }

    const created = await projectApi.create({
      code: buildProjectCode(newProjectName),
      name: newProjectName.trim(),
      description: newProjectDescription.trim(),
      status: "PLANNING",
      progress: 0,
      managerId: newProjectManagerId,
      memberIds: Array.from(new Set([newProjectManagerId])),
      startDate: newProjectStart,
      endDate: newProjectEnd,
      currentSprintId: null,
      objectives: ["Xác định phạm vi", "Thiết lập sprint đầu tiên", "Phân bổ thành viên"],
      metrics: {
        completedTasks: 0,
        overdueTasks: 0,
        logworkCoverage: 0,
        velocity: 0,
      },
    });

    setNewProjectName("");
    setNewProjectDescription("");
    setNewProjectStart("2026-07-01");
    setNewProjectEnd("2026-08-15");
    
    onProjectCreated(created.data.id);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`password-modal ${styles.addModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="password-modal-header">
          <h2 id="add-project-title">Tạo dự án mới</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Đóng popup">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form className="surface-form" onSubmit={handleCreateProject}>
          <div className="form-grid">
            <label>
              <span>Tên dự án</span>
              <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} required />
            </label>
            <label>
              <span>Người quản lý</span>
              <select value={newProjectManagerId} onChange={(event) => setNewProjectManagerId(event.target.value)}>
                {accessibleUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} - {roleLabel(user.role)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-grid-span">
              <span>Mô tả chi tiết</span>
              <textarea
                value={newProjectDescription}
                onChange={(event) => setNewProjectDescription(event.target.value)}
                required
                rows={4}
              />
            </label>
            <label>
              <span>Ngày bắt đầu</span>
              <input type="date" value={newProjectStart} onChange={(event) => setNewProjectStart(event.target.value)} required />
            </label>
            <label>
              <span>Ngày kết thúc dự kiến</span>
              <input type="date" value={newProjectEnd} onChange={(event) => setNewProjectEnd(event.target.value)} required />
            </label>
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="primary-button">
              Tạo dự án
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
