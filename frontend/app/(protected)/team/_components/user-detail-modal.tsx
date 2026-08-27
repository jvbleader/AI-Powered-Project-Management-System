import { formatEmployeeCode } from "@/lib/utils/format";
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
  roles?: { name: string; description?: string | null }[];
  taskSummary: { total: number; open: number; inProgress: number };
  canManageUsers: boolean;
  onClose: () => void;
  statusDraft: UserStatus;
  onStatusDraftChange: (status: UserStatus) => void;
  roleDraft: UserRole[];
  onRoleDraftChange: (roles: UserRole[]) => void;
  departmentDraft: string;
  onDepartmentDraftChange: (dept: string) => void;
  isSaving: boolean;
  onSave: (statusDirty: boolean, rolesDirty: boolean) => void;
  isResettingPassword: boolean;
  onResetPassword: () => void;
  error: string | null;
  notice: string | null;
}

export function UserDetailModal({
  user,
  departments,
  roles,
  taskSummary,
  canManageUsers,
  onClose,
  statusDraft,
  onStatusDraftChange,
  roleDraft,
  onRoleDraftChange,
  departmentDraft,
  onDepartmentDraftChange,
  isSaving,
  onSave,
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
                <span>Mã nhân viên</span>
                <strong>{user.employeeCode ?? formatEmployeeCode(user.id)}</strong>
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
            <div className={styles.detailLayout} style={{ paddingTop: "1rem" }}>
              <section className={styles.detailPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h3>Thông tin chung</h3>
                  </div>
                </div>

                <div className={styles.detailFacts} style={{ marginBottom: "0.5rem" }}>
                  <article style={{ padding: "0.75rem" }}>
                    <span>Mã nhân viên</span>
                    <strong style={{ fontSize: "0.95rem" }}>{user.employeeCode ?? formatEmployeeCode(user.id)}</strong>
                  </article>
                  <article style={{ padding: "0.75rem" }}>
                    <span>Số điện thoại</span>
                    <strong style={{ fontSize: "0.95rem" }}>{user.phoneNumber || "—"}</strong>
                  </article>
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
                        {status === "ACTIVE" ? "Đang làm việc" : "Đã nghỉ việc"}
                      </small>
                    </button>
                  ))}
                </div>

                <div className={styles.panelDivider} style={{ margin: "0.5rem 0" }} />

                <label className={styles.filterField}>
                  <span style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "0.25rem", display: "block" }}>Phòng ban</span>
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

                <div className={styles.panelDivider} style={{ margin: "0.5rem 0" }} />

                <div className={styles.detailActionStack} style={{ marginTop: "auto" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={onResetPassword}
                    disabled={isResettingPassword}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {isResettingPassword ? "Đang xử lý..." : "Khôi phục mật khẩu mặc định"}
                  </button>
                </div>
              </section>

              <section className={`${styles.detailPanel} ${styles.detailPanelRoles}`}>
                <div className={styles.panelHeader}>
                  <div>
                    <h3>Vai trò hệ thống</h3>
                  </div>
                </div>

                <div className={styles.roleChecklist}>
                  {(roles?.length
                    ? roles
                    : SYSTEM_ROLE_OPTIONS.map((name) => ({
                        name,
                        description: ROLE_DESCRIPTIONS[name] ?? null,
                      }))
                  ).map((role) => {
                    const checked = roleDraft.includes(role.name);

                    return (
                      <label
                        key={role.name}
                        className={`${styles.roleOption} ${checked ? styles.roleOptionActive : ""}`}
                      >
                        <input
                          type="radio"
                          name="roleDraft"
                          checked={checked}
                          onChange={() => toggleRole(role.name)}
                        />
                        <span>
                          <strong>{roleLabel(role.name)}</strong>
                          <small>
                            {role.description?.trim() || ROLE_DESCRIPTIONS[role.name] || "Vai trò vận hành cơ bản."}
                          </small>
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

              </section>
            </div>

            <div style={{ padding: "1rem 1.35rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                Hủy
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => onSave(statusDirty, rolesDirty)}
                disabled={isSaving || (!statusDirty && !rolesDirty)}
              >
                {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>

            {error ? <p className={`form-error ${styles.detailFeedback}`}>{error}</p> : null}
            {notice ? <p className={`form-success ${styles.detailFeedback}`}>{notice}</p> : null}
          </>
        )}
      </section>
    </div>
  );
}
