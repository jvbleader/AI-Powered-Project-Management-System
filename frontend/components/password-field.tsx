"use client";

import type { ChangeEventHandler } from "react";

type PasswordFieldProps = {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  isVisible: boolean;
  onToggleVisibility: () => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
};

export function PasswordField({
  value,
  onChange,
  isVisible,
  onToggleVisibility,
  required,
  minLength,
  autoComplete,
}: PasswordFieldProps) {
  return (
    <div className="password-input-shell">
      <input
        value={value}
        minLength={minLength}
        onChange={onChange}
        required={required}
        type={isVisible ? "text" : "password"}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="password-toggle-button"
        onClick={onToggleVisibility}
        aria-label={isVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={isVisible}
      >
        {isVisible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4" />
            <path d="M9.9 4.2A9.8 9.8 0 0 1 12 4c5.1 0 8.7 4.4 10 8a13 13 0 0 1-2.1 3.7" />
            <path d="M6.5 6.5A12.5 12.5 0 0 0 2 12c1.3 3.6 4.9 8 10 8a9.8 9.8 0 0 0 5-1.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8-10-8-10-8Z" />
            <path d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
