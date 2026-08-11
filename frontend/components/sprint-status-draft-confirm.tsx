"use client";

import { useMemo, useState } from "react";

import { aiApi } from "@/services/api";

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
}: {
  draft: string;
  messageId?: string;
  initialStatus?: "pending" | "confirmed" | "rejected";
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(initialStatus === "confirmed");
  const [isRejected, setIsRejected] = useState(initialStatus === "rejected");
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<SprintStatusDraft[]>(() => {
    try {
      const data = JSON.parse(draft);
      return Array.isArray(data) ? data : [data];
    } catch {
      return [];
    }
  });

  const canConfirm = useMemo(() => items.length > 0 && items.every((i) => i.sprint_id && i.status), [items]);

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

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await aiApi.confirmSprintStatus(
        items.map((item) => ({
          sprint_id: Number(item.sprint_id),
          status: String(item.status).toLowerCase(),
        })),
        messageId && !messageId.startsWith("assistant-") ? Number(messageId) : null
      );
      setIsSuccess(true);
      if (messageId && !messageId.startsWith("assistant-")) {
        const editedDraft = JSON.stringify(items, null, 2);
        await aiApi
          .updateMessage(messageId, "```json_sprint_status_draft_confirmed\n" + editedDraft + "\n```")
          .catch(console.error);
      }
    } catch (e: any) {
      setError(e?.message || "Không thể cập nhật trạng thái Sprint.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsRejected(true);
    if (messageId && !messageId.startsWith("assistant-")) {
      const editedDraft = JSON.stringify(items, null, 2);
      await aiApi
        .updateMessage(messageId, "```json_sprint_status_draft_rejected\n" + editedDraft + "\n```")
        .catch(console.error);
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

  return (
    <div style={{ margin: "16px 0", borderRadius: "16px", border: "1px solid #e2e8f0", backgroundColor: "#fff", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
          Xác nhận đổi trạng thái Sprint
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
          AI chỉ đề xuất — chưa ghi database cho đến khi bạn xác nhận.
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
              {item.name || `Sprint #${item.sprint_id}`}
            </div>
            <div style={{ marginTop: 6, fontSize: "13px", color: "#475569" }}>
              {item.current_status || "?"} →{" "}
              <select
                value={item.status}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...item, status: e.target.value };
                  setItems(next);
                }}
                style={{ marginLeft: 4, padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
              >
                <option value="planning">planning</option>
                <option value="active">active</option>
                <option value="closed">closed</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, backgroundColor: "#f8fafc" }}>
        <button type="button" onClick={handleReject} disabled={isSubmitting} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}>
          Từ chối
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || !canConfirm}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", opacity: isSubmitting || !canConfirm ? 0.7 : 1 }}
        >
          {isSubmitting ? "Đang cập nhật..." : "Xác nhận cập nhật"}
        </button>
      </div>
    </div>
  );
}
