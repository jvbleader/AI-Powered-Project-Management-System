"use client";

import { useAuthSession } from "@/hooks/use-session";
import { LogworkApprovalsClient } from "./logwork-approvals-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function LogworkApprovalsPage() {
  const session = useAuthSession();

  if (!session?.currentUser) {
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
