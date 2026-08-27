"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useAuthSession } from "@/hooks/use-session";
import { canManageUsers } from "@/lib/utils/format";
import { DepartmentAdminPanel } from "../team/_components/department-admin-panel";
import styles from "../team/styles/team.module.css";

export default function DepartmentsPage() {
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
      heading="Quản lí phòng ban"
      subheading="Xem và cập nhật toàn bộ phòng ban đang có trong hệ thống."
      highlightLabel="Departments"
      highlightValue=""
    >
      <div className={styles.pageStack}>
        <DepartmentAdminPanel />
      </div>
    </WorkspaceShell>
  );
}
