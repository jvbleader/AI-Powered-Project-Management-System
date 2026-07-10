import { useState, useEffect } from "react";
import { Surface, StatusPill } from "@/components/ui";
import { projectApi } from "@/services/api";
import styles from "../../team/styles/team.module.css";
import type { UserProfile } from "@/types";

interface ProjectMembersProps {
  projectId: string;
  viewerId: string;
  canManage: boolean;
  accessibleUsers: UserProfile[];
}

export function ProjectMembers({ projectId, viewerId, canManage, accessibleUsers }: ProjectMembersProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [newUserId, setNewUserId] = useState<string>("");
  const [newUserRoleId, setNewUserRoleId] = useState<number>(2); // Default to Developer

  useEffect(() => {
    async function loadData() {
      try {
        const [membersRes, rolesRes] = await Promise.all([
          projectApi.listMembers(projectId),
          projectApi.listRoles()
        ]);
        setMembers(membersRes.data || []);
        setRoles(rolesRes.data || []);
      } catch (err) {
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
      await projectApi.addMember(projectId, newUserId, newUserRoleId);
      setIsAdding(false);
      setNewUserId("");
      // Reload members
      const membersRes = await projectApi.listMembers(projectId);
      setMembers(membersRes.data || []);
    } catch (err: any) {
      alert(err.message || "Lỗi khi thêm thành viên");
    }
  };

  const handleUpdateRole = async (memberId: number, roleId: number) => {
    try {
      await projectApi.updateMemberRole(projectId, memberId, roleId);
      const membersRes = await projectApi.listMembers(projectId);
      setMembers(membersRes.data || []);
    } catch (err: any) {
      alert(err.message || "Lỗi khi cập nhật vai trò");
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm("Bạn có chắc muốn gỡ thành viên này khỏi dự án?")) return;
    try {
      await projectApi.removeMember(projectId, memberId);
      const membersRes = await projectApi.listMembers(projectId);
      setMembers(membersRes.data || []);
    } catch (err: any) {
      alert(err.message || "Lỗi khi gỡ thành viên");
    }
  };

  if (isLoading) return <div>Đang tải thành viên...</div>;
  if (error) return <div style={{ color: "var(--status-critical)" }}>{error}</div>;

  const availableUsersToAdd = accessibleUsers.filter(u => !members.some(m => m.userId.toString() === u.id.replace("usr-", "")));

  return (
    <Surface title="Danh sách thành viên">
      {canManage && (
        <div style={{ marginBottom: "1.5rem" }}>
          {!isAdding ? (
            <button type="button" className="primary-button" onClick={() => setIsAdding(true)}>
              + Thêm thành viên
            </button>
          ) : (
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", background: "var(--surface-sunken)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)", flexWrap: "wrap" }}>
              <select 
                value={newUserId} 
                onChange={e => setNewUserId(e.target.value)}
                style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)", flex: 1, minWidth: "200px" }}
              >
                <option value="">Chọn người dùng...</option>
                {availableUsersToAdd.map(u => (
                  <option key={u.id} value={u.id}>{u.name} - {u.email}</option>
                ))}
              </select>
              <select
                value={newUserRoleId}
                onChange={e => setNewUserRoleId(Number(e.target.value))}
                style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)", width: "200px" }}
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
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

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Ngày tham gia</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {members.map(member => (
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
                <td>
                  {canManage && member.userId.toString() !== viewerId.replace("usr-", "") ? (
                    <select
                      value={member.roleId}
                      onChange={e => handleUpdateRole(member.id, Number(e.target.value))}
                      style={{ padding: "0.25rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)" }}
                    >
                      {roles.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <StatusPill label={member.roleName} tone={member.roleName === "PROJECT_MANAGER" ? "accent" : "neutral"} />
                  )}
                </td>
                <td>{new Date(member.joinedAt).toLocaleDateString("vi-VN")}</td>
                {canManage && (
                  <td>
                    {member.userId.toString() !== viewerId.replace("usr-", "") && (
                      <button 
                        type="button" 
                        className="secondary-button" 
                        style={{ color: "var(--status-critical)", borderColor: "var(--status-critical)", background: "transparent" }}
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        Gỡ bỏ
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4} style={{ textAlign: "center", padding: "2rem", color: "var(--foreground-muted)" }}>
                  Chưa có thành viên nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
