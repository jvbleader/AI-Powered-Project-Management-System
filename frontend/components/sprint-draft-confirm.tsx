"use client";

import { useState, useEffect, useMemo } from "react";
import { aiApi, sprintApi } from "@/services/api";

type SprintDraft = {
  name: string;
  start_date: string;
  end_date: string;
  goal?: string;
  project_id?: number | string;
};

export function SprintDraftConfirm({
  draft,
  projectId,
  messageId,
  initialStatus = "pending",
}: {
  draft: string;
  projectId?: string | null;
  messageId?: string;
  initialStatus?: "pending" | "confirmed" | "rejected";
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(initialStatus === "confirmed");
  const [isRejected, setIsRejected] = useState(initialStatus === "rejected");
  const [error, setError] = useState<string | null>(null);
  
  const [editingSprintIdx, setEditingSprintIdx] = useState<number | null>(null);
  const [editingSprint, setEditingSprint] = useState<SprintDraft | null>(null);
  
  const draftHash = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < draft.length; i++) {
      hash = ((hash << 5) - hash) + draft.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }, [draft]);
  
  const [sprintsData, setSprintsData] = useState<SprintDraft[]>(() => {
    try {
      const data = JSON.parse(draft);
      return Array.isArray(data) ? data : [data];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedEdits = localStorage.getItem(`sprint_draft_edits_${draftHash}`);
      if (savedEdits) {
        try {
          setSprintsData(JSON.parse(savedEdits));
        } catch(e) {}
      }
    }
  }, [draftHash]);

  const saveSprintsData = (newData: SprintDraft[]) => {
    setSprintsData(newData);
    if (typeof window !== "undefined") {
      localStorage.setItem(`sprint_draft_edits_${draftHash}`, JSON.stringify(newData));
    }
  };

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

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      for (const sprint of sprintsData) {
        const finalProjectId = projectId || sprint.project_id;
        if (!finalProjectId) {
          setError(`Lỗi: Không tìm thấy ID dự án cho sprint "${sprint.name}".`);
          setIsSubmitting(false);
          return;
        }
        
        await sprintApi.create(String(finalProjectId), {
          name: sprint.name,
          plannedStart: sprint.start_date,
          plannedEnd: sprint.end_date,
          goal: sprint.goal,
          status: "planning"
        } as any);
      }
      
      setIsSuccess(true);
      
      if (messageId && !messageId.startsWith("assistant-")) {
        const editedDraft = JSON.stringify(sprintsData, null, 2);
        const newMarkdown = "```json_sprint_draft_confirmed\n" + editedDraft + "\n```";
        await aiApi.updateMessage(messageId, newMarkdown).catch(console.error);
      }
      
      if (typeof window !== "undefined") {
        localStorage.removeItem(`sprint_draft_edits_${draftHash}`);
      }
    } catch (e: any) {
      setError(e.message || "Có lỗi xảy ra khi tạo Sprint.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsRejected(true);
    if (messageId && !messageId.startsWith("assistant-")) {
      const editedDraft = JSON.stringify(sprintsData, null, 2);
      const newMarkdown = "```json_sprint_draft_rejected\n" + editedDraft + "\n```";
      await aiApi.updateMessage(messageId, newMarkdown).catch(console.error);
    }
    
    if (typeof window !== "undefined") {
      localStorage.removeItem(`sprint_draft_edits_${draftHash}`);
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
          <p style={{ margin: 0, fontSize: "12px", color: "#15803d", whiteSpace: "normal", wordWrap: "break-word", lineHeight: 1.5 }}>Sprint đã được ghi nhận vào hệ thống.</p>
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

  return (
    <div style={{ margin: "16px 0", borderRadius: "16px", border: "1px solid #e2e8f0", backgroundColor: "#ffffff", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div style={{ backgroundColor: "#f8fafc", padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#3b82f6" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            Bản nháp: Sắp tạo {sprintsData.length} Sprint
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>Vui lòng xem xét các thông tin bên dưới trước khi xác nhận tạo.</p>
        </div>
      </div>
      
      {error && (
        <div style={{ margin: "16px", padding: "12px 16px", backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: "8px", fontSize: "13px", border: "1px solid #fecaca", display: "flex", gap: "8px", alignItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          {error}
        </div>
      )}

      <div style={{ padding: "16px 20px", maxHeight: "400px", overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {sprintsData.map((sprint, idx) => (
            <div 
              key={idx} 
              onClick={() => {
                setEditingSprintIdx(idx);
                setEditingSprint({ ...sprint });
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "#f1f5f9"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.05)"; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "#f8fafc"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              style={{ cursor: "pointer", padding: "16px", border: "1px solid #e2e8f0", borderRadius: "12px", backgroundColor: "#f8fafc", transition: "all 0.2s" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b" }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  {sprint.name || "Không có tên"}
                </span>
                <span style={{ fontSize: "12px", fontWeight: 500, backgroundColor: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "12px" }}>
                  {sprint.start_date} - {sprint.end_date}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>
                <strong>Mục tiêu:</strong> {sprint.goal || "Chưa có mục tiêu"}
              </p>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ padding: "16px 20px", backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
        <button
          onClick={handleReject}
          disabled={isSubmitting}
          style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontSize: "14px", fontWeight: 500, cursor: isSubmitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          Từ chối
        </button>
        <button
          onClick={handleConfirm}
          disabled={isSubmitting}
          style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: "#2563eb", color: "#ffffff", fontSize: "14px", fontWeight: 500, cursor: isSubmitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s", opacity: isSubmitting ? 0.7 : 1 }}
        >
          {isSubmitting ? (
            <svg style={{ animation: "spin 1s linear infinite" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          )}
          {isSubmitting ? "Đang tạo..." : "Xác nhận tạo Sprint"}
        </button>
      </div>

      {editingSprintIdx !== null && editingSprint && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: "sans-serif" }}>
          <div style={{ width: "100%", maxWidth: "600px", backgroundColor: "#fff", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Chỉnh sửa thông tin Sprint</div>
              
              <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Tên Sprint</span>
                <input 
                  value={editingSprint.name}
                  onChange={(e) => setEditingSprint({...editingSprint, name: e.target.value})}
                  style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", fontFamily: "inherit" }}
                />
              </label>

              <div style={{ display: "flex", gap: "16px" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Ngày bắt đầu</span>
                  <input 
                    type="date"
                    value={editingSprint.start_date}
                    onChange={(e) => setEditingSprint({...editingSprint, start_date: e.target.value})}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", fontFamily: "inherit" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Ngày kết thúc</span>
                  <input 
                    type="date"
                    value={editingSprint.end_date}
                    onChange={(e) => setEditingSprint({...editingSprint, end_date: e.target.value})}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", fontFamily: "inherit" }}
                  />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Mục tiêu</span>
                <textarea 
                  value={editingSprint.goal}
                  onChange={(e) => setEditingSprint({...editingSprint, goal: e.target.value})}
                  style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", minHeight: "100px", fontFamily: "inherit" }}
                />
              </label>
            </div>
            <div style={{ padding: "16px 20px", backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button 
                onClick={() => { setEditingSprintIdx(null); setEditingSprint(null); }}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
              >
                Hủy
              </button>
              <button 
                onClick={() => {
                  const newData = [...sprintsData];
                  newData[editingSprintIdx] = editingSprint;
                  saveSprintsData(newData);
                  setEditingSprintIdx(null);
                  setEditingSprint(null);
                }}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: "#2563eb", color: "#ffffff", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
