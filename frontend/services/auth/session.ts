import { authApi } from "@/services/api";
import { isGeneratedDefaultAvatarUrl } from "@/lib/utils/avatar";
import { clearAssistantSessionStorage } from "@/lib/assistant-storage";
import { type AuthSession, LoginPayload } from "@/types";

export const STORAGE_KEY = "flowpilot-session-v1";
export const SESSION_STORAGE_KEY = "flowpilot-session-session-v1";
export const SESSION_CHANGE_EVENT = "flowpilot-session-change";
export const INTENTIONAL_LOGOUT_KEY = "flowpilot-intentional-logout";

const authChannel = typeof window !== "undefined" ? new BroadcastChannel('auth_channel') : null;

if (authChannel) {
  authChannel.onmessage = (event) => {
    if (event.data === "intentional_logout") {
      markIntentionalLogout();
      clearClientSession();
      emitSessionChange();
      return;
    }

    if (event.data === "logout") {
      clearClientSession();
      emitSessionChange();
    }
  };
}

export function markIntentionalLogout() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(INTENTIONAL_LOGOUT_KEY, "1");
}

export function consumeIntentionalLogout() {
  if (typeof window === "undefined") {
    return false;
  }

  const wasIntentional = window.sessionStorage.getItem(INTENTIONAL_LOGOUT_KEY) === "1";
  if (wasIntentional) {
    window.sessionStorage.removeItem(INTENTIONAL_LOGOUT_KEY);
  }

  return wasIntentional;
}

function emitSessionChange() {
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

function clearClientSession() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem("flowpilot-user-directory-v1");
  clearAssistantSessionStorage();
}

/** Xóa snapshot client, không gọi API logout / không broadcast sang tab khác. */
export function clearLocalSession() {
  if (typeof window === "undefined") {
    return;
  }

  clearClientSession();
  emitSessionChange();
}

function enrichSession(session: AuthSession) {
  const storedAvatar = session.currentUser.avatarUrl?.trim();
  return {
    ...session,
    currentUser: {
      ...session.currentUser,
      // Migrate snapshots written by older clients. A generated fallback must
      // never become browser-owned profile data; UserAvatar resolves it from ID.
      avatarUrl:
        storedAvatar && !isGeneratedDefaultAvatarUrl(storedAvatar)
          ? storedAvatar
          : undefined,
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
  return (
    window.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY)
  );
}

function writeStoredSessionSnapshot(session: AuthSession, remember: boolean) {
  const snapshot = toClientSessionSnapshot(session);

  try {
    if (remember) {
      window.localStorage.setItem(STORAGE_KEY, snapshot);
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, snapshot);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      window.localStorage.clear();
      window.sessionStorage.clear();
      if (remember) {
        window.localStorage.setItem(STORAGE_KEY, snapshot);
      } else {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, snapshot);
      }
    } else {
      throw error;
    }
  }
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

function broadcastLogout() {
  const intentional =
    window.sessionStorage.getItem(INTENTIONAL_LOGOUT_KEY) === "1";
  authChannel?.postMessage(intentional ? "intentional_logout" : "logout");
}

export async function signOut() {
  if (typeof window !== "undefined") {
    await authApi.logout().catch(() => null);
    clearClientSession();
    emitSessionChange();
    broadcastLogout();
  }
}

export async function signOutAll() {
  if (typeof window !== "undefined") {
    await authApi.logoutAll().catch(() => null);
    clearClientSession();
    emitSessionChange();
    broadcastLogout();
  }
}

export function forceSignOut() {
  if (typeof window !== "undefined") {
    clearClientSession();
    emitSessionChange();
    authChannel?.postMessage("logout");
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
