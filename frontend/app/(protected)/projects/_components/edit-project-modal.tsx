import { useState, useEffect, type FormEvent } from "react";
import { roleLabel, projectRoleLabel } from "@/lib/utils/format";
import type { UserProfile, Project } from "@/types";
import { projectApi } from "@/services/api";
import styles from "./create-project-modal.module.css";

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  viewerId: string;
  viewerRole: string;
  accessibleUsers: UserProfile[];
  onProjectUpdated: () => void;
}

export function EditProjectModal({
  isOpen,
  onClose,
  project,
  viewerId,
  viewerRole,
  accessibleUsers,
  onProjectUpdated,
}: EditProjectModalProps) {
  const [activeTab, setActiveTab] = useState<"INFO" | "MEMBERS">("INFO");
  
  // Info State
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [formError, setFormError] = useState<string | null>(null);

  // Members State
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [newMemberId, setNewMemberId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("2");
  const [membersError, setMembersError] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  useEffect(() => {
    if (isOpen && project) {
      setEditName(project.name || "");
      setEditDescription(project.description || "");
      setEditStart(project.startDate || "");
      setEditEnd(project.endDate || "");
      setEditStatus(project.status || "ACTIVE");
      setActiveTab("INFO");
      setFormError(null);
      setMembersError(null);
      loadMembersAndRoles();
    }
  }, [isOpen, project]);

  async function loadMembersAndRoles() {
    if (!project) return;
    setIsLoadingMembers(true);
    try {
      const [membersRes, rolesRes] = await Promise.all([
        projectApi.listMembers(project.id),
        projectApi.listRoles()
      ]);
      setMembers(membersRes.data || []);
      const loadedRoles = rolesRes.data || [];
      setRoles(loadedRoles);
      
      const pmRoleObj = loadedRoles.find((r: any) => r.name === "PROJECT_MANAGER");
      const firstValidRole = loadedRoles.find((r: any) => !pmRoleObj || r.id !== pmRoleObj.id);
      if (firstValidRole) {
        setNewMemberRole(firstValidRole.id.toString());
      }

      if (accessibleUsers.length > 0) {
        setNewMemberId(accessibleUsers[0].id);
      }
    } catch (err: any) {
      setMembersError(err.message || "Không thể tải danh sách thành viên.");
    } finally {
      setIsLoadingMembers(false);
    }
  }

  if (!isOpen || !project) return null;

  async function handleUpdateInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!editName.trim() || !editStart) {
      setFormError("Vui lòng nhập đầy đủ tên dự án và ngày bắt đầu.");
      return;
    }

    if (editEnd && editEnd < editStart) {
      setFormError("Ngày kết thúc dự kiến phải sau ngày bắt đầu.");
      return;
    }

    try {
      await projectApi.update(project!.id, {
        name: editName.trim(),
        description: editDescription.trim(),
        status: editStatus as any,
        startDate: editStart,
        endDate: editEnd,
      });
      onProjectUpdated();
      onClose();
    } catch (err: any) {
      setFormError(err.message || "Cập nhật thất bại.");
    }
  }

  async function handleAddMember() {
    setMembersError(null);
    if (!newMemberId) return;
    try {
      await projectApi.addMember(project!.id, newMemberId, parseInt(newMemberRole));
      await loadMembersAndRoles();
      onProjectUpdated(); // Refresh project list to update member counts if needed
    } catch (err: any) {
      setMembersError(err.message || "Thêm thành viên thất bại.");
    }
  }

  async function handleUpdateRole(memberId: number, newRoleId: number) {
    setMembersError(null);
    try {
      await projectApi.updateMemberRole(project!.id, memberId, newRoleId);
      await loadMembersAndRoles();
      onProjectUpdated();
    } catch (err: any) {
      setMembersError(err.message || "Cập nhật vai trò thất bại.");
    }
  }

  async function handleRemoveMember(memberId: number) {
    setMembersError(null);
    try {
      await projectApi.removeMember(project!.id, memberId);
      await loadMembersAndRoles();
      onProjectUpdated();
    } catch (err: any) {
      setMembersError(err.message || "Xóa thành viên thất bại.");
    }
  }

  // Khác user hiện tại (trong danh sách dropdown thêm)
  const availableUsersToAdd = accessibleUsers.filter(
    (u) => !members.some((m) => m.userId.toString() === u.id.replace("usr-", ""))
  );

  const pmRole = roles.find((r) => r.name === "PROJECT_MANAGER");

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <div
        className={styles.modalSurface}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ maxWidth: "700px" }}
      >
        <div className={styles.modalHeader}>
          <h2 id="edit-project-title">Chỉnh sửa dự án: {project.name}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng popup">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", padding: "0 24px" }}>
          <button
            type="button"
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "INFO" ? "2px solid var(--primary-base)" : "2px solid transparent",
              color: activeTab === "INFO" ? "var(--primary-base)" : "var(--text-secondary)",
              fontWeight: activeTab === "INFO" ? "600" : "400",
              cursor: "pointer",
            }}
            onClick={() => setActiveTab("INFO")}
          >
            Thông tin chung
          </button>
          <button
            type="button"
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "MEMBERS" ? "2px solid var(--primary-base)" : "2px solid transparent",
              color: activeTab === "MEMBERS" ? "var(--primary-base)" : "var(--text-secondary)",
              fontWeight: activeTab === "MEMBERS" ? "600" : "400",
              cursor: "pointer",
            }}
            onClick={() => setActiveTab("MEMBERS")}
          >
            Thành viên
          </button>
        </div>

        {activeTab === "INFO" && (
          <form onSubmit={handleUpdateInfo} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <div className={styles.inputGroup}>
                  <label>Tên dự án</label>
                  <input
                    className={styles.inputControl}
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>Trạng thái</label>
                  <select
                    className={styles.inputControl}
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value)}
                  >
                    <option value="ACTIVE">Đang triển khai</option>
                    <option value="PLANNING">Đang lập kế hoạch</option>
                    <option value="AT_RISK">Rủi ro trễ hạn</option>
                    <option value="COMPLETED">Đã hoàn thành</option>
                  </select>
                </div>
                <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
                  <label>Mô tả chi tiết</label>
                  <textarea
                    className={styles.inputControl}
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    rows={4}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>Ngày bắt đầu</label>
                  <input
                    className={styles.inputControl}
                    type="date"
                    value={editStart}
                    onChange={(event) => setEditStart(event.target.value)}
                    required
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>Ngày kết thúc dự kiến</label>
                  <input
                    className={styles.inputControl}
                    type="date"
                    value={editEnd}
                    onChange={(event) => setEditEnd(event.target.value)}
                  />
                </div>
              </div>
              {formError ? <p className={styles.errorMessage}>{formError}</p> : null}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Hủy
              </button>
              <button type="submit" className={styles.btnPrimary}>
                Lưu thay đổi
              </button>
            </div>
          </form>
        )}

        {activeTab === "MEMBERS" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div className={styles.modalBody}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "flex-end" }}>
                <div className={styles.inputGroup} style={{ flex: 1, margin: 0 }}>
                  <label>Thêm thành viên</label>
                  <select
                    className={styles.inputControl}
                    value={newMemberId}
                    onChange={(e) => setNewMemberId(e.target.value)}
                  >
                    {availableUsersToAdd.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} - {roleLabel(u.role)}</option>
                    ))}
                    {availableUsersToAdd.length === 0 && <option value="">Đã thêm tất cả user</option>}
                  </select>
                </div>
                <div className={styles.inputGroup} style={{ flex: 1, margin: 0 }}>
                  <label>Vai trò dự án</label>
                  <select
                    className={styles.inputControl}
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                  >
                    {roles.map(r => {
                      const isPmRole = pmRole && r.id === pmRole.id;
                      if (isPmRole && viewerRole !== "ADMIN") return null;
                      return <option key={r.id} value={r.id}>{projectRoleLabel(r.name)}</option>;
                    })}
                  </select>
                </div>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleAddMember}
                  disabled={!newMemberId || availableUsersToAdd.length === 0}
                  style={{ height: "42px" }}
                >
                  Thêm
                </button>
              </div>
              
              {membersError && <p className={styles.errorMessage}>{membersError}</p>}
              
              <div style={{ marginTop: "16px", overflowY: "auto", maxHeight: "300px", border: "1px solid var(--border-subtle)", borderRadius: "6px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead style={{ background: "var(--surface-sunken)", position: "sticky", top: 0 }}>
                    <tr>
                      <th style={{ padding: "12px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 500, fontSize: "14px" }}>Tên</th>
                      <th style={{ padding: "12px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 500, fontSize: "14px" }}>Email</th>
                      <th style={{ padding: "12px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 500, fontSize: "14px", width: "160px" }}>Vai trò</th>
                      <th style={{ padding: "12px", borderBottom: "1px solid var(--border-subtle)", width: "60px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingMembers ? (
                      <tr><td colSpan={4} style={{ padding: "16px", textAlign: "center" }}>Đang tải...</td></tr>
                    ) : members.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: "16px", textAlign: "center" }}>Chưa có thành viên.</td></tr>
                    ) : (
                      members.map((m) => {
                        const isPmRole = pmRole && m.roleId === pmRole.id;
                        const canEdit = viewerRole === "ADMIN" || (!isPmRole);
                        return (
                          <tr key={m.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "12px", fontSize: "14px" }}><strong>{m.userName}</strong></td>
                            <td style={{ padding: "12px", fontSize: "14px", color: "var(--text-secondary)" }}>{m.userEmail}</td>
                            <td style={{ padding: "12px" }}>
                              <select
                                className={styles.inputControl}
                                style={{ padding: "4px 8px", fontSize: "13px", height: "auto" }}
                                value={m.roleId}
                                disabled={!canEdit}
                                onChange={(e) => handleUpdateRole(m.id, parseInt(e.target.value))}
                              >
                                {roles.map(r => {
                                  const rIsPmRole = pmRole && r.id === pmRole.id;
                                  if (rIsPmRole && viewerRole !== "ADMIN" && !isPmRole) return null; // PM can't promote to PM
                                  return <option key={r.id} value={r.id}>{projectRoleLabel(r.name)}</option>;
                                })}
                              </select>
                            </td>
                            <td style={{ padding: "12px", textAlign: "right" }}>
                              <button
                                type="button"
                                style={{ background: "none", border: "none", color: "var(--color-critical)", cursor: canEdit ? "pointer" : "not-allowed", opacity: canEdit ? 1 : 0.5 }}
                                onClick={() => handleRemoveMember(m.id)}
                                disabled={!canEdit}
                                title="Xóa"
                              >
                                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
