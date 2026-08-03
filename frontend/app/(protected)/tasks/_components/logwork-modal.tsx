import { useState, type FormEvent } from "react";
import { toVietnamDateInputValue } from "@/lib/utils/format";
import { taskApi } from "@/services/api";
import styles from "../../projects/_components/create-project-modal.module.css";

interface LogworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  userId: string;
  onSuccess?: () => void | Promise<void>;
}

export function LogworkModal({
  isOpen,
  onClose,
  taskId,
  userId,
  onSuccess,
}: LogworkModalProps) {
  void userId;
  const [hours, setHours] = useState("0");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(toVietnamDateInputValue());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setFormError(null);
    onClose();
  };

  if (!isOpen) return null;

  async function handleLogwork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const hoursVal = parseFloat(hours);
    if (isNaN(hoursVal)) {
      setFormError("Số giờ log không hợp lệ.");
      return;
    }

    if (hoursVal < 0) {
      setFormError("Số giờ logwork không được âm.");
      return;
    }

    if (!description.trim()) {
      setFormError("Vui lòng nhập mô tả công việc.");
      return;
    }

    setIsSubmitting(true);
    try {
      await taskApi.addLogwork(taskId, {
        workDate: date,
        hoursSpent: hoursVal,
        workContent: description.trim(),
        progressPercent: 0,
      });

      if (onSuccess) {
        await onSuccess();
      }

      setHours("0");
      setDescription("");
      handleClose();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu logwork.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={handleClose}>
      <section
        className={styles.modalSurface}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logwork-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: "600px", display: "flex", flexDirection: "column" }}
      >
        <div className={styles.modalHeader}>
          <div style={{ flex: 1 }}>
            <h2 id="logwork-title" style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Logwork</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Đóng popup"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <form onSubmit={handleLogwork} style={{ display: "flex", flexDirection: "column" }}>
          <div className={styles.modalBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "0.5rem" }}>
              <div className={styles.inputGroup}>
                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>Số giờ</label>
                <input
                  className={styles.inputControl}
                  type="number"
                  min="0"
                  step="0.5"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                  placeholder="Ví dụ: 2.5"
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>Ngày thực hiện</label>
                <input
                  className={styles.inputControl}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className={styles.inputGroup} style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>Mô tả công việc đã làm</label>
                <textarea
                  className={styles.inputControl}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isSubmitting}
                  required
                  rows={4}
                  style={{ minHeight: "120px", resize: "vertical" }}
                  placeholder="Nêu ngắn gọn phần việc đã hoàn thành, kết quả và ghi chú cần bàn giao..."
                />
              </div>
            </div>

            {formError && <p style={{ color: "var(--critical)", fontSize: "0.875rem", marginTop: "1rem" }}>{formError}</p>}
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={handleClose} disabled={isSubmitting}>
              Hủy
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
              Lưu Logwork
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
