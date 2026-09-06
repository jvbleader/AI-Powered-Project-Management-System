"use client";

import { useEffect, useMemo, useState } from "react";
import { Surface, StatusPill } from "@/components/ui";
import { RoleTags } from "@/components/role-tags";
import { TableBodySkeleton } from "@/components/loading-state";
import { UserAvatar } from "@/components/user-avatar";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { TablePagination } from "@/components/table-pagination";
import { projectApi } from "@/services/api";
import {
  isLeaderRole,
  isManagerRole,
  projectRoleLabel,
  roleDisplayLabels,
  splitSlashLabels,
} from "@/lib/utils/format";
import teamStyles from "../../team/styles/team.module.css";
import styles from "./project-members.module.css";
import { MemberFilters } from "./member-filters";
import { AddMemberModal } from "./add-member-modal";
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
  isAddMemberOpen?: boolean;
  onAddMemberOpenChange?: (open: boolean) => void;
}

const STATUS_FILTER_OPTIONS = [
  { value: "ACTIVE", label: "Hoạt động" },
  { value: "INACTIVE", label: "Tạm dừng" },
];

function memberRoleLabels(member: ProjectMemberItem, user?: UserProfile) {
  const fromUser = roleDisplayLabels(user?.roles, user?.role);
  if (fromUser.length > 0) {
    return fromUser;
  }
  return splitSlashLabels(projectRoleLabel(member.roleName));
}

