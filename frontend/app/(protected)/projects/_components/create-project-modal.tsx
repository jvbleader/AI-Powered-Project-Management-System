import { useState, useEffect, type FormEvent } from "react";
import type { UserProfile } from "@/types";
import { userApi } from "@/services/api";
import { projectApi } from "@/services/api";
import { CustomSelect } from "@/components/custom-select";
import { Department } from "@/types/user";
import styles from "./create-project-modal.module.css";
import { hasCompanywideProjectAccess, toVietnamDateInputValue } from "@/lib/utils/format";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  viewerId: string;
  viewerName: string;
  viewerRole: string;
  viewerDepartment: string | null;
  accessibleUsers: UserProfile[];
  onProjectCreated: (projectId: string) => void;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  viewerId,
  viewerName,
  viewerRole,
  viewerDepartment,
  accessibleUsers: _accessibleUsers,
  onProjectCreated,
}: CreateProjectModalProps) {
  const canSelectDepartment = hasCompanywideProjectAccess(viewerRole, viewerDepartment);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectStart, setNewProjectStart] = useState(() => toVietnamDateInputValue());
  const [newProjectEnd, setNewProjectEnd] = useState(() => toVietnamDateInputValue());
  const [newProjectType, setNewProjectType] = useState<"agile" | "waterfall">("agile");
  const [newProjectDepartmentId, setNewProjectDepartmentId] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const today = toVietnamDateInputValue();
    setNewProjectStart(today);
    setNewProjectEnd(today);
    setNewProjectName("");
    setNewProjectDescription("");
    setNewProjectType("agile");
    setFormError(null);

    userApi
      .getDepartments()
      .then((res) => {
        setDepartments(res.data);
        if (res.data.length === 0) return;

        if (!canSelectDepartment && viewerDepartment) {
          const userDept = res.data.find((d: Department) => d.name === viewerDepartment);
          if (userDept) {
            setNewProjectDepartmentId(String(userDept.id));
            return;
          }
        }

        setNewProjectDepartmentId((current) => current || String(res.data[0].id));
      })
      .catch(console.error);
  }, [isOpen, canSelectDepartment, viewerDepartment]);

  const extractErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const handleClose = () => {
    setFormError(null);
    onClose();
  };

  const handleInvalid = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    (event.target as HTMLInputElement | HTMLTextAreaElement).setCustomValidity("Vui lòng nhập đầy đủ thông tin trường này");
  };

  const handleInput = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    (event.target as HTMLInputElement | HTMLTextAreaElement).setCustomValidity("");
  };

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
      setFormError("Vui lòng nhập đầy đủ thông tin trường này");
      return;
    }

    if (newProjectEnd < newProjectStart) {
      setFormError("Ngày kết thúc dự kiến phải sau ngày bắt đầu.");
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await projectApi.create({
        name: newProjectName.trim(),
        project_type: newProjectType,
        description: newProjectDescription.trim(),
        start_date: newProjectStart,
        end_date: newProjectEnd,
        department_id: parseInt(newProjectDepartmentId, 10),
        // Server luôn gắn manager = người tạo; gửi viewerId để tương thích schema cũ.
        manager_id: parseInt(String(viewerId).replace("usr-", ""), 10),
      });

      setNewProjectName("");
      setNewProjectDescription("");
      setNewProjectStart("2026-07-01");
      setNewProjectEnd("2026-08-15");

      onProjectCreated(created.data.id);
      handleClose();
    } catch (error: unknown) {
      setFormError(extractErrorMessage(error, "Không thể tạo dự án. Vui lòng thử lại."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={handleClose}>
      <div
        className={styles.modalSurface}
        role="dialog"
        data-testid="create-project-modal"
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

        <form
          onSubmit={handleCreateProject}
          data-testid="create-project-form"
          style={{ display: "flex", flexDirection: "column", flex: 1 }}
        >
          <div className={styles.modalBody}>
            <div className={styles.formGrid}>
              <div className={styles.inputGroup}>
                <label>
                  Tên dự án<span className={styles.requiredStar}>*</span>
                </label>
                <input
                  data-testid="project-name"
                  className={styles.inputControl}
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  onInvalid={handleInvalid}
                  onInput={handleInput}
                  placeholder="Nhập tên dự án..."
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Phòng ban phụ trách</label>
                <CustomSelect
                  testId="project-department"
                  className={styles.inputControl}
                  value={newProjectDepartmentId}
                  onChange={(val) => setNewProjectDepartmentId(val)}
                  disabled={!canSelectDepartment}
                  options={[
                    { value: "", label: "-- Chọn phòng ban --" },
                    ...departments.map((dept) => ({ value: String(dept.id), label: dept.name })),
                  ]}
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Người quản lý</label>
                <input
                  data-testid="project-manager"
                  className={styles.inputControl}
                  value={viewerName}
                  disabled
                  readOnly
                />
              </div>
              <div className={`${styles.inputGroup}`}>
                <label>Phương pháp quản lý</label>
                <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      data-testid="project-type-agile"
                      type="radio"
                      name="projectType"
                      value="agile"
                      checked={newProjectType === "agile"}
                      onChange={() => setNewProjectType("agile")}
                      style={{ margin: 0 }}
                    />
                    Agile
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      data-testid="project-type-waterfall"
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
                <label>
                  Mô tả chi tiết<span className={styles.requiredStar}>*</span>
                </label>
                <textarea
                  data-testid="project-description"
                  className={styles.inputControl}
                  value={newProjectDescription}
                  onChange={(event) => setNewProjectDescription(event.target.value)}
                  onInvalid={handleInvalid}
                  onInput={handleInput}
                  placeholder="Mô tả mục tiêu và phạm vi của dự án..."
                  required
                  rows={8}
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Ngày bắt đầu</label>
                <input
                  data-testid="project-start-date"
                  className={styles.inputControl}
                  type="date"
                  value={newProjectStart}
                  onChange={(event) => setNewProjectStart(event.target.value)}
                  onInvalid={handleInvalid}
                  onInput={handleInput}
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Ngày kết thúc dự kiến</label>
                <input
                  data-testid="project-end-date"
                  className={styles.inputControl}
                  type="date"
                  value={newProjectEnd}
                  onChange={(event) => setNewProjectEnd(event.target.value)}
                  onInvalid={handleInvalid}
                  onInput={handleInput}
                  required
                />
              </div>
            </div>

            {formError ? <p className={styles.errorMessage}>{formError}</p> : null}
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={handleClose} disabled={isSubmitting}>
              Hủy
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={isSubmitting} data-testid="create-project-submit">
              {isSubmitting ? "Đang tạo..." : "Tạo dự án"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
