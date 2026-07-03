import { authApi } from "@/lib/api";
import { readStoredAvatar } from "@/lib/utils/avatar";
import type { AuthSession, LoginPayload } from "@/types/dto";

export const STORAGE_KEY = "flowpilot-session";
export const SESSION_STORAGE_KEY = "flowpilot-session-runtime";
export const SESSION_CHANGE_EVENT = "flowpilot-session-change";

function emitSessionChange() {
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

function clearClientSession() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function enrichSession(session: AuthSession) {
  const avatarUrl = readStoredAvatar(session.currentUser.id);

  return {
    ...session,
    currentUser: {
      ...session.currentUser,
      avatarUrl: avatarUrl ?? session.currentUser.avatarUrl,
    },
  } satisfies AuthSession;
}

function toClientSessionSnapshot(session: AuthSession) {
  return JSON.stringify({
    ...session,
    accessToken: "",
    refreshToken: "",
  } satisfies AuthSession);
}

function readStoredSessionSnapshot() {
  return window.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY);
}

function writeStoredSessionSnapshot(session: AuthSession, remember: boolean) {
  const snapshot = toClientSessionSnapshot(session);

  if (remember) {
    window.localStorage.setItem(STORAGE_KEY, snapshot);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(SESSION_STORAGE_KEY, snapshot);
  window.localStorage.removeItem(STORAGE_KEY);
}

function getStoredSessionTarget() {
  if (window.localStorage.getItem(STORAGE_KEY) !== null) {
    return "local";
  }

  if (window.sessionStorage.getItem(SESSION_STORAGE_KEY) !== null) {
    return "session";
  }

  return null;
}

function resolveRememberPreference(remember?: boolean | null) {
  if (typeof remember === "boolean") {
    return remember;
  }

  return getStoredSessionTarget() === "local";
}

export function storeSession(session: AuthSession, options?: { remember?: boolean | null }) {
  if (typeof window === "undefined") {
    return null;
  }

  const nextSession = enrichSession(session);
  writeStoredSessionSnapshot(nextSession, resolveRememberPreference(options?.remember ?? null));
  emitSessionChange();
  return nextSession;
}

export function readSessionSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  return readStoredSessionSnapshot();
}

export async function signIn(payload: LoginPayload, options?: { remember?: boolean }) {
  clearClientSession();
  const response = await authApi.login(payload, options);
  const session = enrichSession(response.data);
  return storeSession(session, { remember: Boolean(options?.remember) });
}

export async function refreshSession() {
  const response = await authApi.refresh();
  const session = enrichSession(response.data);
  return storeSession(session);
}

export async function restoreSession() {
  const response = await authApi.restoreSession();
  const session = enrichSession(response.data);
  return storeSession(session);
}

export function readSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = readSessionSnapshot();

  if (!stored) {
    return null;
  }

  try {
    return enrichSession({
      ...(JSON.parse(stored) as AuthSession),
      accessToken: "",
      refreshToken: "",
    });
  } catch {
    return null;
  }
}

export async function signOut() {
  if (typeof window !== "undefined") {
    await authApi.logout().catch(() => null);
    clearClientSession();
    emitSessionChange();
  }
}

export function isSignedIn() {
  return Boolean(readSession());
}

export function updateSessionCurrentUser(_nextUser?: AuthSession["currentUser"]) {
  if (typeof window === "undefined") {
    return;
  }

  if (!_nextUser) {
    emitSessionChange();
    return;
  }

  const currentSession = readSession();

  if (!currentSession) {
    emitSessionChange();
    return;
  }

  storeSession({
    ...currentSession,
    currentUser: _nextUser,
  });
}
