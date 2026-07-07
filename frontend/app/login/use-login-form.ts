import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { signIn, STORAGE_KEY } from "@/services/auth/session";
import {
  clearRememberedLogin,
  readRememberedLogin,
  readRememberedLoginSnapshot,
  removeLegacyRememberedPassword,
  storeRememberedLogin,
  subscribeToRememberedLogin,
} from "@/services/auth/remember-login";

function getServerRememberedLoginSnapshot() {
  return null;
}

export function useLoginForm() {
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

  const handleRememberChange = (checked: boolean) => {
    setRememberInput(checked);
    if (!checked) {
      clearRememberedLogin();
    }
  };

  const togglePasswordVisibility = () => {
    setIsPasswordVisible((current) => !current);
  };

  const handleSubmit = (event: React.FormEvent) => {
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
  };

  return {
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
  };
}
