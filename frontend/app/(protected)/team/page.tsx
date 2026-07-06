"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, Surface, StatusPill } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { taskApi, userApi, workspaceApi } from "@/lib/api";
import { updateSessionCurrentUser } from "@/lib/auth/session";
import { useAuthSession } from "@/lib/auth/use-session";
import { normalizeViewer } from "@/lib/mock/permissions";
import { formatDateTime, roleLabel, userStatusLabel } from "@/lib/utils/format";
import type {
  EnrichedTask,
  PaginatedUsers,
  UserDirectoryFilters,
  UserProfile,
  UserRole,
  UserStatus,
  WorkspaceShellData,
} from "@/types/dto";

import styles from "./styles/team.module.css";

const ROLE_OPTIONS: UserRole[] = ["ADMIN", "MANAGER", "LEADER", "MEMBER"];
const STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "SUSPENDED", "LOCKED"];
const PAGE_SIZE_OPTIONS = [6, 8, 12];

const EMPTY_DIRECTORY: PaginatedUsers = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 8,
  totalPages: 1,
};

function getStatusTone(status: UserStatus) {
  if (status === "ACTIVE") {
    return "on-track" as const;
  }

  if (status === "SUSPENDED") {
    return "watch" as const;
  }

  return "critical" as const;
}

function getRoleTone(role: UserRole) {
  if (role === "ADMIN") {
    return "critical" as const;
  }

  if (role === "MANAGER" || role === "LEADER") {
    return "accent" as const;
  }

  return "neutral" as const;
}

