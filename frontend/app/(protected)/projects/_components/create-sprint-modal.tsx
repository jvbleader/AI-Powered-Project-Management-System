import { useState, useEffect } from "react";
import { sprintApi } from "@/services/api";

import type { Sprint } from "@/types";

interface CreateSprintModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newSprintId?: string) => void;
  sprintToEdit?: Sprint | null;
  canManage?: boolean;
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
  sprintToEdit,
  canManage = false,
}: CreateSprintModalProps) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (sprintToEdit) {
        // The modal stays mounted, so opening a different sprint must hydrate its local form.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(sprintToEdit.name || "");
        setGoal(sprintToEdit.goal || "");
        setReviewNote(sprintToEdit.reviewNote || "");
        setStartDate(sprintToEdit.plannedStart || today);
        setEndDate(sprintToEdit.plannedEnd || defaultEnd);
      } else {
        setName("");
        setGoal("");
        setReviewNote("");
        setStartDate(today);
        setEndDate(defaultEnd);
      }
      setFormError(null);
    }
  }, [isOpen, sprintToEdit]);

  if (!isOpen) return null;

  const handleInvalid = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    (event.target as HTMLInputElement | HTMLTextAreaElement).setCustomValidity("Vui lòng nhập đầy đủ thông tin trường này");
  };

  const handleInput = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    (event.target as HTMLInputElement | HTMLTextAreaElement).setCustomValidity("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!canManage) {
      setFormError("Chỉ PM/PO/GM hoặc Leader của dự án này mới được tạo hoặc cập nhật sprint.");
      return;
    }

    if (!name.trim() || !goal.trim() || !startDate || !endDate) {
      setFormError("Vui lòng nhập đầy đủ thông tin trường này");
      return;
    }

    if (endDate < startDate) {
      setFormError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
      return;
    }

    setIsLoading(true);
    try {
      if (sprintToEdit) {
        await sprintApi.update(sprintToEdit.id, {
          name: name.trim(),
          goal: goal.trim(),
          reviewNote: reviewNote.trim(),
          plannedStart: startDate,
          plannedEnd: endDate,
        });
      } else {
        const response = await sprintApi.create(projectId, {
          name: name.trim(),
          goal: goal.trim(),
          reviewNote: reviewNote.trim(),
          status: "PLANNED",
          progress: 0,
          committedPoints: 0,
          completedPoints: 0,
          plannedStart: startDate,
          plannedEnd: endDate,
          health: "on-track",
          focusAreas: ["Goal alignment", "Task readiness", "Resource allocation"],
        });
        
        // Xoá trắng
        setName("");
        setGoal("");
        setReviewNote("");
        setStartDate(today);
        setEndDate(defaultEnd);

        onSuccess(String(response.data.id));
        return;
      }

      // Xoá trắng
      setName("");
      setGoal("");
      setReviewNote("");
      setStartDate(today);
      setEndDate(defaultEnd);

      onSuccess(sprintToEdit ? String(sprintToEdit.id) : undefined);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo sprint.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem"
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-sprint-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          width: "100%",
          maxWidth: "540px",
          borderRadius: "20px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh"
        }}
      >
        <div style={{
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.9))"
        }}>
          <div>
            <h2 id="create-sprint-title" style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0f172a", margin: 0 }}>
              {sprintToEdit ? "Chỉnh sửa Sprint" : "Tạo Sprint mới"}
            </h2>
            <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
              {projectName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng popup"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "#64748b",
              borderRadius: "50%",
              display: "flex"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          data-testid="create-sprint-form"
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem", overflowY: "auto" }}
        >
          <div>
            <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.9rem", fontWeight: 500, color: "#334155" }}>
              Tên Sprint <span style={{ color: "#ef4444", marginLeft: "3px", fontWeight: 700 }}>*</span>
            </label>
            <input
              data-testid="sprint-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onInvalid={handleInvalid}
              onInput={handleInput}
              placeholder="VD: Sprint 1"
              required
              maxLength={255}
              disabled={!!sprintToEdit && !canManage}
              style={{
                width: "100%",
                padding: "0.85rem 1rem",
                borderRadius: "14px",
                border: "1px solid rgba(148, 163, 184, 0.28)",
                background: "rgba(248, 250, 252, 0.98)",
                color: "var(--ink)",
                fontSize: "0.95rem",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.9rem", fontWeight: 500, color: "#334155" }}>
              Mục tiêu trọng tâm <span style={{ color: "#ef4444", marginLeft: "3px", fontWeight: 700 }}>*</span>
            </label>
            <textarea
              data-testid="sprint-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="VD: Hoàn thiện tính năng đăng nhập..."
              rows={3}
              required
              onInvalid={handleInvalid}
              onInput={handleInput}
              disabled={!!sprintToEdit && !canManage}
              style={{
                width: "100%",
                padding: "0.85rem 1rem",
                borderRadius: "14px",
                border: "1px solid rgba(148, 163, 184, 0.28)",
                background: "rgba(248, 250, 252, 0.98)",
                color: "var(--ink)",
                fontSize: "0.95rem",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s",
                resize: "vertical"
              }}
            />
          </div>

          {sprintToEdit && (
            <div>
              <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.9rem", fontWeight: 500, color: "#334155" }}>
                Ghi chú review
              </label>
              <textarea
                data-testid="sprint-review-note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Kết quả review, bài học và việc cần chuyển tiếp..."
                rows={3}
                disabled={!canManage}
                style={{
                  width: "100%",
                  padding: "0.85rem 1rem",
                  borderRadius: "14px",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  background: "rgba(248, 250, 252, 0.98)",
                  color: "var(--ink)",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.9rem", fontWeight: 500, color: "#334155" }}>
                Ngày bắt đầu
              </label>
              <input
                data-testid="sprint-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onInvalid={handleInvalid}
                onInput={handleInput}
                required
                disabled={!!sprintToEdit && !canManage}
                style={{
                  width: "100%",
                  padding: "0.85rem 1rem",
                  borderRadius: "14px",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  background: "rgba(248, 250, 252, 0.98)",
                  color: "var(--ink)",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                  outline: "none",
                  transition: "border-color 0.2s"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.9rem", fontWeight: 500, color: "#334155" }}>
                Ngày kết thúc
              </label>
              <input
                data-testid="sprint-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onInvalid={handleInvalid}
                onInput={handleInput}
                required
                disabled={!!sprintToEdit && !canManage}
                style={{
                  width: "100%",
                  padding: "0.85rem 1rem",
                  borderRadius: "14px",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  background: "rgba(248, 250, 252, 0.98)",
                  color: "var(--ink)",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                  outline: "none",
                  transition: "border-color 0.2s"
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
              Đóng
            </button>
            {canManage && (
              <button
                type="submit"
                data-testid="create-sprint-submit"
                className="primary-button"
                disabled={isLoading || !name.trim() || !goal.trim() || !startDate || !endDate}
              >
                {isLoading ? "Đang lưu..." : sprintToEdit ? "Cập nhật Sprint" : "Tạo Sprint"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
