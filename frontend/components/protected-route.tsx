"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { restoreSession, signOut } from "@/lib/auth/session";
import { useAuthSession } from "@/lib/auth/use-session";

import styles from "./styles/auth-shell.module.css";

type GuardStatus = "checking" | "ready";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useAuthSession();
  const [guardStatus, setGuardStatus] = useState<GuardStatus>("checking");

  useEffect(() => {
    let isCancelled = false;

    async function verifySession() {
      setGuardStatus("checking");

      try {
        await restoreSession();

        if (!isCancelled) {
          setGuardStatus("ready");
        }
      } catch {
        await signOut();

        if (!isCancelled) {
          router.replace("/login");
        }
      }
    }

    void verifySession();

    return () => {
      isCancelled = true;
    };
  }, [router]);

  if (guardStatus !== "ready" || !session) {
    return (
      <main className={styles.screen}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <strong>Đang kiểm tra đăng nhập</strong>
            <p>Hệ thống đang xác minh phiên làm việc trước khi mở không gian quản lý.</p>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
