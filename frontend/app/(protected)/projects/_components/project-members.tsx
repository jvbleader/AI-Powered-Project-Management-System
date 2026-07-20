import { useState, useEffect } from "react";
import { Surface, StatusPill } from "@/components/ui";
import { projectApi } from "@/services/api";
import { projectRoleLabel, getRoleTone, isManagerRole, isLeaderRole } from "@/lib/utils/format";
import styles from "../../team/styles/team.module.css";
import type { UserProfile } from "@/types";
import type { Project } from "@/types/project";

type ProjectMemberItem = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  roleId: number;
  roleName: string;
  joinedAt: string;
  isActive: boolean;
};

type ProjectRoleItem = {
  id: number;
  name: string;
};

interface ProjectMembersProps {
  projectId: string;
  viewerId: string;
  canManage: boolean;
  accessibleUsers: UserProfile[];
  project?: Project;
}

export function ProjectMembers({ projectId, viewerId, canManage, accessibleUsers, project }: ProjectMembersProps) {
  const [members, setMembers] = useState<ProjectMemberItem[]>([]);
  const [roles, setRoles] = useState<ProjectRoleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [page, setPage] = useState(1);
  const MEMBERS_PER_PAGE = 10;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [isAdding, setIsAdding] = useState(false);
  const [newUserId, setNewUserId] = useState<string>("");
  const [newUserRoleId, setNewUserRoleId] = useState<number>(0);

  const extractErrorMessage = (error: unknown, fallback: string) => {
    return error instanceof Error ? error.message : fallback;
  };

  const reloadMembers = async () => {
    const membersRes = await projectApi.listMembers(projectId);
    setMembers(membersRes.data || []);
  };

  const resolveMemberRoleId = (member: ProjectMemberItem) =>
    roles.find((role) => role.name === member.roleName)?.id ?? member.roleId;

  const viewerMember = members.find(m => m.userId.toString() === viewerId.replace("usr-", ""));
  const isProjectPMOrLeader = viewerMember && viewerMember.isActive && (
    viewerMember.roleName.includes("Manager") || 
    viewerMember.roleName.includes("PM") || 
    viewerMember.roleName.includes("Owner") || 
    viewerMember.roleName.includes("Leader") ||
    isManagerRole(viewerMember.roleName) ||
    isLeaderRole(viewerMember.roleName)
  );

  const canManageMembers = canManage || !!isProjectPMOrLeader;

  useEffect(() => {
    async function loadData() {
      try {
        const [membersRes, rolesRes] = await Promise.all([
          projectApi.listMembers(projectId),
          projectApi.listRoles()
        ]);
        setMembers(membersRes.data || []);
        const loadedRoles = rolesRes.data || [];
        setRoles(loadedRoles);
        const defaultRole =
          loadedRoles.find((role: ProjectRoleItem) => role.name === "PROJECT_MEMBER") ??
          loadedRoles.find((role: ProjectRoleItem) => role.name !== "PROJECT_MANAGER") ??
          loadedRoles[0];
        setNewUserRoleId(defaultRole?.id ?? 0);
      } catch {
        setError("Không thể tải danh sách thành viên.");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  const handleAddMember = async () => {
    if (!newUserId) return;
    try {
      const roleIdToPass = newUserRoleId === 0 ? 2 : newUserRoleId;
      await projectApi.addMember(projectId, newUserId, roleIdToPass);
      setIsAdding(false);
      setNewUserId("");
      await reloadMembers();
    } catch (err: unknown) {
      alert(extractErrorMessage(err, "Lỗi khi thêm thành viên"));
    }
  };

  const handleUpdateRole = async (memberId: number, roleId: number) => {
    try {
      await projectApi.updateMemberRole(projectId, memberId, roleId);
      await reloadMembers();
    } catch (err: unknown) {
      alert(extractErrorMessage(err, "Lỗi khi cập nhật vai trò"));
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm("Bạn có chắc muốn tạm dừng thành viên này khỏi dự án?")) return;
    try {
      await projectApi.removeMember(projectId, memberId);
      await reloadMembers();
    } catch (err: unknown) {
      alert(extractErrorMessage(err, "Lỗi khi gỡ thành viên"));
    }
  };

  const handleRestoreMember = async (member: ProjectMemberItem) => {
    try {
      await projectApi.addMember(projectId, `usr-${member.userId}`, resolveMemberRoleId(member));
      await reloadMembers();
    } catch (err: unknown) {
      alert(extractErrorMessage(err, "Lỗi khi khôi phục thành viên"));
    }
  };

  if (isLoading) return <div>Đang tải thành viên...</div>;
  if (error) return <div style={{ color: "var(--status-critical)" }}>{error}</div>;

  let departmentUsers = accessibleUsers;
  if (project?.departmentName) {
    departmentUsers = accessibleUsers.filter(u => u.department === project.departmentName);
  }

  // Get unique roles from department users
  const availableRoleNames = Array.from(new Set(departmentUsers.map(u => u.role).filter(Boolean)));
  // Filter the system roles to only include roles that actually exist in this department
  const filteredRoles = roles.filter(r => availableRoleNames.includes(r.name));

  const selectedRole = roles.find(r => r.id === newUserRoleId);
  const selectedRoleName = selectedRole?.name;

  let availableUsersToAdd = departmentUsers.filter(u => !members.some(m => m.isActive && m.userId.toString() === u.id.replace("usr-", "")));
  
  if (selectedRoleName && newUserRoleId !== 0) {
    availableUsersToAdd = availableUsersToAdd.filter(u => u.role === selectedRoleName);
  }
  
  const activePMCount = members.filter(m => m.isActive && m.roleName === "PROJECT_MANAGER").length;

  const filteredMembers = members.filter(m => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (
      normalizedQuery &&
      !m.userName.toLowerCase().includes(normalizedQuery) &&
      !m.userEmail.toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    if (roleFilter !== "ALL" && m.roleId.toString() !== roleFilter) return false;
    if (statusFilter !== "ALL") {
      const isStatusActive = statusFilter === "ACTIVE";
      if (m.isActive !== isStatusActive) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / MEMBERS_PER_PAGE));
  const validPage = Math.min(page, totalPages);
  
  const paginatedMembers = filteredMembers.slice(
    (validPage - 1) * MEMBERS_PER_PAGE,
    validPage * MEMBERS_PER_PAGE,
  );

  return (
    <Surface title="Danh sách thành viên">
      {canManageMembers && (
        <div style={{ marginBottom: "1.5rem" }}>
          {!isAdding ? (
            <button type="button" className="primary-button" onClick={() => setIsAdding(true)}>
              + Thêm thành viên
            </button>
          ) : (
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", background: "var(--surface-sunken)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)", flexWrap: "wrap" }}>
              <select 
                value={newUserId} 
                onChange={e => {
                  const selectedUserId = e.target.value;
                  setNewUserId(selectedUserId);
                  if (selectedUserId) {
                    const user = availableUsersToAdd.find(u => u.id === selectedUserId);
                    if (user && user.role) {
                      const matchedRole = roles.find(r => r.name === user.role);
                      if (matchedRole) {
                        setNewUserRoleId(matchedRole.id);
                      }
                    }
                  }
                }}
                style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)", flex: 1, minWidth: "200px" }}
              >
                <option value="">Chọn người dùng...</option>
                {availableUsersToAdd.map(u => (
                  <option key={u.id} value={u.id}>{u.name} - {u.email}</option>
                ))}
              </select>
              <select
                value={newUserRoleId}
                onChange={e => {
                  setNewUserRoleId(Number(e.target.value));
                  setNewUserId("");
                }}
                style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)", width: "200px" }}
              >
                <option value={0}>Tất cả các Role</option>
                {filteredRoles.map(r => (
                  <option key={r.id} value={r.id}>{projectRoleLabel(r.name)}</option>
                ))}
              </select>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className="primary-button" onClick={handleAddMember} disabled={!newUserId}>
                  Thêm
                </button>
                <button type="button" className="secondary-button" onClick={() => setIsAdding(false)}>
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: "1 1 280px" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Tìm kiếm thành viên
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Nhập tên hoặc email người dùng..."
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
            }}
          />
        </label>
        <div style={{ color: "var(--foreground-muted)", fontSize: "0.9rem" }}>
          {filteredMembers.length} thành viên phù hợp
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Email</th>
              <th>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                  Vai trò
                  <div style={{ position: "relative", width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--foreground-muted)" }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ position: "absolute", pointerEvents: "none" }}>
                      <path d="M7 10l5 5 5-5z" />
                    </svg>
                    <select
                      value={roleFilter}
                      onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", appearance: "none" }}
                    >
                      <option value="ALL">Tất cả</option>
                      {roles.map(r => (
                        <option key={r.id} value={r.id.toString()}>{projectRoleLabel(r.name)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </th>
              <th>Ngày tham gia</th>
              <th>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                  Trạng thái
                  <div style={{ position: "relative", width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--foreground-muted)" }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ position: "absolute", pointerEvents: "none" }}>
                      <path d="M7 10l5 5 5-5z" />
                    </svg>
                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", appearance: "none" }}
                    >
                      <option value="ALL">Tất cả</option>
                      <option value="ACTIVE">Hoạt động</option>
                      <option value="INACTIVE">Tạm dừng</option>
                    </select>
                  </div>
                </div>
              </th>
              {canManageMembers && <th />}
            </tr>
          </thead>
          <tbody>
            {paginatedMembers.map(member => (
              <tr key={member.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span className={styles.avatarToken} style={{ width: "32px", height: "32px", fontSize: "0.875rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "var(--primary-subtle)", color: "var(--primary-base)" }}>
                      {member.userName.charAt(0).toUpperCase()}
                    </span>
                    <strong>{member.userName}</strong>
                  </div>
                </td>
                <td>{member.userEmail}</td>
                <td style={{ textAlign: "center" }}>
                  <StatusPill 
                    label={projectRoleLabel(member.roleName)} 
                    tone={getRoleTone(member.roleName)}
                  />
                </td>
                <td>{new Date(member.joinedAt).toLocaleDateString("vi-VN")}</td>
                <td style={{ textAlign: "center" }}>
                  <StatusPill 
                    label={member.isActive ? "Hoạt động" : "Tạm dừng"} 
                    tone={member.isActive ? "on-track" : "critical"} 
                  />
                </td>
                {canManageMembers && (
                  <td>
                    {member.userId.toString() !== viewerId.replace("usr-", "") && (
                      member.isActive ? (
                        <button 
                          type="button" 
                          className="secondary-button" 
                          style={{ 
                            color: "var(--status-critical)", 
                            borderColor: "var(--status-critical)", 
                            background: "transparent",
                            opacity: (member.roleName === "PROJECT_MANAGER" && activePMCount <= 1) ? 0.5 : 1,
                            cursor: (member.roleName === "PROJECT_MANAGER" && activePMCount <= 1) ? "not-allowed" : "pointer"
                          }}
                          disabled={(member.roleName === "PROJECT_MANAGER" && activePMCount <= 1) || !canManageMembers}
                          title={member.roleName === "PROJECT_MANAGER" && activePMCount <= 1 ? "Không thể gỡ Quản lý dự án duy nhất" : ""}
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          Gỡ bỏ
                        </button>
                      ) : (
                        <button 
                          type="button" 
                          className="secondary-button" 
                          style={{ color: "var(--primary-base)", borderColor: "var(--primary-base)", background: "transparent" }}
                          onClick={() => handleRestoreMember(member)}
                        >
                          Thêm lại
                        </button>
                      )
                    )}
                  </td>
                )}
              </tr>
            ))}
            {filteredMembers.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5} style={{ textAlign: "center", padding: "2rem", color: "var(--foreground-muted)" }}>
                  {searchQuery.trim() ? "Không tìm thấy thành viên phù hợp" : "Chưa có thành viên nào"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationBar} style={{ marginTop: "1rem" }}>
          <p>
            Hiển thị {(validPage - 1) * MEMBERS_PER_PAGE + 1} -{" "}
            {Math.min(validPage * MEMBERS_PER_PAGE, filteredMembers.length)} / {filteredMembers.length} thành viên.
          </p>
          <div className={styles.paginationActions}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPage(Math.max(1, validPage - 1))}
              disabled={validPage <= 1}
            >
              Trang trước
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => setPage(Math.min(totalPages, validPage + 1))}
              disabled={validPage >= totalPages}
            >
              Trang sau
            </button>
          </div>
        </div>
      )}
    </Surface>
  );
}
