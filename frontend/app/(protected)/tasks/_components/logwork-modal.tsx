import { useState, type FormEvent } from "react";
import { toVietnamDateInputValue } from "@/lib/utils/format";
import { taskApi } from "@/services/api";

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
    <div className="modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <section
        className="app-modal modal-shell-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logwork-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="app-modal-header">
          <div>
            <span className="eyebrow">Nhật ký công việc</span>
            <h2 id="logwork-title">Logwork</h2>
            <p>Ghi nhận số giờ đã làm và mô tả ngắn gọn đầu việc vừa hoàn thành.</p>
          </div>
          <button type="button" className="icon-button" onClick={handleClose} aria-label="Đóng popup">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form className="app-modal-body surface-form" onSubmit={handleLogwork}>
          <div className="app-modal-section">
            <div className="form-grid">
              <label>
                <span>Số giờ (h)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                  placeholder="Ví dụ: 2.5"
                  disabled={isSubmitting}
                  required
                />
              </label>
              <label>
                <span>Ngày thực hiện</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </label>
              <label className="form-grid-span">
                <span>Mô tả công việc đã làm</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isSubmitting}
                  required
                  rows={4}
                  placeholder="Nêu ngắn gọn phần việc đã hoàn thành, kết quả và ghi chú cần bàn giao..."
                />
              </label>
            </div>
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="app-modal-footer">
            <button type="button" className="secondary-button" onClick={handleClose} disabled={isSubmitting}>
              Hủy
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              Lưu Logwork
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
