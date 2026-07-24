"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthSession } from "@/hooks/use-session";
import { LogworkApprovalsClient } from "./logwork-approvals-client";
import { WorkspaceShell } from "@/components/workspace-shell";
import { canManageProjectsByRole } from "@/lib/utils/format";

export default function LogworkApprovalsPage() {
  const session = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.currentUser && !canManageProjectsByRole(session.currentUser.role, session.currentUser.department)) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  if (!session?.currentUser || !canManageProjectsByRole(session.currentUser.role, session.currentUser.department)) {
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
    >
      <div style={{ padding: "1.5rem" }}>
        <LogworkApprovalsClient />
      </div>
    </WorkspaceShell>
  );
}
