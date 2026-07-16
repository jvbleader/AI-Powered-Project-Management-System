"use client";

import { useEffect, useMemo, useState } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { useAuthSession } from "@/hooks/use-session";
import { normalizeViewer } from "@/lib/mock/permissions";
import { dashboardApi } from "@/services/api";
import type { GlobalDashboardOverview as GlobalDashboardOverviewType, WorkspaceShellData } from "@/types";
import { GlobalDashboardOverview } from "./_components/global-dashboard-overview";

type DashboardState = {
  overview: GlobalDashboardOverviewType;
};

export default function DashboardPage() {
  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const [dashboardState, setDashboardState] = useState<DashboardState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      const { data: overview } = await dashboardApi.getGlobalOverview();

      if (isCancelled) {
        return;
      }

      setDashboardState({
        overview,
      });
    }

    void loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [viewer]);

  const overview = dashboardState?.overview ?? null;
  const canManageScope =
    viewer.role === "ADMIN" ||
    viewer.role === "MANAGER" ||
    viewer.role === "LEADER";

  const shellData: WorkspaceShellData = {
    currentUser: viewer,
    activeProjects: overview?.activeProjects ?? 0,
    openTasks: overview?.taskSummary.inProgress ?? 0,
    missingLogwork: 0,
    alertCount: overview?.taskSummary.overdue ?? 0,
  };

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Tổng quan toàn bộ hệ thống"
      subheading="Theo dõi tiến độ, rủi ro và khối lượng công việc của tất cả dự án."
      highlightLabel="Scope"
      highlightValue={canManageScope ? "Toàn Hệ Thống" : "Cá Nhân"}
      assistantProjectId={null}
    >
      <GlobalDashboardOverview overview={overview} />
    </WorkspaceShell>
  );
}
