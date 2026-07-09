import { useState } from "react";
import { taskApi } from "@/services/api";
import { UserProfile } from "@/types";

interface CreateTaskModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  users: UserProfile[];
}

export function CreateTaskModal({ projectId, isOpen, onClose, onSuccess, users }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);
    try {
      await taskApi.create({
        projectId,
        title,
        description,
        status: "TODO",
        priority,
        dueDate,
        estimateHours: estimatedHours ? parseFloat(estimatedHours) : 0,
        assigneeId,
        sprintId: null,
        spentHours: 0,
        progress: 0
      } as any);
      onSuccess();
      onClose();
    } catch (err: any) {
      alert("Lỗi tạo công việc: " + (err.message || "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }}>
      <div style={{
        background: "var(--surface)", padding: "2rem", borderRadius: "8px", width: "100%", maxWidth: "500px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
      }}>
        <h2 style={{ margin: "0 0 1.5rem 0" }}>Tạo Công việc mới</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Tiêu đề *</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              required
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Mô tả</label>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              rows={3}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)" }}
            />
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Mức độ ưu tiên</label>
              <select 
                value={priority} 
                onChange={e => setPriority(e.target.value as any)}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)" }}
              >
                <option value="LOW">Thấp (Low)</option>
                <option value="MEDIUM">Trung bình (Medium)</option>
                <option value="HIGH">Cao (High)</option>
                <option value="CRITICAL">Nghiêm trọng (Critical)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Hạn chót</label>
              <input 
                type="date" 
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Người thực hiện</label>
              <select 
                value={assigneeId} 
                onChange={e => setAssigneeId(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)" }}
              >
                <option value="">-- Chưa phân công --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Ước lượng (giờ)</label>
              <input 
                type="number" 
                min="0" step="0.5"
                value={estimatedHours} 
                onChange={e => setEstimatedHours(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
            <button type="button" onClick={onClose} className="secondary-button" disabled={isLoading}>
              Hủy
            </button>
            <button type="submit" className="primary-button" disabled={isLoading || !title.trim()}>
              {isLoading ? "Đang tạo..." : "Tạo mới"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
