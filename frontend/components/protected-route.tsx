"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  restoreSession,
  readSessionSnapshot,
  clearLocalSession,
  consumeIntentionalLogout,
} from "@/services/auth/session";
import { NETWORK_ERROR_MESSAGE } from "@/services/api/core";
import { useAuthSession } from "@/hooks/use-session";

type GuardStatus = "checking" | "ready";

function redirectWhenUnauthenticated() {
  if (consumeIntentionalLogout()) {
    window.location.assign("/login");
    return;
  }

  window.location.assign("/unauthorized");
}

function isTransientRestoreError(error: unknown) {
  return error instanceof Error && error.message === NETWORK_ERROR_MESSAGE;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  const hasCachedSession = Boolean(session);
  const [guardStatus, setGuardStatus] = useState<GuardStatus>(
    hasCachedSession ? "ready" : "checking",
  );
  const redirectingRef = useRef(false);

  const rejectSession = () => {
    if (redirectingRef.current) {
      return;
    }

    redirectingRef.current = true;
    clearLocalSession();
    redirectWhenUnauthenticated();
  };

  useEffect(() => {
    let isCancelled = false;

    async function verifySession() {
      try {
        await restoreSession();

        if (!isCancelled) {
          setGuardStatus("ready");
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        // Lỗi mạng tạm thời: giữ snapshot local, không đẩy unauthorized / không logout API.
        if (readSessionSnapshot() && isTransientRestoreError(error)) {
          setGuardStatus("ready");
          return;
        }

        rejectSession();
      }
    }

    const handleSessionExpired = () => {
      if (isCancelled) {
        return;
      }

      rejectSession();
    };

    window.addEventListener("flowpilot-session-expired", handleSessionExpired);
    void verifySession();

    return () => {
      isCancelled = true;
      window.removeEventListener("flowpilot-session-expired", handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    // Chỉ redirect khi đã xác minh xong mà session bị xóa (logout tab khác / force logout).
    // Không redirect trong lúc đang checking — tránh race khi remount / chuyển tab.
    if (guardStatus === "ready" && !session && !redirectingRef.current) {
      rejectSession();
    }
  }, [guardStatus, session]);

  return <>{children}</>;
}