export function ProjectMembers({
  projectId,
  viewerId,
  canManage,
  accessibleUsers,
  project,
  isAddMemberOpen = false,
  onAddMemberOpenChange,
}: ProjectMembersProps) {
  const { confirm, alert } = useConfirmDialog();
  const [members, setMembers] = useState<ProjectMemberItem[]>([]);
  const [roles, setRoles] = useState<ProjectRoleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const MEMBERS_PER_PAGE = 10;

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

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

  const userLookup = useMemo(
    () => new Map(accessibleUsers.map((user) => [user.id, user])),
    [accessibleUsers],
  );

  useEffect(() => {
    async function loadData() {
      try {
        const [membersRes, rolesRes] = await Promise.all([
          projectApi.listMembers(projectId),
          projectApi.listRoles(),
        ]);
        setMembers(membersRes.data || []);
        const loadedRoles = rolesRes.data || [];
        setRoles(loadedRoles);
      } catch {
        setError("Không thể tải danh sách thành viên.");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  const handleRemoveMember = async (memberId: number) => {
    const confirmed = await confirm({
      title: "Tạm dừng thành viên",
      message: "Bạn có chắc muốn tạm dừng thành viên này khỏi dự án?",
      confirmLabel: "Tạm dừng",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await projectApi.removeMember(projectId, memberId);
      await reloadMembers();
    } catch (err: unknown) {
      await alert({ title: "Không thể gỡ thành viên", message: extractErrorMessage(err, "Lỗi khi gỡ thành viên") });
    }
  };

  const handleRestoreMember = async (member: ProjectMemberItem) => {
    try {
      await projectApi.addMember(projectId, `usr-${member.userId}`, resolveMemberRoleId(member));
      await reloadMembers();
    } catch (err: unknown) {
      await alert({ title: "Không thể khôi phục thành viên", message: extractErrorMessage(err, "Lỗi khi khôi phục thành viên") });
    }
  };

  const roleFilterOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const member of members) {
      for (const label of memberRoleLabels(member, userLookup.get(`usr-${member.userId}`))) {
        labels.add(label);
      }
    }
    return Array.from(labels)
      .sort((left, right) => left.localeCompare(right, "vi"))
      .map((label) => ({ value: label, label }));
  }, [members, userLookup]);

  if (error) return <div style={{ color: "var(--status-critical)" }}>{error}</div>;

  const activePMCount = members.filter(m => m.isActive && m.roleName === "PROJECT_MANAGER").length;

  const filteredMembers = members.filter((member) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (
      normalizedQuery &&
      !member.userName.toLowerCase().includes(normalizedQuery) &&
      !member.userEmail.toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }

    if (roleFilter.length > 0) {
      const labels = memberRoleLabels(member, userLookup.get(`usr-${member.userId}`));
      if (!labels.some((label) => roleFilter.includes(label))) {
        return false;
      }
    }

    if (statusFilter.length > 0) {
      const statusValue = member.isActive ? "ACTIVE" : "INACTIVE";
      if (!statusFilter.includes(statusValue)) {
        return false;
      }
    }

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / MEMBERS_PER_PAGE));
  const validPage = Math.min(page, totalPages);

  const paginatedMembers = filteredMembers.slice(
    (validPage - 1) * MEMBERS_PER_PAGE,
    validPage * MEMBERS_PER_PAGE,
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 || roleFilter.length > 0 || statusFilter.length > 0;

  return (
    <Surface>
      <AddMemberModal
        isOpen={isAddMemberOpen}
        projectId={projectId}
        project={project}
        accessibleUsers={accessibleUsers}
        existingMembers={members}
        projectRoles={roles}
        onClose={() => onAddMemberOpenChange?.(false)}
        onAdded={reloadMembers}
      />

      <MemberFilters
        searchQuery={searchQuery}
        onSearchChange={(value) => {
          setSearchQuery(value);
          setPage(1);
        }}
        roleOptions={roleFilterOptions}
        roleFilter={roleFilter}
        onRoleFilterChange={(value) => {
          setRoleFilter(value);
          setPage(1);
        }}
        statusOptions={STATUS_FILTER_OPTIONS}
        statusFilter={statusFilter}
        onStatusFilterChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Ngày tham gia</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableBodySkeleton rows={6} columns={6} />
            ) : (
              <>
            {paginatedMembers.map(member => {
                const memberUser = userLookup.get(`usr-${member.userId}`);
                const roleLabels = memberRoleLabels(member, memberUser);

                return (
                  <tr key={member.id} className={styles.memberRow}>
                    <td className={styles.memberPrimary}>
                      <div className={styles.memberCell}>
                        <UserAvatar
                          userId={`usr-${member.userId}`}
                          email={member.userEmail}
                          name={member.userName}
                          avatarUrl={memberUser?.avatarUrl}
                          size={32}
                          className={teamStyles.avatarToken}
                          style={{ fontSize: "0.875rem" }}
                        />
                        <strong className={styles.memberName} title={member.userName}>
                          {member.userName}
                        </strong>
                      </div>
                    </td>
                    <td className={styles.emailCell} data-label="Email" title={member.userEmail}>
                      {member.userEmail}
                    </td>
                    <td className={styles.roleCell} data-label="Vai trò">
                      <RoleTags labels={roleLabels} className={styles.roleTags} />
                    </td>
                    <td className={styles.joinedCell} data-label="Ngày tham gia">
                      {new Date(member.joinedAt).toLocaleDateString("vi-VN")}
                    </td>
                    <td className={styles.statusCell} data-label="Trạng thái">
                      <StatusPill
                        label={member.isActive ? "Hoạt động" : "Tạm dừng"}
                        tone={member.isActive ? "on-track" : "critical"}
                      />
                    </td>
                    <td className={styles.actionCell}>
                      {canManageMembers && member.userId.toString() !== viewerId.replace("usr-", "") && (
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
                  </tr>
                );
            })}
            {filteredMembers.length === 0 && (
              <tr>
                <td className={styles.tableEmpty}>
                  {hasActiveFilters ? "Không tìm thấy thành viên phù hợp" : "Chưa có thành viên nào"}
                </td>
              </tr>
            )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {filteredMembers.length > 0 ? (
        <TablePagination
          className={styles.paginationBar}
          page={validPage}
          pageSize={MEMBERS_PER_PAGE}
          total={filteredMembers.length}
          totalPages={totalPages}
          onPageChange={setPage}
          itemLabel="thành viên"
        />
      ) : null}
    </Surface>
  );
}
