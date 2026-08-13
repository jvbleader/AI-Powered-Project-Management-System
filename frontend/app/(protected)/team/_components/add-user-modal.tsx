import { CustomSelect } from "@/components/custom-select";
import { roleLabel, ROLE_ADMIN } from "@/lib/utils/format";
import { SYSTEM_ROLE_OPTIONS, type UserRole, type Department } from "@/types";
import styles from "../styles/team.module.css";

interface AddUserModalProps {
  isOpen: boolean;
  departments: Department[];
  roles?: { name: string }[];
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
  isAddingUser: boolean;
  onSave: () => void;
  error: string | null;
}

export function AddUserModal({
  isOpen,
  departments,
  roles,
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
        data-testid="create-user-modal"
        aria-modal="true"
        aria-labelledby="add-user-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="password-modal-header">
          <div>
            <h2 id="add-user-title">Thêm nhân sự</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form
          className={styles.addForm}
          data-testid="create-user-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <label className={styles.filterField}>
            <span>
              Họ và tên
              <span className="required-asterisk" aria-hidden="true">
                *
              </span>
            </span>
            <input
              data-testid="user-name"
              type="text"
              value={addName}
              onChange={(e) => onAddNameChange(e.target.value)}
              placeholder="Nhập họ và tên đầy đủ"
              required
            />
          </label>

          <label className={styles.filterField}>
            <span>
              Email
              <span className="required-asterisk" aria-hidden="true">
                *
              </span>
            </span>
            <input
              data-testid="user-email"
              type="email"
              value={addEmail}
              onChange={(e) => onAddEmailChange(e.target.value)}
              placeholder="Nhập địa chỉ email"
              required
            />
          </label>

          <label className={styles.filterField}>
            <span>
              Phòng ban
              <span className="required-asterisk" aria-hidden="true">
                *
              </span>
            </span>
            <CustomSelect 
              testId="user-department"
              value={addDepartment} 
              onChange={onAddDepartmentChange}
              options={[
                { value: "", label: "-- Chọn phòng ban --" },
                ...departments.map((dept) => ({ value: dept.name, label: dept.name }))
              ]}
            />
          </label>

          <label className={styles.filterField}>
            <span>
              Chức danh (Vai trò)
              <span className="required-asterisk" aria-hidden="true">
                *
              </span>
            </span>
            <CustomSelect
              testId="user-role"
              value={addRole}
              onChange={(val) => onAddRoleChange(val as UserRole)}
              options={(roles?.length ? roles.map((role) => role.name) : [...SYSTEM_ROLE_OPTIONS]).map((r) => ({
                value: r,
                label: roleLabel(r),
              }))}
            />
          </label>

          <label className={styles.filterField}>
            <span>Mật khẩu khởi tạo</span>
            <input
              data-testid="user-initial-password"
              type="text"
              value={addPassword}
              onChange={(e) => onAddPasswordChange(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
          </label>

          {addRole === ROLE_ADMIN ? (
            <p className={styles.helperText}>
              Tài khoản `Admin` chỉ dành cho IT Helpdesk để tạo tài khoản, đổi trạng thái làm việc
              và reset mật khẩu. Tài khoản này không truy cập vào dự án.
            </p>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

          <div className={styles.addActions}>
            <button type="button" className="secondary-button" onClick={onClose}>
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isAddingUser}
              data-testid="create-user-submit"
            >
              {isAddingUser ? "Đang tạo..." : "Xác nhận tạo mới"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
