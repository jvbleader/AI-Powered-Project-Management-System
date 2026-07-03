"use client";

export const REMEMBERED_LOGIN_KEY = "flowpilot-remembered-login";
export const REMEMBERED_LOGIN_CHANGE_EVENT = "flowpilot-remembered-login-change";

export type RememberedLogin = {
  email: string;
  remember: boolean;
};

function emitRememberedLoginChange() {
  window.dispatchEvent(new Event(REMEMBERED_LOGIN_CHANGE_EVENT));
}

export function subscribeToRememberedLogin(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(REMEMBERED_LOGIN_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(REMEMBERED_LOGIN_CHANGE_EVENT, onStoreChange);
  };
}

export function readRememberedLoginSnapshot() {
  return window.localStorage.getItem(REMEMBERED_LOGIN_KEY);
}

export function readRememberedLogin() {
  const rawSnapshot = readRememberedLoginSnapshot();

  if (!rawSnapshot) {
    return null;
  }

  try {
    const parsedSnapshot = JSON.parse(rawSnapshot) as RememberedLogin;
    const email = parsedSnapshot.email?.trim();

    if (!email) {
      return null;
    }

    return {
      email,
      remember: parsedSnapshot.remember ?? true,
    };
  } catch {
    return null;
  }
}

export function storeRememberedLogin(credentials: RememberedLogin) {
  const email = credentials.email.trim();

  if (!email) {
    clearRememberedLogin();
    return;
  }

  window.localStorage.setItem(
    REMEMBERED_LOGIN_KEY,
    JSON.stringify({ email, remember: Boolean(credentials.remember) }),
  );
  emitRememberedLoginChange();
}

export function clearRememberedLogin() {
  window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
  emitRememberedLoginChange();
}

export function removeLegacyRememberedPassword() {
  const rawSnapshot = readRememberedLoginSnapshot();

  if (!rawSnapshot) {
    return;
  }

  try {
    const parsedSnapshot = JSON.parse(rawSnapshot) as { email?: string; password?: unknown };
    if (!("password" in parsedSnapshot)) {
      return;
    }

    const email = parsedSnapshot.email?.trim();
    if (email) {
      storeRememberedLogin({ email, remember: true });
    } else {
      clearRememberedLogin();
    }
  } catch {
    clearRememberedLogin();
  }
}
