import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Surface, StatusPill } from "@/components/ui";
import { ConfirmModal } from "@/components/confirm-modal";
import { UserAvatar } from "@/components/user-avatar";
import { FilterSelect } from "@/components/filter-select";
import { projectApi, userApi } from "@/services/api";
import { useAutoPageSize } from "@/hooks/use-auto-page-size";
import { projectRoleLabel, getRoleTone, isManagerRole, isLeaderRole, expandRoleDisplayLabels, comparePersonnelByRank, formatEmployeeCode } from "@/lib/utils/format";
import styles from "../../team/styles/team.module.css";
import type { Department, UserProfile } from "@/types";
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
  isAdding?: boolean;
  onAddingChange?: (open: boolean) => void;
  onCanManageChange?: (canManage: boolean) => void;
}

export function ProjectMembers({
  projectId,
  viewerId,
  canManage,
  accessibleUsers,
  project,
  isAdding: isAddingProp,
  onAddingChange,
  onCanManageChange,
}: ProjectMembersProps) {
  const [members, setMembers] = useState<ProjectMemberItem[]>([]);
  const [roles, setRoles] = useState<ProjectRoleItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const tableAnchorRef = useRef<HTMLDivElement>(null);
  const pageSize = useAutoPageSize({
    anchorRef: tableAnchorRef,
    rowHeight: 60,
    headerHeight: 48,
    footerHeight: 80,
    min: 4,
    max: 40,
    remeasureKey: members.length,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [roleMenuPos, setRoleMenuPos] = useState<{ top: number; left: number } | null>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const roleButtonRef = useRef<HTMLButtonElement>(null);

  const availableRolesInProject = useMemo(() => {
    const presentRoleIds = new Set<string>();
    const presentRoleNames = new Set<string>();
    members.forEach((m) => {
      if (m.roleId) presentRoleIds.add(m.roleId.toString());
      if (m.roleName) presentRoleNames.add(m.roleName);
    });

    return roles.filter(
      (r) => presentRoleIds.has(r.id.toString()) || presentRoleNames.has(r.name),
    );
  }, [members, roles]);

  const toggleRoleDropdown = () => {
    if (roleDropdownOpen) {
      setRoleDropdownOpen(false);
      setRoleMenuPos(null);
    } else {
      if (roleButtonRef.current) {
        const rect = roleButtonRef.current.getBoundingClientRect();
        setRoleMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.left - 80) });
      }
      setRoleDropdownOpen(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        roleDropdownRef.current &&
        !roleDropdownRef.current.contains(event.target as Node)
      ) {
        const menuEl = document.querySelector(`[data-project-member-role-menu]`);
        if (menuEl && menuEl.contains(event.target as Node)) return;
        setRoleDropdownOpen(false);
        setRoleMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [isAddingInternal, setIsAddingInternal] = useState(false);
  const isAdding = isAddingProp ?? isAddingInternal;
  const setIsAdding = (open: boolean) => {
    if (isAddingProp === undefined) {
      setIsAddingInternal(open);
    }
    onAddingChange?.(open);
  };
  const [newDepartment, setNewDepartment] = useState<string>("");
  const [newUserId, setNewUserId] = useState<string>("");
  const [newUserRoleId, setNewUserRoleId] = useState<number>(0);
  const [candidateUsers, setCandidateUsers] = useState<UserProfile[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ProjectMemberItem | null>(null);

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
  const projectDepartmentName = project?.departmentName?.trim() || "";
  const hideInlineAddButton = typeof onAddingChange === "function";

  useEffect(() => {
    onCanManageChange?.(canManageMembers);
  }, [canManageMembers, onCanManageChange]);

  useEffect(() => {
    async function loadData() {
      try {
        const [membersRes, rolesRes, departmentsRes] = await Promise.all([
          projectApi.listMembers(projectId),
          projectApi.listRoles(),
          userApi.getDepartments().catch(() => ({ data: [] as Department[] })),
        ]);
        setMembers(membersRes.data || []);
        const loadedRoles = rolesRes.data || [];
        setRoles(loadedRoles);
        setDepartments(departmentsRes.data || []);
        setNewUserRoleId(0);
        setNewDepartment(projectDepartmentName);
      } catch {
        setError("Không thể tải danh sách thành viên.");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [projectId, projectDepartmentName]);

  useEffect(() => {
    if (!isAdding || !newDepartment) {
      setCandidateUsers([]);
      setCandidateError(null);
      return;
    }

    let cancelled = false;

    async function loadCandidates() {
      setIsLoadingCandidates(true);
      setCandidateError(null);
      try {
        const selectedRole = roles.find((r) => r.id === newUserRoleId);
        const roleName =
          newUserRoleId !== 0 && selectedRole?.name ? selectedRole.name : undefined;
        const { data } = await projectApi.listMemberCandidates(projectId, {
          department: newDepartment,
          role: roleName,
        });
        if (!cancelled) {
          setCandidateUsers(data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setCandidateUsers([]);
          setCandidateError(
            err instanceof Error
              ? err.message
              : "Không tải được danh sách người dùng để thêm.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCandidates(false);
        }
      }
    }

    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [isAdding, newDepartment, newUserRoleId, projectId, roles]);

  const handleOpenAddForm = () => {
    setNewDepartment(projectDepartmentName || departments[0]?.name || "");
    setNewUserId("");
    setNewUserRoleId(0);
    setIsAdding(true);
  };

  useEffect(() => {
    if (!isAddingProp) return;
    setNewDepartment(projectDepartmentName || departments[0]?.name || "");
    setNewUserId("");
    setNewUserRoleId(0);
    // Chỉ khởi tạo form khi mở từ header; không reset theo departments đang load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddingProp]);

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

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    const memberId = memberToRemove.id;
    setMemberToRemove(null);
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

  const poolUsers = candidateUsers.length > 0 || isAdding ? candidateUsers : accessibleUsers;
  const availableRoleNames = Array.from(new Set(poolUsers.map((u) => u.role).filter(Boolean)));
  const filteredRoles =
    availableRoleNames.length > 0
      ? roles.filter((r) => availableRoleNames.includes(r.name))
      : roles;
  const availableUsersToAdd = poolUsers.filter(
    (u) => !members.some((m) => m.isActive && m.userId.toString() === u.id.replace("usr-", "")),
  );

  const activePMCount = members.filter(m => m.isActive && m.roleName === "PROJECT_MANAGER").length;

  const filteredMembers = members
    .filter((m) => {
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
    })
    .sort((left, right) => {
      const leftUser = accessibleUsers.find(
        (user) => user.id === `usr-${left.userId}` || user.id.replace("usr-", "") === String(left.userId),
      );
      const rightUser = accessibleUsers.find(
        (user) => user.id === `usr-${right.userId}` || user.id.replace("usr-", "") === String(right.userId),
      );
      return comparePersonnelByRank(
        {
          role: left.roleName || leftUser?.role,
          department: leftUser?.department,
          name: left.userName,
        },
        {
          role: right.roleName || rightUser?.role,
          department: rightUser?.department,
          name: right.userName,
        },
      );
    });

  const paginatedMembers = filteredMembers;

  const userLookup = new Map(
    accessibleUsers.map((user) => [user.id, user]),
  );

  const handleCloseAddForm = () => {
    setIsAdding(false);
    setNewUserId("");
    setNewUserRoleId(0);
    setNewDepartment(projectDepartmentName);
    setCandidateUsers([]);
  };

  return (
    <>
    <Surface title="Danh sách thành viên">
      {canManageMembers && !hideInlineAddButton ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <button
            type="button"
            className="primary-button"
            onClick={handleOpenAddForm}
            style={{
              fontWeight: 600,
              fontSize: "0.875rem",
              padding: "0.45rem 0.85rem",
            }}
          >
            + Thêm thành viên
          </button>
        </div>
      ) : null}

      {canManageMembers && isAdding && typeof document !== "undefined"
        ? createPortal(
            <div
              role="presentation"
              onMouseDown={handleCloseAddForm}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: "1.25rem",
              }}
            >
              <section
                className={`password-modal ${styles.addModal}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-project-member-title"
                onMouseDown={(event) => event.stopPropagation()}
                style={{ overflow: "hidden" }}
              >
                <div
                  className="password-modal-header"
                  style={{
                    borderTopLeftRadius: "var(--modal-radius)",
                    borderTopRightRadius: "var(--modal-radius)",
                  }}
                >
                  <div>
                    <span className="eyebrow">Thành viên dự án</span>
                    <h2 id="add-project-member-title">Thêm thành viên</h2>
                    <p>Chọn phòng ban, người dùng và vai trò để thêm vào dự án.</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleCloseAddForm}
                    aria-label="Đóng"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>

                <form
                  className={styles.addForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAddMember();
                  }}
                >
                  <label className={styles.filterField}>
                    <span>Phòng ban</span>
                    <FilterSelect
                      value={newDepartment}
                      onChange={(dept) => {
                        setNewDepartment(dept);
                        setNewUserId("");
                      }}
                      options={[
                        { value: "", label: "Chọn phòng ban..." },
                        ...departments.map((dept) => ({
                          value: dept.name,
                          label:
                            projectDepartmentName && dept.name === projectDepartmentName
                              ? `${dept.name} (phòng dự án)`
                              : dept.name,
                        })),
                      ]}
                      placeholder="Chọn phòng ban..."
                      searchable
                      searchPlaceholder="Tìm phòng ban..."
                      size="lg"
                    />
                  </label>

                  <label className={styles.filterField}>
                    <span>Người dùng</span>
                    <FilterSelect
                      value={newUserId}
                      onChange={(selectedUserId) => {
                        setNewUserId(selectedUserId);
                        if (selectedUserId) {
                          const user = availableUsersToAdd.find((u) => u.id === selectedUserId);
                          if (user?.role) {
                            const matchedRole = roles.find((r) => r.name === user.role);
                            if (matchedRole) {
                              setNewUserRoleId(matchedRole.id);
                            }
                          }
                        }
                      }}
                      options={[
                        {
                          value: "",
                          label: isLoadingCandidates
                            ? "Đang tải người dùng..."
                            : newDepartment
                              ? "Chọn người dùng..."
                              : "Chọn phòng ban trước...",
                        },
                        ...availableUsersToAdd.map((u) => ({
                          value: u.id,
                          label: `${u.name} · ${u.email}`,
                        })),
                      ]}
                      placeholder="Chọn người dùng..."
                      searchable
                      searchPlaceholder="Tìm theo tên hoặc email..."
                      size="lg"
                      disabled={!newDepartment || isLoadingCandidates}
                    />
                    {candidateError ? (
                      <span style={{ color: "var(--status-critical)", fontSize: "0.8rem" }}>
                        {candidateError}
                      </span>
                    ) : null}
                    {!candidateError &&
                    newDepartment &&
                    !isLoadingCandidates &&
                    availableUsersToAdd.length === 0 ? (
                      <span style={{ color: "var(--foreground-muted)", fontSize: "0.8rem" }}>
                        Không còn người dùng khả dụng trong phòng ban này.
                      </span>
                    ) : null}
                  </label>

                  <label className={styles.filterField}>
                    <span>Vai trò</span>
                    <FilterSelect
                      value={String(newUserRoleId)}
                      onChange={(val) => {
                        setNewUserRoleId(Number(val));
                        setNewUserId("");
                      }}
                      options={[
                        { value: "0", label: "Tất cả vai trò" },
                        ...filteredRoles.map((r) => ({
                          value: String(r.id),
                          label: projectRoleLabel(r.name),
                        })),
                      ]}
                      placeholder="Chọn vai trò"
                      size="lg"
                    />
                  </label>

                  <div className={styles.addActions}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleCloseAddForm}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={!newUserId}
                    >
                      Thêm
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body,
          )
        : null}

      <div style={{ marginBottom: "1rem" }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Nhập tên hoặc email người dùng..."
          aria-label="Tìm kiếm thành viên"
          style={{
            width: "100%",
            maxWidth: "420px",
            padding: "0.7rem 1rem",
            borderRadius: "10px",
            border: "1.5px solid rgba(15, 23, 42, 0.18)",
            background: "var(--surface-strong)",
            color: "var(--ink)",
            outline: "none",
            boxShadow: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.45)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(15, 23, 42, 0.18)";
          }}
        />
      </div>

      <div className={styles.tableWrap} style={{ margin: "1rem 0" }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Mã NV</th>
              <th>Thành viên</th>
              <th>Email</th>
              <th>
                <div className={styles.headerFilter}>
                  <span>Vai trò</span>
                  <div className={styles.filterTriggerWrap} ref={roleDropdownRef}>
                    <button
                      type="button"
                      ref={roleButtonRef}
                      className={`${styles.filterIconButton} ${roleFilter !== "ALL" ? styles.filterIconButtonActive : ""}`}
                      onClick={toggleRoleDropdown}
                      aria-label="Lọc theo vai trò"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={roleFilter !== "ALL" ? styles.filterIconActive : styles.filterIcon}
                      >
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                    </button>
                    {roleDropdownOpen && roleMenuPos && typeof document !== "undefined"
                      ? createPortal(
                          <div
                            className={styles.dropdownMenu}
                            data-project-member-role-menu
                            style={{ top: roleMenuPos.top, left: roleMenuPos.left }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className={styles.dropdownList}>
                              <div
                                className={`${styles.dropdownItem} ${roleFilter === "ALL" ? styles.dropdownItemActive : ""}`}
                                onClick={() => {
                                  setRoleFilter("ALL");
                                  setRoleDropdownOpen(false);
                                  setRoleMenuPos(null);
                                  setPage(1);
                                }}
                              >
                                {roleFilter === "ALL" ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <div className={styles.dropdownSpacer} />
                                )}
                                Tất cả
                              </div>
                              {availableRolesInProject.map((r) => (
                                <div
                                  key={r.id}
                                  className={`${styles.dropdownItem} ${roleFilter === r.id.toString() ? styles.dropdownItemActive : ""}`}
                                  onClick={() => {
                                    setRoleFilter(r.id.toString());
                                    setRoleDropdownOpen(false);
                                    setRoleMenuPos(null);
                                    setPage(1);
                                  }}
                                >
                                  {roleFilter === r.id.toString() ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
                                    <div className={styles.dropdownSpacer} />
                                  )}
                                  {projectRoleLabel(r.name)}
                                </div>
                              ))}
                            </div>
                          </div>,
                          document.body,
                        )
                      : null}
                  </div>
                </div>
              </th>
              <th>Ngày tham gia</th>

              {canManageMembers && <th />}
            </tr>
          </thead>
          <tbody>
            {paginatedMembers.map(member => (
              (() => {
                const memberUser = userLookup.get(`usr-${member.userId}`);

                return (
                  <tr key={member.id}>
                    <td>{memberUser?.employeeCode ?? formatEmployeeCode(`usr-${member.userId}`)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <UserAvatar
                          userId={`usr-${member.userId}`}
                          email={member.userEmail}
                          name={member.userName}
                          avatarUrl={memberUser?.avatarUrl}
                          size={32}
                          className={styles.avatarToken}
                          style={{ fontSize: "0.875rem" }}
                        />
                        <strong>{member.userName}</strong>
                      </div>
                    </td>
                    <td>{member.userEmail}</td>
                    <td>
                      <div className={styles.roleStack} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                        {expandRoleDisplayLabels(member.roleName).map((rolePart, idx) => (
                          <StatusPill
                            key={idx}
                            label={rolePart}
                            tone={getRoleTone(rolePart as any)}
                            style={{ borderRadius: "10px", padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                          />
                        ))}
                      </div>
                    </td>
                    <td>{new Date(member.joinedAt).toLocaleDateString("vi-VN")}</td>

                    {canManageMembers && (
                      <td>
                        {member.userId.toString() !== viewerId.replace("usr-", "") && (
                          member.isActive ? (
                            !(isManagerRole(member.roleName) || member.roleName.includes("Manager") || member.roleName.includes("PM")) && (
                              <button
                                type="button"
                                aria-label="Gỡ bỏ thành viên"
                                disabled={!canManageMembers}
                                title="Gỡ bỏ"
                                onClick={() => setMemberToRemove(member)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 32,
                                  height: 32,
                                  padding: 0,
                                  border: "none",
                                  borderRadius: 8,
                                  background: "transparent",
                                  color: "var(--critical)",
                                  cursor: "pointer",
                                }}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden
                                >
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              className="secondary-button"
                              style={{
                                color: "var(--primary-base)",
                                borderColor: "var(--primary-base)",
                                background: "transparent",
                                padding: "0.35rem 0.7rem",
                                fontSize: "0.8rem",
                              }}
                              onClick={() => handleRestoreMember(member)}
                            >
                              Thêm lại
                            </button>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })()
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


    </Surface>
    <ConfirmModal
      isOpen={Boolean(memberToRemove)}
      onClose={() => setMemberToRemove(null)}
      onConfirm={() => void handleRemoveMember()}
      title="Gỡ thành viên khỏi dự án"
      message={
        memberToRemove
          ? `Bạn có chắc muốn tạm dừng “${memberToRemove.userName}” khỏi dự án? Thành viên này sẽ không còn truy cập dự án cho đến khi được khôi phục.`
          : ""
      }
      confirmText="Gỡ thành viên"
      cancelText="Hủy"
      isDanger
    />
    </>
  );
}
