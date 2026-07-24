"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { projectApi, taskApi, userApi, workspaceApi } from "@/services/api";
import { updateSessionCurrentUser } from "@/services/auth/session";
import { useAuthSession } from "@/hooks/use-session";
import { normalizeViewer } from "@/lib/mock/permissions";
import {
  canAccessTeamDirectoryRole,
  canManageUsers as canManageUsersByRole,
  hasCompanywideProjectAccess,
  ROLE_ADMIN,
} from "@/lib/utils/format";
import type {
  EnrichedTask,
  PaginatedUsers,
  UserDirectoryFilters,
  UserProfile,
  UserRole,
  UserStatus,
  WorkspaceShellData,
  Department,
} from "@/types";

import styles from "./styles/team.module.css";
import { TeamFilter } from "./_components/team-filter";
import { UserTable } from "./_components/user-table";
import { UserDetailModal } from "./_components/user-detail-modal";
import { AddUserModal } from "./_components/add-user-modal";

const EMPTY_DIRECTORY: PaginatedUsers = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

export default function TeamPage() {
  const session = useAuthSession();
  const currentActor = useMemo(
    () => normalizeViewer(session?.currentUser as UserProfile),
    [session?.currentUser],
  );
  const [shellData, setShellData] = useState<WorkspaceShellData>({
    currentUser: currentActor,
    activeProjects: 0,
    openTasks: 0,
    missingLogwork: 0,
    alertCount: 0,
  });
  const [directory, setDirectory] = useState<PaginatedUsers>(EMPTY_DIRECTORY);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [taskBoard, setTaskBoard] = useState<EnrichedTask[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserDirectoryFilters["status"]>("ALL");
  const [roleFilter, setRoleFilter] = useState<UserDirectoryFilters["role"]>("ALL");
  const [departmentFilter, setDepartmentFilter] =
    useState<UserDirectoryFilters["department"]>("ALL");
  const [pageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<UserStatus>("ACTIVE");
  const [roleDraft, setRoleDraft] = useState<UserRole[]>(["Lập trình viên"]);
  const [departmentDraft, setDepartmentDraft] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);

  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addDepartment, setAddDepartment] = useState("");
  const [addRole, setAddRole] = useState<UserRole>("Lập trình viên");
  const [addPassword, setAddPassword] = useState("123456");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [canAccessTeamPage, setCanAccessTeamPage] = useState<boolean | null>(
    canAccessTeamDirectoryRole(currentActor.role, currentActor.department) ? true : null,
  );
  const canManageUsers = canManageUsersByRole(currentActor.role);
  const canFilterDepartment = hasCompanywideProjectAccess(currentActor.role, currentActor.department) || canManageUsers;
  const router = useRouter();

  useEffect(() => {
    let isCancelled = false;

    async function resolveTeamAccess() {
      if (canAccessTeamDirectoryRole(currentActor.role, currentActor.department)) {
        setCanAccessTeamPage(true);
        return;
      }

      try {
        const { data: projects } = await projectApi.list(undefined, currentActor);
        if (!isCancelled) {
          setCanAccessTeamPage(projects.some((project) => project.managerId === currentActor.id));
        }
      } catch {
        if (!isCancelled) {
          setCanAccessTeamPage(false);
        }
      }
    }

    void resolveTeamAccess();

    return () => {
      isCancelled = true;
    };
  }, [currentActor]);

  useEffect(() => {
    if (canAccessTeamPage === false) {
      router.push("/dashboard");
    }
  }, [canAccessTeamPage, router]);

  useEffect(() => {
    if (canAccessTeamPage !== true) {
      return;
    }

    let isCancelled = false;
    async function loadStaticData() {
      try {
        const [
          { data: nextShellData },
          { data: nextUsers },
          { data: nextTasks },
          { data: nextDepartments },
        ] = await Promise.all([
          workspaceApi.getShellData(currentActor),
          userApi.list(currentActor),
          taskApi.getEnrichedBoard(undefined, currentActor),
          userApi.getDepartments(),
        ]);

        if (isCancelled) return;
        setShellData(nextShellData);
        setAllUsers(nextUsers);
        setTaskBoard(nextTasks);
        setDepartments(nextDepartments);
      } catch (loadError) {
        if (!isCancelled)
          setError(
            loadError instanceof Error ? loadError.message : "Không thể tải danh sách người dùng.",
          );
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    void loadStaticData();
    return () => {
      isCancelled = true;
    };
  }, [canAccessTeamPage, currentActor, reloadKey]);

  useEffect(() => {
    if (canAccessTeamPage !== true) {
      return;
    }

    let isCancelled = false;
    async function loadDirectory() {
      try {
        const { data } = await userApi.listDirectory(
          {
            search,
            status: statusFilter,
            role: roleFilter,
            department: canFilterDepartment ? departmentFilter : (currentActor.department ?? "ALL"),
            page,
            pageSize,
          },
          currentActor,
        );
        if (isCancelled) return;
        setDirectory(data);
        if (data.page !== page) setPage(data.page);
      } catch (loadError) {
        if (!isCancelled)
          setError(
            loadError instanceof Error ? loadError.message : "Không thể tải bảng người dùng.",
          );
      }
    }
    void loadDirectory();
    return () => {
      isCancelled = true;
    };
  }, [canAccessTeamPage, currentActor, page, pageSize, reloadKey, roleFilter, departmentFilter, search, statusFilter]);

  const taskSummaryByUserId = useMemo(() => {
    return taskBoard.reduce<Record<string, { total: number; open: number; inProgress: number }>>(
      (summary, task) => {
        const entry = summary[task.assigneeId] ?? { total: 0, open: 0, inProgress: 0 };
        entry.total += 1;
        if (task.status !== "DONE") entry.open += 1;
        if (task.status === "IN_PROGRESS") entry.inProgress += 1;
        summary[task.assigneeId] = entry;
        return summary;
      },
      {},
    );
  }, [taskBoard]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return (
      allUsers.find((user) => user.id === selectedUserId) ??
      directory.items.find((user) => user.id === selectedUserId) ??
      null
    );
  }, [allUsers, directory.items, selectedUserId]);

  const selectedUserTaskSummary = selectedUser
    ? (taskSummaryByUserId[selectedUser.id] ?? { total: 0, open: 0, inProgress: 0 })
    : { total: 0, open: 0, inProgress: 0 };

  function patchUser(updatedUser: UserProfile) {
    setAllUsers((current) =>
      current.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
    );
    setDirectory((current) => ({
      ...current,
      items: current.items.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
    }));
    if (
      session?.currentUser?.email &&
      session.currentUser.email.toLowerCase() === updatedUser.email.toLowerCase()
    ) {
      updateSessionCurrentUser({ ...session.currentUser, ...updatedUser });
    }
  }

  async function handleSaveStatus() {
    if (!selectedUser) return;
    setError(null);
    setNotice(null);
    setIsSavingStatus(true);
    try {
      const { data: updatedUser } = await userApi.updateStatus(
        { userId: selectedUser.id, status: statusDraft },
        currentActor,
      );
      patchUser(updatedUser);
      setReloadKey((c) => c + 1);
      setNotice(`Đã cập nhật trạng thái của ${updatedUser.name} thành công.`);
      setSelectedUserId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể cập nhật trạng thái.");
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function handleSaveRoles() {
    if (!selectedUser) return;
    setError(null);
    setNotice(null);
    setIsSavingRoles(true);
    try {
      const { data: updatedUser } = await userApi.updateRoles(
        { userId: selectedUser.id, roles: roleDraft, department: departmentDraft },
        currentActor,
      );
      patchUser(updatedUser);
      setReloadKey((c) => c + 1);
      setNotice(`Đã cập nhật chức danh của ${updatedUser.name} thành công.`);
      setSelectedUserId(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Không thể cập nhật quyền truy cập.",
      );
    } finally {
      setIsSavingRoles(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    setError(null);
    setNotice(null);
    setIsResettingPassword(true);
    try {
      await userApi.resetPassword({ email: selectedUser.email, newPassword: "123456" });
      setNotice(
        `Đã khôi phục mật khẩu của ${selectedUser.name || selectedUser.email} về mặc định (123456).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đặt lại mật khẩu.");
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleAddUser() {
    if (!addName.trim() || !addEmail.trim()) {
      setError("Vui lòng nhập đầy đủ Họ tên và Email.");
      return;
    }
    setError(null);
    setNotice(null);
    setIsAddingUser(true);
    try {
      const response = await userApi.create({
        name: addName.trim(),
        email: addEmail.trim(),
        role: addRole,
        isAdmin: addRole === ROLE_ADMIN,
        password: addPassword || "123456",
        department: addDepartment,
      });
      const newUser = response.data;
      setAllUsers((current) => [newUser, ...current]);
      setReloadKey((c) => c + 1);
      setNotice(`Đã thêm tài khoản cho ${newUser.name} thành công.`);
      setIsAddModalOpen(false);
      setAddName("");
      setAddEmail("");
      setAddDepartment("");
      setAddRole("Lập trình viên");
      setAddPassword("123456");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể thêm nhân sự.");
    } finally {
      setIsAddingUser(false);
    }
  }

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Danh sách người dùng"
      subheading="Giao diện bảng hỗ trợ tìm kiếm nhanh, phân trang và thao tác quản trị tài khoản theo đúng luồng vận hành."
      highlightLabel="Users"
      highlightValue={`${directory.total}`}
    >
      <div className={styles.pageStack}>
        <TeamFilter
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          statusFilter={statusFilter}
          onStatusFilterChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          roleFilter={roleFilter}
          onRoleFilterChange={(v) => {
            setRoleFilter(v);
            setPage(1);
          }}
          departmentFilter={departmentFilter}
          onDepartmentFilterChange={(v) => {
            setDepartmentFilter(v);
            setPage(1);
          }}
          departments={departments}
          canFilterDepartment={canFilterDepartment}
          currentDepartment={currentActor.department || ""}
        />

        <UserTable
          directory={directory}
          taskSummaryByUserId={taskSummaryByUserId}
          isLoading={isLoading}
          canManageUsers={canManageUsers}
          page={page}
          onPageChange={setPage}
          onAddUserClick={() => setIsAddModalOpen(true)}
          onUserSelect={(user) => {
            setSelectedUserId(user.id);
            setStatusDraft(user.status ?? "ACTIVE");
            setRoleDraft(user.roles?.length ? user.roles : [user.role]);
            setDepartmentDraft(user.department ?? "");
            setNotice(null);
            setError(null);
          }}
        />
      </div>

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          departments={departments}
          taskSummary={selectedUserTaskSummary}
          canManageUsers={canManageUsers}
          onClose={() => setSelectedUserId(null)}
          statusDraft={statusDraft}
          onStatusDraftChange={setStatusDraft}
          roleDraft={roleDraft}
          onRoleDraftChange={setRoleDraft}
          departmentDraft={departmentDraft}
          onDepartmentDraftChange={setDepartmentDraft}
          isSavingStatus={isSavingStatus}
          onSaveStatus={handleSaveStatus}
          isSavingRoles={isSavingRoles}
          onSaveRoles={handleSaveRoles}
          isResettingPassword={isResettingPassword}
          onResetPassword={handleResetPassword}
          error={error}
          notice={notice}
        />
      )}

      <AddUserModal
        isOpen={isAddModalOpen}
        departments={departments}
        onClose={() => setIsAddModalOpen(false)}
        addName={addName}
        onAddNameChange={setAddName}
        addEmail={addEmail}
        onAddEmailChange={setAddEmail}
        addDepartment={addDepartment}
        onAddDepartmentChange={setAddDepartment}
        addRole={addRole}
        onAddRoleChange={setAddRole}
        addPassword={addPassword}
        onAddPasswordChange={setAddPassword}
        isAddingUser={isAddingUser}
        onSave={handleAddUser}
        error={error}
      />
    </WorkspaceShell>
  );
}
