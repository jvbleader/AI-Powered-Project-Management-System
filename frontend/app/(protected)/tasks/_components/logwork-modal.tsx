import { useState, type FormEvent } from "react";
import { toVietnamDateInputValue } from "@/lib/utils/format";
import { taskApi } from "@/services/api";
import modalStyles from "../../projects/_components/create-project-modal.module.css";
import styles from "./logwork-modal.module.css";

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(toVietnamDateInputValue());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setFormError(null);
    setComment("");
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

    if (!title.trim()) {
      setFormError("Vui lòng nhập tên logwork.");
      return;
    }

    if (!description.trim()) {
      setFormError("Vui lòng nhập nội dung công việc.");
      return;
    }

    setIsSubmitting(true);
    try {
      await taskApi.addLogwork(taskId, {
        workDate: date,
        hoursSpent: hoursVal,
        title: title.trim(),
        workContent: description.trim(),
        comment: comment.trim() || null,
        progressPercent: 0,
      });

      if (onSuccess) {
        await onSuccess();
      }

      setHours("0");
      setTitle("");
      setDescription("");
      setComment("");
      handleClose();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu logwork.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={modalStyles.modalBackdrop} role="presentation" onMouseDown={handleClose}>
      <section
        className={`${modalStyles.modalSurface} ${styles.modalSurface}`}
        role="dialog"
        data-testid="logwork-modal"
        aria-modal="true"
        aria-labelledby="logwork-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`${modalStyles.modalHeader} ${styles.compactHeader}`}>
          <div style={{ flex: 1 }}>
            <h2 id="logwork-title" className={styles.modalTitle}>Logwork</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Đóng popup"
            className={styles.closeButton}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <form
          onSubmit={handleLogwork}
          data-testid="logwork-form"
          className={styles.form}
        >
          <div className={`${modalStyles.modalBody} ${styles.compactBody} ${styles.scrollBody}`}>
            <div className={styles.formGrid}>
              <div className={`${modalStyles.inputGroup} ${styles.inputGroup}`}>
                <label className={styles.fieldLabel}>Số giờ</label>
                <input
                  data-testid="logwork-hours"
                  className={`${modalStyles.inputControl} ${styles.compactInput}`}
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
              <div className={`${modalStyles.inputGroup} ${styles.inputGroup}`}>
                <label className={styles.fieldLabel}>Ngày thực hiện</label>
                <input
                  data-testid="logwork-date"
                  className={`${modalStyles.inputControl} ${styles.compactInput}`}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className={`${modalStyles.inputGroup} ${styles.inputGroup} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Tên logwork</label>
                <input
                  data-testid="logwork-title"
                  className={`${modalStyles.inputControl} ${styles.compactInput}`}
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isSubmitting}
                  required
                  maxLength={255}
                  placeholder="Ví dụ: Fix lỗi đăng nhập, họp sprint..."
                />
              </div>
              <div className={`${modalStyles.inputGroup} ${styles.inputGroup} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Nội dung công việc</label>
                <textarea
                  data-testid="logwork-description"
                  className={`${modalStyles.inputControl} ${styles.workContentInput}`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isSubmitting}
                  required
                  placeholder="Mô tả phần việc đã làm và kết quả đạt được..."
                />
              </div>
              <div className={`${modalStyles.inputGroup} ${styles.inputGroup} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Ghi chú (tuỳ chọn)</label>
                <textarea
                  data-testid="logwork-comment"
                  className={`${modalStyles.inputControl} ${styles.commentInput}`}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="Ghi chú bàn giao, rủi ro, hoặc thông tin cần người duyệt lưu ý..."
                />
              </div>
            </div>

            {formError ? <p className={styles.formError}>{formError}</p> : null}
          </div>

          <div className={`${modalStyles.modalFooter} ${styles.compactFooter} ${styles.stickyFooter}`}>
            <button
              type="button"
              className={`${modalStyles.btnSecondary} ${styles.compactButton}`}
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className={`${modalStyles.btnPrimary} ${styles.compactButton}`}
              disabled={isSubmitting}
              data-testid="logwork-submit"
            >
              Lưu Logwork
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
