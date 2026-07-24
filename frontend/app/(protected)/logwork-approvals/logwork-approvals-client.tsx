"use client";

import { useEffect, useState, useRef } from "react";
import { logworkApi, type PendingLogWork } from "@/services/api/logworks";
import { useAuthSession } from "@/hooks/use-session";
import { StatusPill } from "@/components/ui";
import { FilterSelect } from "@/components/filter-select";

export function LogworkApprovalsClient() {
  const session = useAuthSession();
  const [logworks, setLogworks] = useState<PendingLogWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const dateInputRef = useRef<HTMLInputElement>(null);

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
    
    const handleNewNotification = (e: any) => {
      if (e.detail?.type === "LOGWORK_SUBMITTED") {
        fetchLogworks();
      }
    };
    
    window.addEventListener('new_notification', handleNewNotification);
    return () => window.removeEventListener('new_notification', handleNewNotification);
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

  const filteredLogworks = logworks.filter(lw => {
    if (projectFilter && lw.project_name !== projectFilter) return false;
    if (dateFilter && lw.work_date !== dateFilter) return false;
    return true;
  });

  const uniqueProjects = Array.from(new Set(logworks.map(lw => lw.project_name).filter(Boolean)));

  return (
    <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-sunken)" }}>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Nhân sự</th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)", width: "25%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>Dự án</span>
                <div style={{ minWidth: "160px" }}>
                  <FilterSelect
                    value={projectFilter || ""}
                    onChange={(val) => setProjectFilter(val)}
                    options={[
                      { value: "", label: "Tất cả dự án" },
                      ...uniqueProjects.filter((proj): proj is string => Boolean(proj)).map((proj) => ({ value: proj, label: proj })),
                    ]}
                  />
                </div>
              </div>
            </th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)", width: "25%" }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.4rem", position: "relative" }}>
                <span>Ngày làm việc</span>
                <button 
                  type="button" 
                  onClick={() => dateInputRef.current?.showPicker()}
                  title="Lọc theo ngày"
                  style={{ width: "20px", height: "20px", background: dateFilter ? "var(--accent-soft)" : "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", transition: "background 0.2s" }}
                  onMouseEnter={(e) => { if (!dateFilter) e.currentTarget.style.background = "var(--surface)" }} 
                  onMouseLeave={(e) => { if (!dateFilter) e.currentTarget.style.background = "transparent" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: dateFilter ? "var(--accent)" : "var(--muted)" }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </button>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  style={{ position: "absolute", visibility: "hidden", bottom: 0 }}
                />
                {dateFilter && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", background: "var(--accent)", color: "#fff", padding: "2px 8px", borderRadius: "12px", fontWeight: 500, boxShadow: "0 2px 4px rgba(37,99,235,0.2)" }}>
                    {new Date(dateFilter).toLocaleDateString("vi-VN")}
                    <button type="button" onClick={() => setDateFilter("")} style={{ background: "transparent", border: "none", padding: 0, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", opacity: 0.8 }} title="Xóa bộ lọc">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </span>
                )}
              </div>
            </th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Số giờ (T.độ)</th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Nội dung</th>
            <th style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {filteredLogworks.length > 0 ? filteredLogworks.map(lw => (
            <tr key={lw.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td style={{ padding: "1rem" }}>
                <div style={{ fontWeight: 500, color: "var(--ink)" }}>{lw.user_name || "Unknown"}</div>
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
          )) : (
            <tr>
              <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--ink-light)" }}>
                Không tìm thấy logwork nào phù hợp với bộ lọc.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
