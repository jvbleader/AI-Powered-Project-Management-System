
import { roleLabel } from "@/lib/utils/format";
import type { UserRole, Department } from "@/types";
import styles from "../styles/team.module.css";

const ROLE_OPTIONS: UserRole[] = ["ADMIN", "MANAGER", "LEADER", "MEMBER"];

interface AddUserModalProps {
  isOpen: boolean;
  departments: Department[];
  onClose: () => void;
  addName: string;
  onAddNameChange: (value: string) => void;
  addEmail: string;
  onAddEmailChange: (value: string) => void;
  addDepartment: string;
  onAddDepartmentChange: (value: string) => void;
  addRole: UserRole;
  onAddRoleChange: (value: UserRole) => void;
  addPassword: string;
  onAddPasswordChange: (value: string) => void;
  isAdmin: boolean;
  onIsAdminChange: (value: boolean) => void;
  isAddingUser: boolean;
  onSave: () => void;
  error: string | null;
}

export function AddUserModal({
  isOpen,
  departments,
  onClose,
  addName,
  onAddNameChange,
  addEmail,
  onAddEmailChange,
  addDepartment,
  onAddDepartmentChange,
  addRole,
  onAddRoleChange,
  addPassword,
  onAddPasswordChange,
  isAdmin,
  onIsAdminChange,
  isAddingUser,
  onSave,
  error,
}: AddUserModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`password-modal ${styles.addModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="password-modal-header">
          <div>
            <span className="eyebrow">Tài khoản mới</span>
            <h2 id="add-user-title">Thêm nhân sự</h2>
            <p>Khởi tạo thông tin cơ bản cho nhân viên mới.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form
          className={styles.addForm}
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <label className={styles.filterField}>
            <span>Họ và tên</span>
            <input
              type="text"
              value={addName}
              onChange={(e) => onAddNameChange(e.target.value)}
              placeholder="Nhập họ và tên đầy đủ"
              required
            />
          </label>

          <label className={styles.filterField}>
            <span>Email</span>
            <input
              type="email"
              value={addEmail}
              onChange={(e) => onAddEmailChange(e.target.value)}
              placeholder="Nhập địa chỉ email"
              required
            />
          </label>

          <label className={styles.filterField}>
            <span>Phòng ban</span>
            <select
              value={addDepartment}
              onChange={(e) => onAddDepartmentChange(e.target.value)}
            >
              <option value="">-- Chọn phòng ban --</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterField}>
            <span>Chức danh (Vai trò)</span>
            <select
              value={addRole}
              onChange={(e) => {
                const role = e.target.value as UserRole;
                onAddRoleChange(role);
                if (role === "ADMIN") {
                  onIsAdminChange(true);
                } else {
                  onIsAdminChange(false);
                }
              }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterField}>
            <span>Mật khẩu khởi tạo</span>
            <input
              type="text"
              value={addPassword}
              onChange={(e) => onAddPasswordChange(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
            />
          </label>

          <label className={styles.roleOption} style={{ marginTop: "0.5rem" }}>
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => {
                const checked = e.target.checked;
                onIsAdminChange(checked);
                if (checked) {
                  onAddRoleChange("ADMIN");
                } else if (addRole === "ADMIN") {
                  onAddRoleChange("MEMBER");
                }
              }}
            />
            <span>
              <strong>Cấp quyền Quản trị viên (Admin)</strong>
              <small>Người dùng sẽ có toàn quyền truy cập hệ thống.</small>
            </span>
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className={styles.addActions}>
            <button type="button" className="secondary-button" onClick={onClose}>
              Hủy bỏ
            </button>
            <button type="submit" className="primary-button" disabled={isAddingUser}>
              {isAddingUser ? "Đang tạo..." : "Xác nhận tạo mới"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
