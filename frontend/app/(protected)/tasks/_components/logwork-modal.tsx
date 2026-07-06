import { useState, type FormEvent } from "react";
import styles from "../../team/styles/team.module.css";
import { logworkApi } from "@/services/api";

interface LogworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  userId: string;
}

export function LogworkModal({ isOpen, onClose, taskId, userId }: LogworkModalProps) {
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleLogwork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const hoursVal = parseFloat(hours);
    if (isNaN(hoursVal) || hoursVal <= 0) {
      setFormError("Số giờ log không hợp lệ.");
      return;
    }

    if (!description.trim()) {
      setFormError("Vui lòng nhập mô tả công việc.");
      return;
    }

    await logworkApi.create({
      taskId,
      userId,
      date,
      hours: hoursVal,
      note: description.trim(),
      mood: "smooth",
    });

    setHours("");
    setDescription("");
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`password-modal ${styles.addModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logwork-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="password-modal-header">
          <h2 id="logwork-title">Logwork</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Đóng popup">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form className="surface-form" onSubmit={handleLogwork}>
          <div className="form-grid">
            <label>
              <span>Số giờ (h)</span>
              <input type="number" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} required />
            </label>
            <label>
              <span>Ngày thực hiện</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label className="form-grid-span">
              <span>Mô tả công việc đã làm</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                rows={3}
              />
            </label>
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="primary-button">
              Lưu Logwork
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
