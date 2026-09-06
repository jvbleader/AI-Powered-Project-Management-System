import { UserAvatar } from "@/components/user-avatar";
import { EmptyState, Surface, StatusPill } from "@/components/ui";
import { RoleTags } from "@/components/role-tags";
import { TableBodySkeleton } from "@/components/loading-state";
import { userStatusLabel } from "@/lib/utils/format";
import type { PaginatedUsers, UserStatus, UserProfile } from "@/types";
import { TablePagination } from "@/components/table-pagination";
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
      className={`${styles.tableSurface} filtered-list-table`}
      aside={
        canManageUsers && (
          <button type="button" className="primary-button" onClick={onAddUserClick}>
            + Thêm nhân sự
          </button>
        )
      }
    >
      {isLoading || directory.items.length > 0 ? (
        <>
          <div className={`${styles.tableWrap} table-scroll`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Mã</th>
                  <th>Email</th>
                  <th className={styles.roleCell}>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Phòng ban</th>
                  <th>Số điện thoại</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableBodySkeleton rows={8} columns={8} />
                ) : (
                  directory.items.map((user) => {
                  return (
                    <tr key={user.id}>
                      <td>
                        <button
                          type="button"
                          className={styles.userCellButton}
                          onClick={() => onUserSelect(user)}
                        >
                          <UserAvatar
                            userId={user.id}
                            email={user.email}
                            name={user.name}
                            avatarUrl={user.avatarUrl}
                            size={24}
                            className={styles.avatarToken}
                          />
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
                      <td className={styles.roleCell}>
                        <RoleTags
                          className={styles.roleStack}
                          roles={user.roles?.length ? user.roles : user.role}
                        />
                      </td>
                      <td>
                        <StatusPill
                          label={userStatusLabel(user.status ?? "ACTIVE")}
                          tone={getStatusTone(user.status ?? "ACTIVE")}
                        />
                      </td>
                      <td>
                        <div className={styles.contactCell}>
                          <span>{user.department || "Chưa có"}</span>
                        </div>
                      </td>
                      <td>{user.phoneNumber || "Chưa có"}</td>
                      <td>
                        <button
                          type="button"
                          className={`secondary-button ${styles.detailButton}`}
                          onClick={() => onUserSelect(user)}
                        >
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && directory.total > 0 ? (
            <TablePagination
              page={page}
              pageSize={directory.pageSize}
              total={directory.total}
              totalPages={directory.totalPages}
              onPageChange={onPageChange}
              itemLabel="người dùng"
            />
          ) : null}
        </>
      ) : (
        <EmptyState
          title="Không tìm thấy người dùng phù hợp"
          description="Thử đổi từ khóa tìm kiếm hoặc bỏ bớt bộ lọc để xem nhiều kết quả hơn."
        />
      )}
    </Surface>
  );
}
