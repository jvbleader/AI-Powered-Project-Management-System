import { useState } from "react";
import { sprintApi } from "@/services/api";

interface CreateSprintModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const today = new Date().toISOString().split("T")[0];
// Tương lai 2 tuần
const twoWeeksLater = new Date();
twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
const defaultEnd = twoWeeksLater.toISOString().split("T")[0];

export function CreateSprintModal({
  projectId,
  projectName,
  isOpen,
  onClose,
  onSuccess,
}: CreateSprintModalProps) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!name.trim() || !startDate || !endDate) {
      setFormError("Vui lòng nhập tên, ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (endDate < startDate) {
      setFormError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
      return;
    }

    setIsLoading(true);
    try {
      await sprintApi.create(projectId, {
        name: name.trim(),
        goal: goal.trim(),
        status: "PLANNING",
        progress: 0,
        committedPoints: 0,
        completedPoints: 0,
        plannedStart: startDate,
        plannedEnd: endDate,
        health: "on_track",
        focusAreas: ["Goal alignment", "Task readiness", "Resource allocation"],
      } as any);

      // Xoá trắng
      setName("");
      setGoal("");
      setStartDate(today);
      setEndDate(defaultEnd);

      onSuccess();
    } catch (err: any) {
      setFormError(err.message || "Đã xảy ra lỗi khi tạo sprint.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1.5rem",
      }}
    >
      <section
        style={{
          background: "var(--surface)",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        <div
          style={{
            padding: "1.5rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "var(--ink)" }}>
              Tạo Sprint mới
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--ink-light)" }}>
              Thêm sprint cho dự án <strong>{projectName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--ink-light)",
              cursor: "pointer",
              padding: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem", overflowY: "auto" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Tên Sprint *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Sprint 1"
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
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Mục tiêu trọng tâm</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="VD: Hoàn thiện tính năng đăng nhập..."
              rows={3}
              style={{
                width: "100%",
                padding: "0.85rem 1rem",
                borderRadius: "14px",
                border: "1px solid var(--border)",
                background: "var(--surface-sunken)",
                color: "var(--foreground)",
                resize: "vertical"
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Ngày bắt đầu *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Ngày kết thúc *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
          </div>

          {formError && (
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
          )}

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
              disabled={isLoading || !name.trim() || !startDate || !endDate}
            >
              {isLoading ? "Đang tạo..." : "Tạo Sprint"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
