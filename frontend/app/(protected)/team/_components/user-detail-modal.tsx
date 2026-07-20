import Image from "next/image";
import { StatusPill } from "@/components/ui";
import { ROLE_ADMIN, roleLabel, userStatusLabel } from "@/lib/utils/format";
import { SYSTEM_ROLE_OPTIONS, type UserProfile, type UserRole, type UserStatus, type Department } from "@/types";
import styles from "../styles/team.module.css";

const STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "INACTIVE"];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  "Lập trình viên": "Tham gia các dự án đã được phân công với vai trò thực thi kỹ thuật.",
  Tester: "Thực hiện kiểm thử trong các dự án được giao.",
  QA: "Theo dõi chất lượng và quy trình trong phạm vi dự án tham gia.",
  QC: "Kiểm soát chất lượng đầu ra theo phạm vi dự án tham gia.",
  "Project Manager / Product Owner / Group Member":
    "Quản lý các dự án được giao phụ trách; nếu thuộc phòng Head of Dev thì có thể xem toàn bộ dự án công ty.",
  Leader: "Quản lý các dự án mà mình trực tiếp phụ trách.",
  "Giám đốc": "Có quyền xem toàn bộ dự án trong công ty.",
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

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
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
            <h2 id="user-detail-title">{user.name}</h2>
            <p>{user.email}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className={styles.detailLayout}>
          <section className={styles.detailPanel}>
            <div className={styles.detailIdentity}>
              <span className={styles.detailAvatar}>
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt={user.name}
                    width={84}
                    height={84}
                    className="avatar-image"
                    unoptimized
                  />
                ) : (
                  user.initials
                )}
              </span>
              <div>
                <strong>{user.name}</strong>
                <p>{user.jobTitle ?? user.title}</p>
              </div>
            </div>

            <div className={styles.detailFacts}>
              <article>
                <span>Mã định danh</span>
                <strong>{user.employeeCode ?? user.id}</strong>
              </article>
              <article>
                <span>Phòng ban</span>
                <strong>{user.department || "Chưa cập nhật"}</strong>
              </article>
              <article>
                <span>Số điện thoại</span>
                <strong>{user.phoneNumber || "Chưa cập nhật"}</strong>
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
                <span>Task đang tiến hành</span>
                <strong>{taskSummary.inProgress}</strong>
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
                  onClick={() => onStatusDraftChange(status)}
                  disabled={!canManageUsers}
                >
                  <strong>{userStatusLabel(status)}</strong>
                  <small>
                    {status === "ACTIVE" ? "Hoạt động bình thường" : "Đã ngừng hoạt động"}
                  </small>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={onSaveStatus}
              disabled={
                !canManageUsers || isSavingStatus || statusDraft === (user.status ?? "ACTIVE")
              }
            >
              {isSavingStatus ? "Đang lưu..." : "Lưu trạng thái"}
            </button>

            <div className={styles.panelHeader}>
              <div>
                <span className="kicker">Vai trò hệ thống & Phòng ban</span>
                <h3>Gán hoặc thu hồi quyền và cập nhật phòng ban</h3>
              </div>
            </div>

            <label className={styles.filterField} style={{ marginBottom: "1rem" }}>
              <span>Phòng ban</span>
              <select
                value={departmentDraft}
                onChange={(e) => onDepartmentDraftChange(e.target.value)}
                disabled={!canManageUsers}
              >
                <option value="">-- Chọn phòng ban --</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.roleChecklist}>
              {SYSTEM_ROLE_OPTIONS.map((role) => {
                const checked = roleDraft.includes(role);

                return (
                  <label key={role} className={styles.roleOption}>
                    <input
                      type="radio"
                      name="roleDraft"
                      checked={checked}
                      onChange={() => toggleRole(role)}
                      disabled={!canManageUsers}
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
                `Admin` không có quyền truy cập dự án, chỉ dùng cho luồng IT Helpdesk.
              </p>
            ) : null}

            <button
              type="button"
              className="primary-button"
              onClick={onSaveRoles}
              disabled={
                !canManageUsers ||
                isSavingRoles ||
                (roleDraft.length === (user.roles?.length || 1) &&
                  roleDraft.every((r) => (user.roles || [user.role]).includes(r)) &&
                  departmentDraft === (user.department || ""))
              }
            >
              {isSavingRoles ? "Đang lưu..." : "Lưu vai trò"}
            </button>

            {!canManageUsers ? (
              <p className={styles.helperText}>
                Tài khoản hiện tại chỉ có quyền xem. Chỉ `Admin` mới được thay đổi trạng thái, vai
                trò và phòng ban.
              </p>
            ) : null}

            <div className={styles.panelHeader} style={{ marginTop: "1.5rem" }}>
              <div>
                <span className="kicker">Bảo mật tài khoản</span>
                <h3>Đặt lại mật khẩu</h3>
              </div>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={onResetPassword}
              disabled={!canManageUsers || isResettingPassword}
            >
              {isResettingPassword ? "Đang xử lý..." : "Khôi phục mật khẩu mặc định"}
            </button>

            {error ? <p className="form-error">{error}</p> : null}
            {notice ? <p className="form-success">{notice}</p> : null}
          </section>
        </div>
      </section>
    </div>
  );
}