export default function TeamPage() {
  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const currentActor = useMemo(() => session?.currentUser ?? viewer, [session?.currentUser, viewer]);
  const [shellData, setShellData] = useState<WorkspaceShellData>({
    currentUser: viewer,
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
  const [pageSize, setPageSize] = useState(8);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<UserStatus>("ACTIVE");
  const [roleDraft, setRoleDraft] = useState<UserRole[]>(["MEMBER"]);
  const [reloadKey, setReloadKey] = useState(0);

  const canManageUsers = currentActor.role === "ADMIN";

  useEffect(() => {
    let isCancelled = false;

    async function loadStaticData() {
      try {
        const [{ data: nextShellData }, { data: nextUsers }, { data: nextTasks }] = await Promise.all([
          workspaceApi.getShellData(currentActor),
          userApi.list(currentActor),
          taskApi.getEnrichedBoard(undefined, currentActor),
        ]);

        if (isCancelled) {
          return;
        }

        setShellData(nextShellData);
        setAllUsers(nextUsers);
        setTaskBoard(nextTasks);
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : "Không thể tải danh sách người dùng.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadStaticData();

    return () => {
      isCancelled = true;
    };
  }, [currentActor, reloadKey]);

  useEffect(() => {
    let isCancelled = false;

    async function loadDirectory() {
      try {
        const { data } = await userApi.listDirectory(
          {
            search,
            status: statusFilter,
            role: roleFilter,
            page,
            pageSize,
          },
          currentActor,
        );

        if (isCancelled) {
          return;
        }

        setDirectory(data);
        if (data.page !== page) {
          setPage(data.page);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : "Không thể tải bảng người dùng.");
        }
      }
    }

    void loadDirectory();

    return () => {
      isCancelled = true;
    };
  }, [currentActor, page, pageSize, reloadKey, roleFilter, search, statusFilter]);

  const summary = useMemo(() => {
    const active = allUsers.filter((user) => user.status === "ACTIVE").length;
    const suspended = allUsers.filter((user) => user.status === "SUSPENDED").length;
    const locked = allUsers.filter((user) => user.status === "LOCKED").length;

    return {
      total: allUsers.length,
      active,
      suspended,
      locked,
    };
  }, [allUsers]);

  const taskSummaryByUserId = useMemo(() => {
    return taskBoard.reduce<Record<string, { total: number; open: number; blocked: number }>>((summary, task) => {
      const entry = summary[task.assigneeId] ?? { total: 0, open: 0, blocked: 0 };
      entry.total += 1;
      if (task.status !== "DONE") {
        entry.open += 1;
      }
      if (task.status === "BLOCKED") {
        entry.blocked += 1;
      }
      summary[task.assigneeId] = entry;
      return summary;
    }, {});
  }, [taskBoard]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) {
      return null;
    }

    return (
      allUsers.find((user) => user.id === selectedUserId) ??
      directory.items.find((user) => user.id === selectedUserId) ??
      null
    );
  }, [allUsers, directory.items, selectedUserId]);

  const selectedUserTaskSummary = selectedUser
    ? taskSummaryByUserId[selectedUser.id] ?? { total: 0, open: 0, blocked: 0 }
    : { total: 0, open: 0, blocked: 0 };

  function patchUser(updatedUser: UserProfile) {
    setAllUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
    setDirectory((current) => ({
      ...current,
      items: current.items.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
    }));

    if (session?.currentUser?.email && session.currentUser.email.toLowerCase() === updatedUser.email.toLowerCase()) {
      updateSessionCurrentUser({
        ...session.currentUser,
        ...updatedUser,
      });
    }
  }

  async function handleSaveStatus() {
    if (!selectedUser) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsSavingStatus(true);

    try {
      const { data: updatedUser } = await userApi.updateStatus(
        {
          userId: selectedUser.id,
          status: statusDraft,
        },
        session?.currentUser ?? viewer,
      );

      patchUser(updatedUser);
      setReloadKey((current) => current + 1);
      setNotice(`Đã cập nhật trạng thái của ${updatedUser.name} trong chế độ preview frontend.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể cập nhật trạng thái.");
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function handleSaveRoles() {
    if (!selectedUser) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsSavingRoles(true);

    try {
      const { data: updatedUser } = await userApi.updateRoles(
        {
          userId: selectedUser.id,
          roles: roleDraft,
        },
        session?.currentUser ?? viewer,
      );

      patchUser(updatedUser);
      setReloadKey((current) => current + 1);
      setNotice(`Đã cập nhật vai trò của ${updatedUser.name} trong chế độ preview frontend.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể cập nhật vai trò.");
    } finally {
      setIsSavingRoles(false);
    }
  }

  function toggleRole(role: UserRole) {
    setRoleDraft((current) => {
      if (current.includes(role)) {
        const nextRoles = current.filter((value) => value !== role);
        return nextRoles.length ? nextRoles : ["MEMBER"];
      }

      return [...current, role];
    });
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
        <section className={styles.previewBanner}>
          <div>
            <span className="kicker">Frontend Preview</span>
            <h2>Bảng quản trị người dùng đã được dựng xong ở phía giao diện</h2>
            <p>Dữ liệu hiện được lọc, phân trang và cập nhật trong frontend. Các API backend tương ứng mình sẽ ghi ra file Markdown để bạn duyệt trước khi triển khai.</p>
          </div>
          <div className={styles.summaryPills}>
            <StatusPill label={`${summary.active} hoạt động`} tone="on-track" />
            <StatusPill label={`${summary.suspended} tạm dừng`} tone="watch" />
            <StatusPill label={`${summary.locked} khóa`} tone="critical" />
          </div>
        </section>

        <div className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <span>Tổng người dùng</span>
            <strong>{summary.total}</strong>
            <p>Trong phạm vi hiển thị hiện tại của tài khoản đăng nhập.</p>
          </article>
          <article className={styles.metricCard}>
            <span>Trang hiện tại</span>
            <strong>{directory.page}/{directory.totalPages}</strong>
            <p>Mỗi trang đang hiển thị {directory.pageSize} bản ghi.</p>
          </article>
          <article className={styles.metricCard}>
            <span>Tìm kiếm</span>
            <strong>{search.trim() ? `"${search.trim()}"` : "Tất cả"}</strong>
            <p>Hỗ trợ tên, email, phòng ban và mã định danh.</p>
          </article>
        </div>

        <Surface title="Bộ lọc danh sách" kicker="Search & Pagination" className={styles.filterSurface}>
          <div className={styles.filterGrid}>
            <label className={styles.filterField}>
              <span>Tìm nhanh</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Tên, email hoặc mã người dùng"
              />
            </label>

            <label className={styles.filterField}>
              <span>Trạng thái</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as UserDirectoryFilters["status"]);
                  setPage(1);
                }}
              >
                <option value="ALL">Tất cả trạng thái</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {userStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Vai trò</span>
              <select
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value as UserDirectoryFilters["role"]);
                  setPage(1);
                }}
              >
                <option value="ALL">Tất cả vai trò</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Kích thước trang</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} dòng
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Surface>

        <Surface title="Bảng người dùng" kicker="Directory Table" className={styles.tableSurface}>
          {directory.items.length ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Người dùng</th>
                      <th>Mã</th>
                      <th>Liên hệ</th>
                      <th>Vai trò</th>
                      <th>Trạng thái</th>
                      <th>Tải việc</th>
                      <th>Cập nhật</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {directory.items.map((user) => {
                      const summaryByUser = taskSummaryByUserId[user.id] ?? { total: 0, open: 0, blocked: 0 };

                      return (
                        <tr key={user.id}>
                          <td>
                            <button type="button" className={styles.userCellButton} onClick={() => {
                              setSelectedUserId(user.id);
                              setStatusDraft(user.status ?? "ACTIVE");
                              setRoleDraft(user.roles?.length ? user.roles : [user.role]);
                              setNotice(null);
                              setError(null);
                            }}>
                              <span className={styles.avatarToken}>
                                {user.avatarUrl ? (
                                  <Image src={user.avatarUrl} alt={user.name} width={40} height={40} className="avatar-image" unoptimized />
                                ) : (
                                  user.initials
                                )}
                              </span>
                              <span className={styles.userCellCopy}>
                                <strong>{user.name}</strong>
                                <small>{user.jobTitle ?? user.title}</small>
                              </span>
                            </button>
                          </td>
                          <td>{user.employeeCode ?? user.id}</td>
                          <td>
                            <div className={styles.contactCell}>
                              <span>{user.email}</span>
                              <small>{user.phoneNumber || "Chưa có số điện thoại"}</small>
                            </div>
                          </td>
                          <td>
                            <div className={styles.roleStack}>
                              {(user.roles?.length ? user.roles : [user.role]).map((role) => (
                                <StatusPill key={role} label={roleLabel(role)} tone={getRoleTone(role)} />
                              ))}
                            </div>
                          </td>
                          <td>
                            <StatusPill label={userStatusLabel(user.status ?? "ACTIVE")} tone={getStatusTone(user.status ?? "ACTIVE")} />
                          </td>
                          <td>
                            <div className={styles.contactCell}>
                              <span>{summaryByUser.open} task mở</span>
                              <small>{summaryByUser.blocked} task blocked</small>
                            </div>
                          </td>
                          <td>{user.lastUpdatedAt ? formatDateTime(user.lastUpdatedAt) : "Chưa có"}</td>
                          <td>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                setSelectedUserId(user.id);
                                setStatusDraft(user.status ?? "ACTIVE");
                                setRoleDraft(user.roles?.length ? user.roles : [user.role]);
                                setNotice(null);
                                setError(null);
                              }}
                            >
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={styles.paginationBar}>
                <p>
                  Hiển thị {(directory.page - 1) * directory.pageSize + 1} - {Math.min(directory.page * directory.pageSize, directory.total)} trên tổng {directory.total} người dùng.
                </p>
                <div className={styles.paginationActions}>
                  <button type="button" className="secondary-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={directory.page <= 1}>
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setPage((current) => Math.min(directory.totalPages, current + 1))}
                    disabled={directory.page >= directory.totalPages}
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title={isLoading ? "Đang tải danh sách người dùng" : "Không tìm thấy người dùng phù hợp"}
              description={
                isLoading
                  ? "Hệ thống đang dựng dữ liệu preview cho màn quản lý người dùng."
                  : "Thử đổi từ khóa tìm kiếm hoặc bỏ bớt bộ lọc để xem nhiều kết quả hơn."
              }
            />
          )}
        </Surface>
      </div>

      {selectedUser ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedUserId(null)}>
          <section
            className={`password-modal employee-modal ${styles.detailModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="password-modal-header">
              <div>
                <span className="eyebrow">Chi tiết người dùng</span>
                <h2 id="user-detail-title">{selectedUser.name}</h2>
                <p>{selectedUser.email}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedUserId(null)} aria-label="Đóng">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className={styles.detailLayout}>
              <section className={styles.detailPanel}>
                <div className={styles.detailIdentity}>
                  <span className={styles.detailAvatar}>
                    {selectedUser.avatarUrl ? (
                      <Image src={selectedUser.avatarUrl} alt={selectedUser.name} width={84} height={84} className="avatar-image" unoptimized />
                    ) : (
                      selectedUser.initials
                    )}
                  </span>
                  <div>
                    <strong>{selectedUser.name}</strong>
                    <p>{selectedUser.jobTitle ?? selectedUser.title}</p>
                  </div>
                </div>

                <div className={styles.detailFacts}>
                  <article>
                    <span>Mã định danh</span>
                    <strong>{selectedUser.employeeCode ?? selectedUser.id}</strong>
                  </article>
                  <article>
                    <span>Phòng ban</span>
                    <strong>{selectedUser.department || "Chưa cập nhật"}</strong>
                  </article>
                  <article>
                    <span>Số điện thoại</span>
                    <strong>{selectedUser.phoneNumber || "Chưa cập nhật"}</strong>
                  </article>
                  <article>
                    <span>Địa chỉ</span>
                    <strong>{selectedUser.address || "Chưa cập nhật"}</strong>
                  </article>
                </div>

                <div className={styles.detailFacts}>
                  <article>
                    <span>Tổng task</span>
                    <strong>{selectedUserTaskSummary.total}</strong>
                  </article>
                  <article>
                    <span>Task mở</span>
                    <strong>{selectedUserTaskSummary.open}</strong>
                  </article>
                  <article>
                    <span>Task blocked</span>
                    <strong>{selectedUserTaskSummary.blocked}</strong>
                  </article>
                  <article>
                    <span>Cập nhật gần nhất</span>
                    <strong>{selectedUser.lastUpdatedAt ? formatDateTime(selectedUser.lastUpdatedAt) : "Chưa có"}</strong>
                  </article>
                </div>
              </section>

              <section className={styles.detailPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <span className="kicker">Trạng thái truy cập</span>
                    <h3>Quản trị trạng thái</h3>
                  </div>
                  <StatusPill label={userStatusLabel(statusDraft)} tone={getStatusTone(statusDraft)} />
                </div>

                <div className={styles.optionGrid}>
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`${styles.optionButton} ${statusDraft === status ? styles.optionButtonActive : ""}`}
                      onClick={() => setStatusDraft(status)}
                      disabled={!canManageUsers}
                    >
                      <strong>{userStatusLabel(status)}</strong>
                      <small>
                        {status === "ACTIVE"
                          ? "Người dùng được truy cập bình thường."
                          : status === "SUSPENDED"
                            ? "Tạm khóa quyền truy cập trong thời gian ngắn."
                            : "Khóa tài khoản cho tới khi được mở lại."}
                      </small>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSaveStatus}
                  disabled={!canManageUsers || isSavingStatus || statusDraft === (selectedUser.status ?? "ACTIVE")}
                >
                  {isSavingStatus ? "Đang lưu..." : "Lưu trạng thái"}
                </button>

                <div className={styles.panelHeader}>
                  <div>
                    <span className="kicker">Vai trò hệ thống</span>
                    <h3>Gán hoặc thu hồi quyền</h3>
                  </div>
                </div>

                <div className={styles.roleChecklist}>
                  {ROLE_OPTIONS.map((role) => {
                    const checked = roleDraft.includes(role);

                    return (
                      <label key={role} className={styles.roleOption}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(role)}
                          disabled={!canManageUsers}
                        />
                        <span>
                          <strong>{roleLabel(role)}</strong>
                          <small>
                            {role === "ADMIN"
                              ? "Toàn quyền quản trị người dùng."
                              : role === "MANAGER"
                                ? "Điều phối danh sách và theo dõi nguồn lực."
                                : role === "LEADER"
                                  ? "Giám sát nhóm và phân phối công việc."
                                  : "Vai trò vận hành cơ bản."}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSaveRoles}
                  disabled={
                    !canManageUsers ||
                    isSavingRoles ||
                    JSON.stringify(roleDraft.slice().sort()) === JSON.stringify((selectedUser.roles?.length ? selectedUser.roles : [selectedUser.role]).slice().sort())
                  }
                >
                  {isSavingRoles ? "Đang lưu..." : "Lưu vai trò"}
                </button>

                {!canManageUsers ? (
                  <p className={styles.helperText}>Tài khoản hiện tại chỉ có quyền xem. Chỉ `ADMIN` mới được thay đổi trạng thái và vai trò.</p>
                ) : null}
                {error ? <p className="form-error">{error}</p> : null}
                {notice ? <p className="form-success">{notice}</p> : null}
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
