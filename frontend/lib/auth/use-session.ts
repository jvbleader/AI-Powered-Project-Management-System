"use client";

import { useMemo, useSyncExternalStore } from "react";

import { readSession, readSessionSnapshot, SESSION_CHANGE_EVENT } from "@/lib/auth/session";
import type { AuthSession } from "@/types/dto";

function subscribeToSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SESSION_CHANGE_EVENT, onStoreChange);
  window.addEventListener("focus", onStoreChange);

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      onStoreChange();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SESSION_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("focus", onStoreChange);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

function getServerSessionSnapshot() {
  return null;
}

export function useAuthSession() {
  const storedSession = useSyncExternalStore(
    subscribeToSession,
    readSessionSnapshot,
    getServerSessionSnapshot,
  );

  return useMemo(() => {
    if (!storedSession) {
      return null;
    }

    return readSession() as AuthSession | null;
  }, [storedSession]);
}
