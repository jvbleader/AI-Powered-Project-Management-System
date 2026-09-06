"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useAuthSession } from "@/hooks/use-session";
import { LogworkApprovalsClient } from "./logwork-approvals-client";
import { WorkspaceShell } from "@/components/workspace-shell";
import { canAccessLogworkApprovalsRole } from "@/lib/utils/format";
import styles from "./logwork-approvals.module.css";

export default function LogworkApprovalsPage() {
  const session = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.currentUser && !canAccessLogworkApprovalsRole(session.currentUser.role)) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  if (!session?.currentUser || !canAccessLogworkApprovalsRole(session.currentUser.role)) {
    return null;
  }

  return (
    <WorkspaceShell
      shellData={{
        currentUser: session.currentUser,
        activeProjects: 0,
        openTasks: 0,
        missingLogwork: 0,
        alertCount: 0,
      }}
      heading="Duyệt Log Work"
      subheading="Quản lý và xét duyệt báo cáo thời gian làm việc"
      highlightLabel=""
      highlightValue=""
      noBottomPadding
      fillViewport
    >
      <div className={`${styles.pageWrap} filtered-list-page`}>
        <Suspense fallback={null}>
          <LogworkApprovalsClient />
        </Suspense>
      </div>
    </WorkspaceShell>
  );
}
