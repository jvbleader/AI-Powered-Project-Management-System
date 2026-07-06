"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";

import { PasswordField } from "@/components/password-field";
import { signIn, STORAGE_KEY } from "@/services/auth/session";
import {
  clearRememberedLogin,
  readRememberedLogin,
  readRememberedLoginSnapshot,
  removeLegacyRememberedPassword,
  storeRememberedLogin,
  subscribeToRememberedLogin,
} from "@/services/auth/remember-login";

import styles from "./styles/login-form.module.css";

function getServerRememberedLoginSnapshot() {
  return null;
}

export default function LoginForm() {
  const router = useRouter();
  const storedRememberedLogin = useSyncExternalStore(
    subscribeToRememberedLogin,
    readRememberedLoginSnapshot,
    getServerRememberedLoginSnapshot,
  );
  const rememberedLogin = useMemo(() => {
    if (!storedRememberedLogin) {
      return null;
    }

    return readRememberedLogin();
  }, [storedRememberedLogin]);
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState<string | null>(null);
  const [rememberInput, setRememberInput] = useState<boolean | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const email = emailInput ?? rememberedLogin?.email ?? "";
  const password = passwordInput ?? "";
  const rememberMe = rememberInput ?? rememberedLogin?.remember ?? false;

  useEffect(() => {
    removeLegacyRememberedPassword();
  }, []);

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key === STORAGE_KEY && event.newValue) {
        window.location.assign("/dashboard");
      }
    }
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        startTransition(async () => {
          try {
            const normalizedEmail = email.trim();

            await signIn({ email: normalizedEmail, password }, { remember: rememberMe });

            if (rememberMe) {
              storeRememberedLogin({ email: normalizedEmail, remember: true });
            } else {
              clearRememberedLogin();
            }

            router.push("/dashboard");
            router.refresh();
          } catch (error) {
            setError(error instanceof Error ? error.message : "Không thể đăng nhập. Vui lòng thử lại.");
          }
        });
      }}
    >
      <label className={styles.field}>
        <span>Email</span>
        <input
          value={email}
          onChange={(event) => setEmailInput(event.target.value)}
          required
          type="email"
        />
      </label>

      <label className={styles.field}>
        <span>Password</span>
        <PasswordField
          value={password}
          onChange={(event) => setPasswordInput(event.target.value)}
          required
          isVisible={isPasswordVisible}
          onToggleVisibility={() => setIsPasswordVisible((current) => !current)}
          autoComplete="current-password"
        />
      </label>

      <div className={styles.formOptions}>
        <label className={styles.rememberOption}>
          <input
            checked={rememberMe}
            onChange={(event) => {
              const checked = event.target.checked;

              setRememberInput(checked);

              if (!checked) {
                clearRememberedLogin();
              }
            }}
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
