import { useState, useEffect, useEffectEvent, type FormEvent } from "react";
import { roleLabel, projectRoleLabel } from "@/lib/utils/format";
import type { UserProfile, Project } from "@/types";
import { projectApi, userApi } from "@/services/api";
import type { ProjectMemberResponse, ProjectRoleResponse } from "@/services/api/projects";
import { Department } from "@/types/user";
import { CustomSelect } from "@/components/custom-select";
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
  viewerRole,
  accessibleUsers,
  onProjectUpdated,
}: EditProjectModalProps) {
  void viewerRole;
  const [activeTab, setActiveTab] = useState<"INFO" | "MEMBERS">("INFO");
  
  // Info State
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);

  // Members State
  const [members, setMembers] = useState<ProjectMemberResponse[]>([]);
  const [roles, setRoles] = useState<ProjectRoleResponse[]>([]);
  const [newMemberId, setNewMemberId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("2");
  const [membersError, setMembersError] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const extractErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const resolveMemberRoleId = (member: Pick<ProjectMemberResponse, "roleId" | "roleName">) =>
    roles.find((role) => role.name === member.roleName)?.id ?? member.roleId;

  const syncModalState = useEffectEvent(() => {
    if (!project) return;

    setEditName(project.name || "");
    setEditDescription(project.description || "");
    setEditStart(project.startDate || "");
    setEditEnd(project.endDate || "");
    setEditStatus(project.status || "ACTIVE");
    setEditDepartmentId(project.departmentId ? String(project.departmentId) : "");
    setActiveTab("INFO");
    setFormError(null);
    setMembersError(null);
    void loadMembersAndRoles();
  });

  useEffect(() => {
    if (isOpen && project) {
      queueMicrotask(() => {
        syncModalState();
      });
      userApi.getDepartments().then(res => {
        setDepartments(res.data);
      }).catch(console.error);
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
      
      const pmRoleObj = loadedRoles.find((role) => role.name === "PROJECT_MANAGER");
      const firstValidRole = loadedRoles.find((role) => !pmRoleObj || role.id !== pmRoleObj.id);
      if (firstValidRole) {
        setNewMemberRole(firstValidRole.id.toString());
      }

      if (accessibleUsers.length > 0) {
        setNewMemberId(accessibleUsers[0].id);
      }
    } catch (error: unknown) {
      setMembersError(extractErrorMessage(error, "Không thể tải danh sách thành viên."));
    } finally {
      setIsLoadingMembers(false);
    }
  }

  if (!isOpen || !project) return null;

  const handleInvalid = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    (event.target as HTMLInputElement | HTMLTextAreaElement).setCustomValidity("Vui lòng nhập đầy đủ thông tin trường này");
  };

  const handleInput = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    (event.target as HTMLInputElement | HTMLTextAreaElement).setCustomValidity("");
  };

  async function handleUpdateInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!editName.trim() || !editStart) {
      setFormError("Vui lòng nhập đầy đủ thông tin trường này");
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
        status: editStatus as Project["status"],
        startDate: editStart,
        endDate: editEnd,
        departmentId: parseInt(editDepartmentId, 10),
      });
      onProjectUpdated();
      onClose();
    } catch (error: unknown) {
      setFormError(extractErrorMessage(error, "Không thể cập nhật thông tin dự án."));
    }
  }

  async function handleAddMember() {
    setMembersError(null);
    if (!newMemberId) return;
    try {
      await projectApi.addMember(project!.id, newMemberId, parseInt(newMemberRole));
      await loadMembersAndRoles();
      onProjectUpdated(); // Refresh project list to update member counts if needed
    } catch (error: unknown) {
      setMembersError(extractErrorMessage(error, "Thêm thành viên thất bại."));
    }
  }

  async function handleUpdateRole(memberId: number, newRoleId: number) {
    setMembersError(null);
    try {
      await projectApi.updateMemberRole(project!.id, memberId, newRoleId);
      await loadMembersAndRoles();
      onProjectUpdated();
    } catch (error: unknown) {
      setMembersError(extractErrorMessage(error, "Cập nhật vai trò thất bại."));
    }
  }

  async function handleRemoveMember(memberId: number) {
    setMembersError(null);
    try {
      await projectApi.removeMember(project!.id, memberId);
      await loadMembersAndRoles();
      onProjectUpdated();
    } catch (error: unknown) {
      setMembersError(extractErrorMessage(error, "Xóa thành viên thất bại."));
    }
  }

  // Khác user hiện tại (trong danh sách dropdown thêm)
  const availableUsersToAdd = accessibleUsers.filter(
    (u) => !members.some((m) => m.userId.toString() === u.id.replace("usr-", ""))
  );

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <div
        className={styles.modalSurface}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: "800px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
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
          <form onSubmit={handleUpdateInfo} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div className={styles.modalBody}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.25rem",
                marginBottom: "0.5rem"
              }}>
                <div className={styles.inputGroup} style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>
                    Tên dự án<span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    className={styles.inputControl}
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onInvalid={handleInvalid}
                    onInput={handleInput}
                    required
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>
                    Trạng thái
                  </label>
                  <CustomSelect
                    className={styles.inputControl}
                    value={editStatus}
                    onChange={(val) => setEditStatus(val)}
                    options={[
                      { value: "ACTIVE", label: "Đang triển khai" },
                      { value: "PLANNING", label: "Đang lập kế hoạch" },
                      { value: "AT_RISK", label: "Rủi ro trễ hạn" },
                      { value: "COMPLETED", label: "Đã hoàn thành" },
                      { value: "ON_HOLD", label: "Tạm dừng" },
                    ]}
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>
                    Phòng ban phụ trách
                  </label>
                  <CustomSelect
                    className={styles.inputControl}
                    value={editDepartmentId}
                    onChange={(val) => setEditDepartmentId(val)}
                    options={[
                      { value: "", label: "-- Chọn phòng ban --" },
                      ...departments.map((dept) => ({ value: String(dept.id), label: dept.name }))
                    ]}
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>
                    Ngày bắt đầu
                  </label>
                  <input
                    className={styles.inputControl}
                    type="date"
                    value={editStart}
                    onChange={(event) => setEditStart(event.target.value)}
                    onInvalid={handleInvalid}
                    onInput={handleInput}
                    required
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>
                    Ngày kết thúc dự kiến
                  </label>
                  <input
                    className={styles.inputControl}
                    type="date"
                    value={editEnd}
                    onChange={(event) => setEditEnd(event.target.value)}
                  />
                </div>

                <div className={styles.inputGroup} style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>
                    Mô tả chi tiết
                  </label>
                  <textarea
                    className={styles.inputControl}
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    rows={4}
                    style={{ minHeight: "120px" }}
                  />
                </div>
              </div>

              {formError && (
                <div style={{ color: "var(--critical)", fontSize: "0.875rem", marginTop: "1rem" }}>
                  {formError}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={onClose}
              >
                Hủy
              </button>
              <button type="submit" className={styles.btnPrimary}>
                Lưu thay đổi
              </button>
            </div>
          </form>
        )}

        {activeTab === "MEMBERS" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div className={styles.modalBody}>
              <div style={{ overflowY: "auto", flex: 1, border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "16px", background: "var(--surface-sunken)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead style={{ background: "rgba(248, 250, 252, 0.9)", position: "sticky", top: 0, zIndex: 1, backdropFilter: "blur(4px)" }}>
                    <tr>
                      <th style={{ padding: "16px", borderBottom: "1px solid rgba(148, 163, 184, 0.2)", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-secondary)" }}>Tên</th>
                      <th style={{ padding: "16px", borderBottom: "1px solid rgba(148, 163, 184, 0.2)", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-secondary)" }}>Email</th>
                      <th style={{ padding: "16px", borderBottom: "1px solid rgba(148, 163, 184, 0.2)", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-secondary)", width: "180px" }}>Vai trò</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingMembers ? (
                      <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>Đang tải...</td></tr>
                    ) : members.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>Chưa có thành viên.</td></tr>
                    ) : (
                      members.map((m) => {
                        const canEdit = true;
                        return (
                          <tr key={m.id} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)" }}>
                            <td style={{ padding: "12px 16px", fontSize: "0.95rem" }}><strong>{m.userName}</strong></td>
                            <td style={{ padding: "12px 16px", fontSize: "0.95rem", color: "var(--text-secondary)" }}>{m.userEmail}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                display: "block",
                                width: "150px",
                                textAlign: "center",
                                padding: "6px 12px",
                                background: "rgba(241, 245, 249, 0.6)",
                                border: "1px solid rgba(148, 163, 184, 0.2)",
                                borderRadius: "8px",
                                fontSize: "0.85rem",
                                color: "var(--text-secondary)",
                                fontWeight: 500,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                boxSizing: "border-box"
                              }}
                              title={(() => {
                                const roleObj = roles.find((r) => r.id === resolveMemberRoleId(m));
                                return roleObj ? projectRoleLabel(roleObj.name) : "Thành viên";
                              })()}>
                                {(() => {
                                  const roleObj = roles.find((r) => r.id === resolveMemberRoleId(m));
                                  return roleObj ? projectRoleLabel(roleObj.name) : "Thành viên";
                                })()}
                              </span>
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
