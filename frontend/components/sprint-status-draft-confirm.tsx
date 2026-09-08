"use client";

import { useEffect, useMemo, useState } from "react";

import { aiApi } from "@/services/api";
import { isPersistedMessageId } from "@/lib/assistant-storage";

type SprintStatusDraft = {
  sprint_id: number | string;
  project_id?: number | string;
  name?: string;
  current_status?: string;
  status: string;
};

export function SprintStatusDraftConfirm({
  draft,
  messageId,
  initialStatus = "pending",
  onDraftResolved,
}: {
  draft: string;
  messageId?: string;
  initialStatus?: "pending" | "confirmed" | "rejected";
  onDraftResolved?: (messageId: string, status: "confirmed" | "rejected") => void;
}) {
  const persistedStatus = null;
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

  useEffect(() => {
    if (resolvedInitialStatus === "confirmed") {
      setIsSuccess(true);
      setIsRejected(false);
    } else if (resolvedInitialStatus === "rejected") {
      setIsRejected(true);
      setIsSuccess(false);
    } else if (resolvedInitialStatus === "pending") {
      setIsSuccess(false);
      setIsRejected(false);
    }
  }, [resolvedInitialStatus]);

  const items = useMemo<SprintStatusDraft[]>(() => {
    try {
      const data = JSON.parse(draft);
      return Array.isArray(data) ? data : [data];
    } catch {
      return [];
    }
  }, [draft]);

  const hasPersistedMessage = isPersistedMessageId(messageId);
  const canConfirm = items.length > 0 && items.every((item) => item.sprint_id && item.status);

  if (items.length === 0) {
    try {
      JSON.parse(draft);
    } catch {
      return (
        <div style={{ margin: "16px 0", padding: "16px", borderRadius: "12px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: "14px" }}>
          Đang xử lý đề xuất đổi trạng thái Sprint...
        </div>
      );
    }
    return null;
  }

  const markResolved = (status: "confirmed" | "rejected") => {
    if (!messageId) return;
    onDraftResolved?.(messageId, status);
  };

  const handleConfirm = async () => {
    if (!hasPersistedMessage || !messageId) {
      setError("Bản nháp chưa được lưu. Vui lòng đợi tin nhắn lưu xong rồi xác nhận lại.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await aiApi.confirmSprintStatus(Number(messageId));
      setIsSuccess(true);
      markResolved("confirmed");
    } catch (e: any) {
      setError(e?.message || "Không thể cập nhật trạng thái Sprint.");
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
      await aiApi.rejectDraft(Number(messageId));
      setIsRejected(true);
      markResolved("rejected");
    } catch (e: any) {
      setError(e?.message || "Không thể từ chối bản nháp.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div style={{ margin: "12px 0", padding: "16px", borderRadius: "12px", border: "1px solid #bbf7d0", backgroundColor: "#f0fdf4", color: "#166534", fontSize: "14px" }}>
        Đã cập nhật trạng thái {items.length} Sprint.
      </div>
    );
  }

  if (isRejected) {
    return (
      <div style={{ margin: "12px 0", padding: "16px", borderRadius: "12px", border: "1px solid #fecaca", backgroundColor: "#fef2f2", color: "#991b1b", fontSize: "14px" }}>
        Đã từ chối đề xuất đổi trạng thái Sprint.
      </div>
    );
  }

  const actionsDisabled = isSubmitting || !hasPersistedMessage || !canConfirm;

  return (
    <div style={{ margin: "16px 0", borderRadius: "16px", border: "1px solid #e2e8f0", backgroundColor: "#fff", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
          Xác nhận đổi trạng thái Sprint
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
          Hệ thống sẽ cập nhật đúng trạng thái trong bản nháp, không nhận chỉnh sửa tay.
        </p>
      </div>

      {error && (
        <div style={{ margin: "12px 16px", padding: "10px 12px", backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: "8px", fontSize: "13px" }}>
          {error}
        </div>
      )}

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
            <div style={{ fontWeight: 600, color: "#334155", fontSize: "14px" }}>
              {item.name?.trim() || "Chưa có tên sprint"}
            </div>
            <div style={{ marginTop: 6, fontSize: "13px", color: "#475569" }}>
              {item.current_status || "?"} → {item.status}
            </div>
          </div>
        ))}
      </div>

      {!hasPersistedMessage && (
        <div style={{ margin: "0 20px 12px", fontSize: "13px", color: "#1d4ed8", backgroundColor: "#eff6ff", padding: "12px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
          Đang lưu bản nháp vào hội thoại. Nút xác nhận sẽ mở sau khi lưu xong.
        </div>
      )}

      <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, backgroundColor: "#f8fafc" }}>
        <button type="button" onClick={handleReject} disabled={actionsDisabled} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: actionsDisabled ? "not-allowed" : "pointer", opacity: actionsDisabled ? 0.7 : 1 }}>
          Từ chối
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={actionsDisabled}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: actionsDisabled ? "not-allowed" : "pointer", opacity: actionsDisabled ? 0.7 : 1 }}
        >
          {isSubmitting ? "Đang cập nhật..." : "Xác nhận cập nhật"}
        </button>
      </div>
    </div>
  );
}
