import { useState, useEffect, type FormEvent } from "react";
import { roleLabel, isManagerRole } from "@/lib/utils/format";
import type { UserProfile } from "@/types";
import { userApi } from "@/services/api";
import { projectApi } from "@/services/api";
import { Department } from "@/types/user";
import styles from "./create-project-modal.module.css";
import { hasCompanywideProjectAccess } from "@/lib/utils/format";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  viewerId: string;
  viewerRole: string;
  viewerDepartment: string | null;
  accessibleUsers: UserProfile[];
  onProjectCreated: (projectId: string) => void;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  viewerId,
  viewerRole,
  viewerDepartment,
  accessibleUsers,
  onProjectCreated,
}: CreateProjectModalProps) {
  const canSelectDepartment = hasCompanywideProjectAccess(viewerRole as any, viewerDepartment);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectStart, setNewProjectStart] = useState("2026-07-01");
  const [newProjectEnd, setNewProjectEnd] = useState("2026-08-15");
  const [newProjectType, setNewProjectType] = useState<"agile" | "waterfall">("agile");
  const [newProjectDepartmentId, setNewProjectDepartmentId] = useState<string>("");
  const [newProjectManagerId, setNewProjectManagerId] = useState(viewerId);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    if (isOpen) {
      userApi.getDepartments().then(res => {
        setDepartments(res.data);
        if (res.data.length > 0) {
          if (!canSelectDepartment && viewerDepartment) {
            const userDept = res.data.find((d: Department) => d.name === viewerDepartment);
            if (userDept) {
              setNewProjectDepartmentId(String(userDept.id));
            } else if (!newProjectDepartmentId) {
              setNewProjectDepartmentId(String(res.data[0].id));
            }
          } else if (!newProjectDepartmentId) {
            setNewProjectDepartmentId(String(res.data[0].id));
          }
        }
      }).catch(console.error);
    }
  }, [isOpen, canSelectDepartment, viewerDepartment]);

  const extractErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;
  const handleClose = () => {
    setFormError(null);
    onClose();
  };

  const selectedDepartmentName = departments.find(d => String(d.id) === newProjectDepartmentId)?.name;
  const filteredManagers = accessibleUsers.filter(user => 
    isManagerRole(user.role) && user.department === selectedDepartmentName
  );

  useEffect(() => {
    if (filteredManagers.length > 0) {
      if (!filteredManagers.find(m => m.id === newProjectManagerId)) {
        setNewProjectManagerId(filteredManagers[0].id);
      }
    } else {
      setNewProjectManagerId("");
    }
  }, [newProjectDepartmentId]);

  if (!isOpen) return null;

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (
      !newProjectName.trim() ||
      !newProjectDescription.trim() ||
      !newProjectStart ||
      !newProjectEnd ||
      !newProjectDepartmentId
    ) {
      setFormError("Vui lòng nhập đầy đủ tên dự án, phòng ban, mô tả, ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (newProjectEnd < newProjectStart) {
      setFormError("Ngày kết thúc dự kiến phải sau ngày bắt đầu.");
      return;
    }

    const parsedManagerId = parseInt(newProjectManagerId.replace("usr-", ""), 10);
    setIsSubmitting(true);

    try {
      const created = await projectApi.create({
        name: newProjectName.trim(),
        project_type: newProjectType,
        description: newProjectDescription.trim(),
        start_date: newProjectStart,
        end_date: newProjectEnd,
        manager_id: isNaN(parsedManagerId) ? 1 : parsedManagerId,
        department_id: parseInt(newProjectDepartmentId, 10)
      });

      setNewProjectName("");
      setNewProjectDescription("");
      setNewProjectStart("2026-07-01");
      setNewProjectEnd("2026-08-15");
      setNewProjectManagerId(viewerId);

      onProjectCreated(created.data.id);
      handleClose();
    } catch (error: unknown) {
      setFormError(
        extractErrorMessage(error, "Không thể tạo dự án. Vui lòng thử lại."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }


  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={handleClose}>
      <div
        className={styles.modalSurface}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id="add-project-title">Tạo dự án mới</h2>
          <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Đóng popup">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleCreateProject} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div className={styles.modalBody}>
            <div className={styles.formGrid}>
              <div className={styles.inputGroup}>
                <label>Tên dự án</label>
                <input
                  className={styles.inputControl}
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Nhập tên dự án..."
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Phòng ban phụ trách</label>
                <select
                  className={styles.inputControl}
                  value={newProjectDepartmentId}
                  onChange={(event) => setNewProjectDepartmentId(event.target.value)}
                  required
                  disabled={!canSelectDepartment}
                >
                  <option value="" disabled>-- Chọn phòng ban --</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
                {!canSelectDepartment && (
                  <p style={{ fontSize: "0.8rem", color: "var(--foreground-muted)", marginTop: "4px" }}>
                    Dự án mặc định thuộc phòng ban của bạn.
                  </p>
                )}
              </div>
              <div className={styles.inputGroup}>
                <label>Người quản lý</label>
                <select
                  className={styles.inputControl}
                  value={newProjectManagerId}
                  onChange={(event) => setNewProjectManagerId(event.target.value)}
                  required
                  disabled={filteredManagers.length === 0}
                >
                  {filteredManagers.length === 0 && <option value="">Không có Manager nào trong phòng ban này</option>}
                  {filteredManagers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {roleLabel(user.role)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${styles.inputGroup}`}>
                <label>Phương pháp quản lý</label>
                <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="projectType"
                      value="agile"
                      checked={newProjectType === "agile"}
                      onChange={() => setNewProjectType("agile")}
                      style={{ margin: 0 }}
                    />
                    Agile (Kanban)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="projectType"
                      value="waterfall"
                      checked={newProjectType === "waterfall"}
                      onChange={() => setNewProjectType("waterfall")}
                      style={{ margin: 0 }}
                    />
                    Waterfall
                  </label>
                </div>
              </div>

              <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
                <label>Mô tả chi tiết</label>
                <textarea
                  className={styles.inputControl}
                  value={newProjectDescription}
                  onChange={(event) => setNewProjectDescription(event.target.value)}
                  placeholder="Mô tả mục tiêu và phạm vi của dự án..."
                  required
                  rows={4}
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Ngày bắt đầu</label>
                <input
                  className={styles.inputControl}
                  type="date"
                  value={newProjectStart}
                  onChange={(event) => setNewProjectStart(event.target.value)}
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Ngày kết thúc dự kiến</label>
                <input
                  className={styles.inputControl}
                  type="date"
                  value={newProjectEnd}
                  onChange={(event) => setNewProjectEnd(event.target.value)}
                  required
                />
              </div>
            </div>
            {formError ? <p className={styles.errorMessage}>{formError}</p> : null}
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={handleClose}>
              Hủy
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
              {isSubmitting ? "Đang tạo..." : "Tạo dự án"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
