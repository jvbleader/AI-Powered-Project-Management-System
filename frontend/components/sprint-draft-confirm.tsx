"use client";

import { useState } from "react";
import { aiApi } from "@/services/api";
import { getStoredDraftStatus, isPersistedMessageId, setStoredDraftStatus } from "@/lib/assistant-storage";

type SprintDraft = {
  name: string;
  start_date: string;
  end_date: string;
  goal?: string;
  project_id?: number | string;
  project_name?: string;
};

export function SprintDraftConfirm({
  draft,
  projectId,
  messageId,
  initialStatus = "pending",
  onDraftResolved,
}: {
  draft: string;
  projectId?: string | null;
  messageId?: string;
  initialStatus?: "pending" | "confirmed" | "rejected";
  onDraftResolved?: (messageId: string, status: "confirmed" | "rejected") => void;
}) {
  const persistedStatus = messageId ? getStoredDraftStatus(messageId) : null;
  const resolvedInitialStatus =
    initialStatus !== "pending"
      ? initialStatus
      : persistedStatus === "confirmed" || persistedStatus === "rejected"
        ? persistedStatus
        : "pending";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(resolvedInitialStatus === "confirmed");
  const [isRejected, setIsRejected] = useState(resolvedInitialStatus === "rejected");
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingSprint, setEditingSprint] = useState<SprintDraft | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const [sprintsData, setSprintsData] = useState<SprintDraft[]>(() => {
    try {
      const data = JSON.parse(draft);
      return Array.isArray(data) ? data : [data];
    } catch {
      return [];
    }
  });

  const hasPersistedMessage = isPersistedMessageId(messageId);

  if (sprintsData.length === 0) {
    try {
      JSON.parse(draft);
    } catch {
      return (
        <div style={{ margin: "16px 0", display: "flex", alignItems: "center", gap: "12px", padding: "16px", borderRadius: "12px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontFamily: "sans-serif", fontSize: "14px" }}>
          <svg style={{ animation: "spin 1s linear infinite" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          Đang xử lý thông tin Sprint...
        </div>
      );
    }
    return null;
  }

  const markResolved = (status: "confirmed" | "rejected") => {
    if (!messageId) return;
    setStoredDraftStatus(messageId, status);
    onDraftResolved?.(messageId, status);
  };

  const openEditor = (sprint: SprintDraft, index: number) => {
    setEditingIndex(index);
    setEditingSprint({ ...sprint });
    setError(null);
  };

  const handleSaveSprint = async () => {
    if (editingIndex === null || !editingSprint || !messageId || !hasPersistedMessage) return;
    if (!editingSprint.name.trim() || !editingSprint.start_date || !editingSprint.end_date) {
      setError("Sprint phải có tên, ngày bắt đầu và ngày kết thúc.");
      return;
    }
    if (editingSprint.end_date < editingSprint.start_date) {
      setError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
      return;
    }
    try {
      setIsSavingDraft(true);
      setError(null);
      const nextSprints = sprintsData.map((sprint, index) =>
        index === editingIndex
          ? { ...editingSprint, name: editingSprint.name.trim() }
          : sprint
      );
      const response = await aiApi.updateDraft(
        Number(messageId),
        "json_sprint_draft",
        nextSprints,
      );
      setSprintsData(response.payload as SprintDraft[]);
      setEditingIndex(null);
      setEditingSprint(null);
    } catch (e: any) {
      setError(e.message || "Không thể lưu thay đổi bản nháp Sprint.");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleConfirm = async () => {
    if (!hasPersistedMessage || !messageId) {
      setError("Bản nháp chưa được lưu. Vui lòng đợi tin nhắn lưu xong rồi xác nhận lại.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await aiApi.confirmSprints(
        Number(messageId),
        projectId ? Number(projectId) : null
      );
      setIsSuccess(true);
      markResolved("confirmed");
    } catch (e: any) {
      setError(e.message || "Có lỗi xảy ra khi tạo Sprint.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!hasPersistedMessage || !messageId) {
      setError("Bản nháp chưa được lưu. Vui lòng đợi tin nhắn lưu xong rồi thử lại.");
      return;
    }
    try {
      setIsSubmitting(true);
      await aiApi.rejectDraft(Number(messageId), "json_sprint_draft");
      setIsRejected(true);
      markResolved("rejected");
    } catch (e: any) {
      setError(e.message || "Không thể từ chối bản nháp.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: "16px", borderRadius: "12px", border: "1px solid #bbf7d0", backgroundColor: "#f0fdf4", padding: "20px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: "40px", width: "40px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: "#dcfce7", border: "1px solid #86efac", color: "#16a34a" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#166534", letterSpacing: "0.025em", whiteSpace: "normal", wordWrap: "break-word" }}>Tạo thành công {sprintsData.length} Sprint</h4>
          <p style={{ margin: 0, fontSize: "12px", color: "#15803d", whiteSpace: "normal", wordWrap: "break-word", lineHeight: 1.5 }}>Sprint đã được ghi nhận vào hệ thống theo đúng bản nháp.</p>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: "16px", borderRadius: "12px", border: "1px solid #fecaca", backgroundColor: "#fef2f2", padding: "20px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: "40px", width: "40px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#991b1b", letterSpacing: "0.025em", whiteSpace: "normal", wordWrap: "break-word" }}>Bản nháp Sprint đã bị hủy</h4>
          <p style={{ margin: 0, fontSize: "12px", color: "#b91c1c", whiteSpace: "normal", wordWrap: "break-word", lineHeight: 1.5 }}>Bạn đã từ chối bản nháp này.</p>
        </div>
      </div>
    );
  }

  const actionsDisabled = isSubmitting || isSavingDraft || !hasPersistedMessage;

  return (
    <div style={{ margin: "16px 0", borderRadius: "16px", border: "1px solid #e2e8f0", backgroundColor: "#ffffff", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div style={{ backgroundColor: "#f8fafc", padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#3b82f6" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            Bản nháp: Sắp tạo {sprintsData.length} Sprint
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>Thông tin dưới đây lấy nguyên từ bản nháp AI. Xác nhận sẽ tạo sprint đúng theo draft.</p>
        </div>
      </div>

      {error && (
        <div style={{ margin: "16px", padding: "12px 16px", backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: "8px", fontSize: "13px", border: "1px solid #fecaca", display: "flex", gap: "8px", alignItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          {error}
        </div>
      )}

      <div style={{ padding: "16px 20px", maxHeight: "520px", overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {sprintsData.map((sprint, idx) => (
            <div
              key={idx}
              onClick={() => hasPersistedMessage && openEditor(sprint, idx)}
              style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "12px", backgroundColor: "#f8fafc", cursor: hasPersistedMessage ? "pointer" : "default" }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b", flexShrink: 0, marginTop: "2px" }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "#334155", lineHeight: 1.45, whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  {sprint.name?.trim() || "Chưa có tên sprint"}
                </span>
              </div>
              <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#475569" }}>
                <strong>Thời gian:</strong> {sprint.start_date} – {sprint.end_date}
              </p>
              {sprint.project_name ? (
                <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#475569" }}>
                  <strong>Dự án:</strong> {sprint.project_name}
                </p>
              ) : null}
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>
                <strong>Mục tiêu:</strong> {sprint.goal || "Chưa có mục tiêu"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {!hasPersistedMessage && (
        <div style={{ margin: "0 20px 12px", fontSize: "13px", color: "#1d4ed8", backgroundColor: "#eff6ff", padding: "12px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
          Đang lưu bản nháp vào hội thoại. Nút xác nhận sẽ mở sau khi lưu xong.
        </div>
      )}

      <div style={{ padding: "16px 20px", backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
        <button
          onClick={handleReject}
          disabled={actionsDisabled}
          style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontSize: "14px", fontWeight: 500, cursor: actionsDisabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s", opacity: actionsDisabled ? 0.7 : 1 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          Từ chối
        </button>
        <button
          onClick={handleConfirm}
          disabled={actionsDisabled}
          style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: "#2563eb", color: "#ffffff", fontSize: "14px", fontWeight: 500, cursor: actionsDisabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s", opacity: actionsDisabled ? 0.7 : 1 }}
        >
          {isSubmitting ? (
            <svg style={{ animation: "spin 1s linear infinite" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          )}
          {isSubmitting ? "Đang tạo..." : "Xác nhận tạo Sprint"}
        </button>
      </div>

      {editingIndex !== null && editingSprint && (
        <div
          onClick={() => {
            if (!isSavingDraft) {
              setEditingIndex(null);
              setEditingSprint(null);
            }
          }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(15, 23, 42, 0.55)" }}
        >
          <div onClick={(event) => event.stopPropagation()} style={{ width: "min(640px, 100%)", maxHeight: "90vh", overflowY: "auto", borderRadius: 16, background: "#fff", boxShadow: "0 24px 60px rgba(15, 23, 42, 0.25)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>Chỉnh sửa Sprint trong bản nháp</h3>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>Dự án được giữ nguyên; các thông tin còn lại sẽ được lưu vào draft trước khi tạo.</p>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Tên Sprint</span>
                <input value={editingSprint.name} onChange={(e) => setEditingSprint({ ...editingSprint, name: e.target.value })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Ngày bắt đầu</span>
                  <input type="date" value={editingSprint.start_date} onChange={(e) => setEditingSprint({ ...editingSprint, start_date: e.target.value })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Ngày kết thúc</span>
                  <input type="date" value={editingSprint.end_date} onChange={(e) => setEditingSprint({ ...editingSprint, end_date: e.target.value })} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                </label>
              </div>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Mục tiêu</span>
                <textarea value={editingSprint.goal || ""} onChange={(e) => setEditingSprint({ ...editingSprint, goal: e.target.value })} rows={12} style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, resize: "vertical", fontFamily: "inherit" }} />
              </label>
            </div>
            <div style={{ padding: "16px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <button type="button" disabled={isSavingDraft} onClick={() => { setEditingIndex(null); setEditingSprint(null); }} style={{ padding: "9px 16px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>Hủy</button>
              <button type="button" disabled={isSavingDraft} onClick={handleSaveSprint} style={{ padding: "9px 16px", border: 0, borderRadius: 8, background: "#2563eb", color: "#fff" }}>{isSavingDraft ? "Đang lưu..." : "Lưu vào bản nháp"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
