"use client";

import { PasswordField } from "@/components/password-field";
import { useLoginForm } from "./use-login-form";
import styles from "./styles/login-form.module.css";

export default function LoginForm() {
  const {
    email,
    password,
    rememberMe,
    isPasswordVisible,
    error,
    isPending,
    setEmailInput,
    setPasswordInput,
    handleRememberChange,
    togglePasswordVisibility,
    handleSubmit,
  } = useLoginForm();

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span>Email</span>
        <input
          value={email}
          onChange={(event) => setEmailInput(event.target.value)}
          required
          type="email"
          placeholder="Nhập email của bạn"
        />
      </label>

      <label className={styles.field}>
        <span>Password</span>
        <PasswordField
          value={password}
          onChange={(event) => setPasswordInput(event.target.value)}
          required
          isVisible={isPasswordVisible}
          onToggleVisibility={togglePasswordVisibility}
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
        />
      </label>

      <div className={styles.formOptions}>
        <label className={styles.rememberOption}>
          <input
            checked={rememberMe}
            onChange={(event) => handleRememberChange(event.target.checked)}
            type="checkbox"
          />
          <span>Ghi nhớ đăng nhập</span>
        </label>
      </div>

      <button className="primary-button" type="submit" disabled={isPending}>
        {isPending ? "Đang khởi tạo không gian làm việc..." : "Đăng nhập"}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
