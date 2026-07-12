import Image from "next/image";
import { EmptyState, Surface, StatusPill } from "@/components/ui";
import { roleLabel, userStatusLabel } from "@/lib/utils/format";
import type { PaginatedUsers, UserRole, UserStatus, UserProfile } from "@/types";
import styles from "../styles/team.module.css";

interface UserTableProps {
  directory: PaginatedUsers;
  taskSummaryByUserId: Record<string, { total: number; open: number; inProgress: number }>;
  isLoading: boolean;
  canManageUsers: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onAddUserClick: () => void;
  onUserSelect: (user: UserProfile) => void;
}

function getStatusTone(status: UserStatus) {
  if (status === "ACTIVE") {
    return "on-track" as const;
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

export function UserTable({
  directory,
  taskSummaryByUserId,
  isLoading,
  canManageUsers,
  page,
  onPageChange,
  onAddUserClick,
  onUserSelect,
}: UserTableProps) {
  return (
    <Surface
      title="Bảng người dùng"
      kicker="Directory Table"
      className={styles.tableSurface}
      aside={
        canManageUsers && (
          <button type="button" className="primary-button" onClick={onAddUserClick}>
            + Thêm nhân sự
          </button>
        )
      }
    >
      {directory.items.length ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Mã</th>
                  <th>Email</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Công việc</th>
                  <th>Số điện thoại</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {directory.items.map((user) => {
                  const summaryByUser = taskSummaryByUserId[user.id] ?? {
                    total: 0,
                    open: 0,
                    inProgress: 0,
                  };

                  return (
                    <tr key={user.id}>
                      <td>
                        <button
                          type="button"
                          className={styles.userCellButton}
                          onClick={() => onUserSelect(user)}
                        >
                          <span className={styles.avatarToken}>
                            {user.avatarUrl ? (
                              <Image
                                src={user.avatarUrl}
                                alt={user.name}
                                width={40}
                                height={40}
                                className="avatar-image"
                                unoptimized
                              />
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
                        </div>
                      </td>
                      <td>
                        <div className={styles.roleStack}>
                          {(user.roles?.length ? user.roles : [user.role]).map((role) => (
                            <StatusPill
                              key={role}
                              label={roleLabel(role)}
                              tone={getRoleTone(role)}
                            />
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusPill
                          label={userStatusLabel(user.status ?? "ACTIVE")}
                          tone={getStatusTone(user.status ?? "ACTIVE")}
                        />
                      </td>
                      <td>
                        <div className={styles.contactCell}>
                          <span>{summaryByUser.open} task mở</span>
                          <small>{summaryByUser.inProgress} task đang tiến hành</small>
                        </div>
                      </td>
                      <td>{user.phoneNumber || "Chưa có"}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => onUserSelect(user)}
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
              Hiển thị {(directory.page - 1) * directory.pageSize + 1} -{" "}
              {Math.min(directory.page * directory.pageSize, directory.total)} trên tổng{" "}
              {directory.total} người dùng.
            </p>
            <div className={styles.paginationActions}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={directory.page <= 1}
              >
                Trang trước
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => onPageChange(Math.min(directory.totalPages, page + 1))}
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
  );
}
