import { UserAvatar } from "@/components/user-avatar";
import { StatusPill } from "@/components/ui";
import { FilterSelect } from "@/components/filter-select";
import { ROLE_ADMIN, roleLabel, userStatusLabel } from "@/lib/utils/format";
import { SYSTEM_ROLE_OPTIONS, type UserProfile, type UserRole, type UserStatus, type Department } from "@/types";
import styles from "../styles/team.module.css";

const STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "INACTIVE"];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  "Lập trình viên": "Tham gia các dự án đã được phân công với vai trò thực thi kỹ thuật.",
  "Chuyên viên": "Thực hiện nghiệp vụ chuyên môn trong phạm vi được giao.",
  Tester: "Thực hiện kiểm thử trong các dự án được giao.",
  QA: "Theo dõi chất lượng và quy trình trong phạm vi dự án tham gia.",
  QC: "Kiểm soát chất lượng đầu ra theo phạm vi dự án tham gia.",
  "Project Manager / Product Owner / Group Member":
    "Manager / Group Manager — quản lý các dự án được giao phụ trách; Head of Dev có thể xem toàn bộ dự án.",
  Leader: "Team Leader — quản lý các dự án mà mình trực tiếp phụ trách.",
  "Trợ lý giám đốc": "Hỗ trợ giám đốc trong công tác điều hành và theo dõi dự án.",
  "Kỹ sư cầu nối": "BrSE — cầu nối kỹ thuật giữa khách hàng và đội phát triển.",
  Comtor: "Biên phiên dịch / hỗ trợ giao tiếp dự án.",
  "Giám đốc": "Có quyền xem toàn bộ dự án trong công ty.",
  HR: "Quản lý nhân sự và các nghiệp vụ hành chính liên quan.",
  Admin: "IT Helpdesk quản lý tài khoản, trạng thái làm việc và reset mật khẩu.",
};

function getStatusTone(status: UserStatus) {
  if (status === "ACTIVE") {
    return "on-track" as const;
  }
  return "critical" as const;
}

interface UserDetailModalProps {
  user: UserProfile;
  departments: Department[];
  taskSummary: { total: number; open: number; inProgress: number };
  canManageUsers: boolean;
  onClose: () => void;
  statusDraft: UserStatus;
  onStatusDraftChange: (status: UserStatus) => void;
  roleDraft: UserRole[];
  onRoleDraftChange: (roles: UserRole[]) => void;
  departmentDraft: string;
  onDepartmentDraftChange: (dept: string) => void;
  isSavingStatus: boolean;
  onSaveStatus: () => void;
  isSavingRoles: boolean;
  onSaveRoles: () => void;
  isResettingPassword: boolean;
  onResetPassword: () => void;
  error: string | null;
  notice: string | null;
}

