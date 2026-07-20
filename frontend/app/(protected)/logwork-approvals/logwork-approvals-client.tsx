"use client";

import { useEffect, useState } from "react";
import { logworkApi, type PendingLogWork } from "@/services/api/logworks";
import { useAuthSession } from "@/hooks/use-session";
import { StatusPill } from "@/components/ui";

export function LogworkApprovalsClient() {
  const session = useAuthSession();
  const [logworks, setLogworks] = useState<PendingLogWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchLogworks = async () => {
    try {
      const data = await logworkApi.getPending();
      setLogworks(data);
    } catch (err) {
      console.error("Failed to fetch pending logworks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogworks();
  }, [session]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await logworkApi.approve(id);
      setLogworks(prev => prev.filter(lw => lw.id !== id));
    } catch (err: any) {
      alert(err.message || "Lỗi khi duyệt logwork");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    setActionLoading(id);
    try {
      await logworkApi.reject(id);
      setLogworks(prev => prev.filter(lw => lw.id !== id));
    } catch (err: any) {
      alert(err.message || "Lỗi khi từ chối logwork");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div>Đang tải dữ liệu...</div>;
  }

  if (logworks.length === 0) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
        <h3 style={{ margin: "0 0 1rem", color: "var(--ink)" }}>Không có yêu cầu duyệt log work nào</h3>
        <p style={{ color: "var(--ink-light)", margin: 0 }}>Tất cả các báo cáo thời gian đã được xem xét.</p>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-sunken)" }}>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Nhân sự</th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Dự án</th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Ngày làm việc</th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Số giờ (T.độ)</th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Nội dung</th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {logworks.map(lw => (
            <tr key={lw.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td style={{ padding: "1rem" }}>
                <div style={{ fontWeight: 500, color: "var(--ink)" }}>{lw.user_name || "Unknown"}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-light)", marginTop: "0.25rem" }}>
                  <StatusPill label="Đang xét duyệt" tone="watch" />
                </div>
              </td>
              <td style={{ padding: "1rem", color: "var(--ink)", fontWeight: 500 }}>
                {lw.project_name || "Không xác định"}
              </td>
              <td style={{ padding: "1rem", color: "var(--ink-light)" }}>
                {new Date(lw.work_date).toLocaleDateString("vi-VN")}
              </td>
              <td style={{ padding: "1rem", color: "var(--ink)" }}>
                <strong>{lw.hours_spent}h</strong>
                <span style={{ color: "var(--ink-light)", marginLeft: "0.5rem", fontSize: "0.875rem" }}>({lw.progress_percent}%)</span>
              </td>
              <td style={{ padding: "1rem", color: "var(--ink)", maxWidth: "300px" }}>
                {lw.task_title && <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink-light)", marginBottom: "0.25rem" }}>{lw.task_title}</div>}
                <div style={{ fontWeight: 500 }}>{lw.work_content}</div>
                {lw.comment && <div style={{ fontSize: "0.875rem", color: "var(--ink-light)", marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>{lw.comment}</div>}
              </td>
              <td style={{ padding: "1rem", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => handleApprove(lw.id)}
                  disabled={actionLoading === lw.id}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    background: "#16a34a",
                    color: "white",
                    border: "none",
                    cursor: actionLoading === lw.id ? "not-allowed" : "pointer",
                    fontWeight: 500,
                    opacity: actionLoading === lw.id ? 0.7 : 1
                  }}
                >
                  Duyệt
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(lw.id)}
                  disabled={actionLoading === lw.id}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    background: "var(--surface)",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                    cursor: actionLoading === lw.id ? "not-allowed" : "pointer",
                    fontWeight: 500,
                    opacity: actionLoading === lw.id ? 0.7 : 1
                  }}
                >
                  Từ chối
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
