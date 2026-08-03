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
  
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <div style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border-subtle)", overflow: "visible", boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(248, 250, 252, 0.5)" }}>
            <th style={{ padding: "16px 24px", fontSize: "0.75rem", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", width: "18%", borderTopLeftRadius: "16px" }}>Nhân sự</th>
            <th style={{ padding: "16px 24px", fontSize: "0.75rem", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", width: "15%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", position: "relative" }}>
                <span>Dự án</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {projectFilter && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", background: "rgba(59, 130, 246, 0.08)", color: "var(--accent)", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(59, 130, 246, 0.2)", fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}>
                      {projectFilter}
                      <button type="button" onClick={() => setProjectFilter("")} style={{ background: "transparent", border: "none", padding: 0, color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", opacity: 0.6, transition: "opacity 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"} title="Xóa bộ lọc">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </span>
                  )}
                  <div 
                    style={{ width: "24px", height: "24px", background: projectFilter ? "rgba(59, 130, 246, 0.08)" : "transparent", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer", transition: "all 0.2s" }}
                    onMouseEnter={(e) => { if (!projectFilter) e.currentTarget.style.background = "var(--surface-sunken)" }} 
                    onMouseLeave={(e) => { if (!projectFilter) e.currentTarget.style.background = "transparent" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: projectFilter ? "var(--accent)" : "var(--muted)", pointerEvents: "none" }}>
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                    <div ref={projectDropdownRef} style={{ position: "absolute", top: "0", left: "0", width: "100%", height: "100%" }}>
                      <div
                        onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                        style={{ width: "100%", height: "100%", position: "absolute", zIndex: 1 }}
                      />
                      {projectDropdownOpen && (
                        <div style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          marginTop: "8px",
                          background: "#ffffff",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "12px",
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                          minWidth: "220px",
                          zIndex: 50,
                          padding: "6px",
                          textTransform: "none",
                          letterSpacing: "normal"
                        }}>
                          <div 
                            onClick={() => { setProjectFilter(""); setProjectDropdownOpen(false); }}
                            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: "6px", fontSize: "0.85rem", background: projectFilter === "" ? "rgba(59, 130, 246, 0.1)" : "transparent", color: projectFilter === "" ? "var(--accent)" : "var(--ink)", fontWeight: projectFilter === "" ? 600 : 500, display: "flex", alignItems: "center", gap: "8px" }}
                            onMouseEnter={(e) => { if (projectFilter !== "") e.currentTarget.style.background = "var(--surface-sunken)" }}
                            onMouseLeave={(e) => { if (projectFilter !== "") e.currentTarget.style.background = "transparent" }}
                          >
                            {projectFilter === "" ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> : <div style={{width: 14, height: 14}}></div>}
                            Tất cả
                          </div>
                          {uniqueProjects.filter((proj): proj is string => Boolean(proj)).map((proj) => (
                            <div
                              key={proj}
                              onClick={() => { setProjectFilter(proj); setProjectDropdownOpen(false); }}
                              style={{ padding: "8px 12px", cursor: "pointer", borderRadius: "6px", fontSize: "0.85rem", background: projectFilter === proj ? "rgba(59, 130, 246, 0.1)" : "transparent", color: projectFilter === proj ? "var(--accent)" : "var(--ink)", fontWeight: projectFilter === proj ? 600 : 500, marginTop: "2px", display: "flex", alignItems: "center", gap: "8px" }}
                              onMouseEnter={(e) => { if (projectFilter !== proj) e.currentTarget.style.background = "var(--surface-sunken)" }}
                              onMouseLeave={(e) => { if (projectFilter !== proj) e.currentTarget.style.background = "transparent" }}
                            >
                              {projectFilter === proj ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> : <div style={{width: 14, height: 14}}></div>}
                              {proj}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </th>
            <th style={{ padding: "16px 24px", fontSize: "0.75rem", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", width: "20%" }}>Task</th>
            <th style={{ padding: "16px 24px", fontSize: "0.75rem", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", width: "12%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", position: "relative" }}>
                <span>Ngày làm việc</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {dateFilter && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", background: "rgba(59, 130, 246, 0.08)", color: "var(--accent)", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(59, 130, 246, 0.2)", fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}>
                      {new Date(dateFilter).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                      <button type="button" onClick={() => setDateFilter("")} style={{ background: "transparent", border: "none", padding: 0, color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", opacity: 0.6, transition: "opacity 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"} title="Xóa bộ lọc">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </span>
                  )}
                  <button 
                    type="button" 
                    onClick={() => dateInputRef.current?.showPicker()}
                    style={{ width: "24px", height: "24px", background: dateFilter ? "rgba(59, 130, 246, 0.08)" : "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px", transition: "all 0.2s" }}
                    onMouseEnter={(e) => { if (!dateFilter) e.currentTarget.style.background = "var(--surface-sunken)" }} 
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
                    style={{ position: "absolute", visibility: "hidden", bottom: 0, right: 0 }}
                  />
                </div>
              </div>
            </th>
            <th style={{ padding: "16px 24px", fontSize: "0.75rem", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", width: "10%", whiteSpace: "nowrap" }}>Số giờ</th>
            <th style={{ padding: "16px 24px", fontSize: "0.75rem", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>Nội dung công việc</th>
            <th style={{ padding: "16px 24px", fontSize: "0.75rem", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", textAlign: "right", width: "140px", borderTopRightRadius: "16px" }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {filteredLogworks.length > 0 ? filteredLogworks.map(lw => (
            <tr key={lw.id} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)", transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(248, 250, 252, 0.6)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "16px 24px", verticalAlign: "top" }}>
                <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.95rem" }}>{lw.user_name || "Unknown"}</div>
              </td>
              <td style={{ padding: "20px 24px", verticalAlign: "top", color: "var(--ink-light)", fontSize: "0.9rem", fontWeight: 500 }}>
                {lw.project_name || "Không xác định"}
              </td>
              <td style={{ padding: "16px 24px", verticalAlign: "top", maxWidth: "250px" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--ink)", lineHeight: "1.4" }}>
                  {lw.task_title || "---"}
                </div>
              </td>
              <td style={{ padding: "20px 24px", color: "var(--text-secondary)", fontSize: "0.9rem", verticalAlign: "top", fontWeight: 500 }}>
                {new Date(lw.work_date).toLocaleDateString("vi-VN")}
              </td>
              <td style={{ padding: "20px 24px", verticalAlign: "top", fontSize: "0.9rem" }}>
                <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{lw.hours_spent}h</strong>
              </td>
              <td style={{ padding: "16px 24px", verticalAlign: "top", maxWidth: "300px" }}>
                <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>{lw.work_content}</div>
                {lw.comment && <div style={{ fontSize: "0.85rem", color: "var(--ink-light)", marginTop: "6px", fontStyle: "italic", borderLeft: "3px solid var(--border-subtle)", paddingLeft: "10px", background: "rgba(248, 250, 252, 0.5)", padding: "8px 12px", borderRadius: "0 6px 6px 0" }}>{lw.comment}</div>}
              </td>
              <td style={{ padding: "16px 24px", textAlign: "right", verticalAlign: "top" }}>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => handleApprove(lw.id)}
                    disabled={actionLoading === lw.id}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      background: "#10b981",
                      color: "white",
                      border: "1px solid #059669",
                      cursor: actionLoading === lw.id ? "not-allowed" : "pointer",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      opacity: actionLoading === lw.id ? 0.7 : 1,
                      whiteSpace: "nowrap"
                    }}
                  >
                    Duyệt
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(lw.id)}
                    disabled={actionLoading === lw.id}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      background: "white",
                      color: "#ef4444",
                      border: "1px solid #fca5a5",
                      cursor: actionLoading === lw.id ? "not-allowed" : "pointer",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      opacity: actionLoading === lw.id ? 0.7 : 1,
                      whiteSpace: "nowrap"
                    }}
                  >
                    Từ chối
                  </button>
                </div>
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