export function UserDetailModal({
  user,
  departments,
  taskSummary,
  canManageUsers,
  onClose,
  statusDraft,
  onStatusDraftChange,
  roleDraft,
  onRoleDraftChange,
  departmentDraft,
  onDepartmentDraftChange,
  isSavingStatus,
  onSaveStatus,
  isSavingRoles,
  onSaveRoles,
  isResettingPassword,
  onResetPassword,
  error,
  notice,
}: UserDetailModalProps) {
  function toggleRole(role: UserRole) {
    onRoleDraftChange([role]);
  }

  const displayStatus = (user.status ?? "ACTIVE") as UserStatus;
  const displayRoles = user.roles?.length ? user.roles : [user.role];
  const statusDirty = statusDraft !== displayStatus;
  const rolesDirty =
    !(
      roleDraft.length === displayRoles.length &&
      roleDraft.every((r) => displayRoles.includes(r))
    ) || departmentDraft !== (user.department || "");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`password-modal employee-modal ${styles.detailModal} ${
          canManageUsers ? "" : styles.detailModalReadonly
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.detailTopBar}>
          <div className={styles.detailHero}>
            <UserAvatar
              userId={user.id}
              email={user.email}
              name={user.name}
              avatarUrl={user.avatarUrl}
              size={72}
              className={styles.detailAvatar}
            />
            <div className={styles.detailHeroCopy}>
              <span className={styles.detailEyebrow}>Chi tiết người dùng</span>
              <div className={styles.detailTitleRow}>
                <h2 id="user-detail-title">{user.name}</h2>
                <StatusPill
                  label={userStatusLabel(canManageUsers ? statusDraft : displayStatus)}
                  tone={getStatusTone(canManageUsers ? statusDraft : displayStatus)}
                />
              </div>
              <p>{user.email}</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {!canManageUsers ? (
          <div className={styles.detailReadonlyBody}>
            <div className={styles.readonlyGrid}>
              <article>
                <span>Mã định danh</span>
                <strong>{user.employeeCode ?? user.id}</strong>
              </article>
              <article>
                <span>Số điện thoại</span>
                <strong>{user.phoneNumber || "Chưa cập nhật"}</strong>
              </article>
              <article>
                <span>Phòng ban</span>
                <strong>{user.department || "Chưa cập nhật"}</strong>
              </article>
              <article>
                <span>Chức danh</span>
                <strong>{user.jobTitle ?? user.title ?? "Chưa cập nhật"}</strong>
              </article>
            </div>

            <div className={styles.detailTaskStrip}>
              <article>
                <span>Tổng task</span>
                <strong>{taskSummary.total}</strong>
              </article>
              <article>
                <span>Task mở</span>
                <strong>{taskSummary.open}</strong>
              </article>
              <article>
                <span>Đang tiến hành</span>
                <strong>{taskSummary.inProgress}</strong>
              </article>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.detailTaskStrip} style={{ padding: "0 1.35rem 1rem" }}>
              <article>
                <span>Mã định danh</span>
                <strong>{user.employeeCode ?? user.id}</strong>
              </article>
              <article>
                <span>Số điện thoại</span>
                <strong>{user.phoneNumber || "—"}</strong>
              </article>
              <article>
                <span>Tổng task</span>
                <strong>{taskSummary.total}</strong>
              </article>
              <article>
                <span>Task mở</span>
                <strong>{taskSummary.open}</strong>
              </article>
              <article>
                <span>Đang tiến hành</span>
                <strong>{taskSummary.inProgress}</strong>
              </article>
            </div>

            <div className={styles.detailLayout}>
              <section className={styles.detailPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h3>Trạng thái và mật khẩu</h3>
                  </div>
                </div>

                <div className={styles.optionGrid}>
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`${styles.optionButton} ${statusDraft === status ? styles.optionButtonActive : ""}`}
                      onClick={() => onStatusDraftChange(status)}
                    >
                      <strong>{userStatusLabel(status)}</strong>
                      <small>
                        {status === "ACTIVE" ? "Hoạt động bình thường" : "Đã ngừng hoạt động"}
                      </small>
                    </button>
                  ))}
                </div>

                <div className={styles.detailActionStack}>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={onSaveStatus}
                    disabled={isSavingStatus || !statusDirty}
                  >
                    {isSavingStatus ? "Đang lưu..." : "Lưu trạng thái"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={onResetPassword}
                    disabled={isResettingPassword}
                  >
                    {isResettingPassword ? "Đang xử lý..." : "Khôi phục mật khẩu mặc định"}
                  </button>
                </div>
              </section>

              <section className={`${styles.detailPanel} ${styles.detailPanelRoles}`}>
                <div className={styles.panelHeader}>
                  <div>
                    <h3>Phòng ban & vai trò</h3>
                  </div>
                </div>

                <label className={styles.filterField}>
                  <span>Phòng ban</span>
                  <FilterSelect
                    value={departmentDraft}
                    onChange={onDepartmentDraftChange}
                    options={[
                      { value: "", label: "-- Chọn phòng ban --" },
                      ...departments.map((dept) => ({ value: dept.name, label: dept.name })),
                    ]}
                    placeholder="Chọn phòng ban"
                    searchable
                    searchPlaceholder="Tìm phòng ban..."
                    size="lg"
                  />
                </label>

                <div className={styles.roleChecklist}>
                  {SYSTEM_ROLE_OPTIONS.map((role) => {
                    const checked = roleDraft.includes(role);

                    return (
                      <label
                        key={role}
                        className={`${styles.roleOption} ${checked ? styles.roleOptionActive : ""}`}
                      >
                        <input
                          type="radio"
                          name="roleDraft"
                          checked={checked}
                          onChange={() => toggleRole(role)}
                        />
                        <span>
                          <strong>{roleLabel(role)}</strong>
                          <small>{ROLE_DESCRIPTIONS[role] ?? "Vai trò vận hành cơ bản."}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {roleDraft[0] === ROLE_ADMIN ? (
                  <p className={styles.helperText}>
                    Admin không có quyền truy cập dự án, chỉ dùng cho luồng IT Helpdesk.
                  </p>
                ) : null}

                <button
                  type="button"
                  className="primary-button"
                  onClick={onSaveRoles}
                  disabled={isSavingRoles || !rolesDirty}
                >
                  {isSavingRoles ? "Đang lưu..." : "Lưu phòng ban & vai trò"}
                </button>
              </section>
            </div>

            {error ? <p className={`form-error ${styles.detailFeedback}`}>{error}</p> : null}
            {notice ? <p className={`form-success ${styles.detailFeedback}`}>{notice}</p> : null}
          </>
        )}
      </section>
    </div>
  );
}
