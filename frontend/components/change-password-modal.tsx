import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/password-field";
import { authApi } from "@/services/api";
import { signOut } from "@/services/auth/session";
import { AuthSession } from "@/types";

type ChangePasswordModalProps = {
  session: AuthSession | null;
  onClose: () => void;
};

export function ChangePasswordModal({ session, onClose }: ChangePasswordModalProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCurrentPasswordVisible, setIsCurrentPasswordVisible] = useState(false);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleClose = () => {
    if (isChangingPassword) {
      return;
    }
    onClose();
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);

    if (!session) {
      setPasswordError("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      return;
    }

    const hasLetter = Array.from(newPassword).some(
      (character) => character.toLocaleLowerCase() !== character.toLocaleUpperCase(),
    );
    const hasNumber = Array.from(newPassword).some((character) => /\d/u.test(character));

    if (!hasLetter || !hasNumber) {
      setPasswordError("Mật khẩu phải chứa chữ cái và chữ số.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận chưa khớp.");
      return;
    }

    setIsChangingPassword(true);

    try {
      await authApi.changePassword(session, {
        currentPassword,
        newPassword,
      });

      await signOut();
      router.push("/login");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Không thể đổi mật khẩu lúc này.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <section
        className="password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="password-modal-header">
          <div>
            <span className="eyebrow">Bảo mật</span>
            <h2 id="change-password-title">Đổi mật khẩu</h2>
          </div>
          <button type="button" className="icon-button" onClick={handleClose} aria-label="Đóng">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form className="password-form" onSubmit={handleChangePassword}>
          <label>
            <span>Mật khẩu hiện tại</span>
            <PasswordField
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              isVisible={isCurrentPasswordVisible}
              onToggleVisibility={() => setIsCurrentPasswordVisible((current) => !current)}
              autoComplete="current-password"
            />
          </label>

          <label>
            <span>Mật khẩu mới</span>
            <PasswordField
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              isVisible={isNewPasswordVisible}
              onToggleVisibility={() => setIsNewPasswordVisible((current) => !current)}
              autoComplete="new-password"
            />
          </label>

          <label>
            <span>Nhập lại mật khẩu mới</span>
            <PasswordField
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              isVisible={isConfirmPasswordVisible}
              onToggleVisibility={() => setIsConfirmPasswordVisible((current) => !current)}
              autoComplete="new-password"
            />
          </label>

          {passwordError ? <p className="form-error">{passwordError}</p> : null}

          <div className="password-modal-actions">
            <button type="button" className="secondary-button" onClick={handleClose} disabled={isChangingPassword}>
              Hủy
            </button>
            <button type="submit" className="primary-button" disabled={isChangingPassword}>
              {isChangingPassword ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
