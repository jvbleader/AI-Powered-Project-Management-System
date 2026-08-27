"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useAuthSession } from "@/hooks/use-session";
import { canManageUsers } from "@/lib/utils/format";
import { RoleAdminPanel } from "../team/_components/role-admin-panel";
import styles from "../team/styles/team.module.css";

export default function RolesPage() {
  const session = useAuthSession();
  const router = useRouter();
  const currentUser = session?.currentUser;
  const canManage = canManageUsers(currentUser?.role ?? "", currentUser?.isAdmin);

  useEffect(() => {
    if (currentUser && !canManage) {
      router.replace("/dashboard");
    }
  }, [canManage, currentUser, router]);

  if (!currentUser || !canManage) {
    return null;
  }

  return (
    <WorkspaceShell
      shellData={{
        currentUser,
        activeProjects: 0,
        openTasks: 0,
        missingLogwork: 0,
        alertCount: 0,
      }}
      heading="Quản lí vai trò"
      subheading="Xem và cập nhật toàn bộ vai trò hệ thống, bao gồm quyền Admin."
      highlightLabel="Roles"
      highlightValue=""
    >
      <div className={styles.pageStack}>
        <RoleAdminPanel />
      </div>
    </WorkspaceShell>
  );
}
