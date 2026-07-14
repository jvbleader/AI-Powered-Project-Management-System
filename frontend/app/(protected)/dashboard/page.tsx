"use client";

import { useEffect, useMemo, useState } from "react";

import { ProjectScopeSelect } from "@/components/project-scope-select";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useAuthSession } from "@/hooks/use-session";
import { normalizeViewer } from "@/lib/mock/permissions";
import { dashboardApi, projectApi } from "@/services/api";
import type { DashboardOverview, Project, WorkspaceShellData } from "@/types";
import { ProjectDashboardOverview } from "./_components/project-dashboard-overview";

type DashboardState = {
  overview: DashboardOverview;
  projects: Project[];
};

export default function DashboardPage() {
  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dashboardState, setDashboardState] = useState<DashboardState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      const { data: projects } = await projectApi.list(undefined, viewer);
      const projectId = selectedProjectId ?? projects[0]?.id;
      const { data: overview } = await dashboardApi.getOverview(viewer, projectId);

      if (isCancelled) {
        return;
      }

      setSelectedProjectId(projectId ?? null);
      setDashboardState({
        overview,
        projects,
      });
    }

    void loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [selectedProjectId, viewer]);

  const overview = dashboardState?.overview ?? null;
  const projectList = dashboardState?.projects ?? [];
  const selectedProject = overview?.project ?? null;
  const selectedProjectValue = selectedProjectId ?? selectedProject?.id ?? "";
  const canManageScope =
    viewer.role === "ADMIN" ||
    viewer.role === "MANAGER" ||
    viewer.role === "LEADER" ||
    projectList.some((project) => project.managerId === viewer.id);
  const missingLogwork =
    overview?.workloadBoard.length
      ? Math.max(
          0,
          overview.workloadBoard.length -
            Math.round((overview.workloadBoard.length * overview.logworkCoverage) / 100),
        )
      : 0;
  const shellData: WorkspaceShellData = {
    currentUser: viewer,
    activeProjects: projectList.filter((project) => project.status === "ACTIVE").length,
    openTasks: overview?.openTasksInScope ?? 0,
    missingLogwork,
    alertCount: overview?.criticalAlerts ?? 0,
  };

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Dashboard dự án"
      subheading="Tập trung vào chỉ số và biểu đồ quan trọng nhất."
      highlightLabel="Scope"
      highlightValue={canManageScope ? "Management" : "Personal"}
      assistantProjectId={selectedProjectValue || selectedProject?.id || null}
      headerAction={
        <ProjectScopeSelect
          label="Dự án đang theo dõi"
          value={selectedProjectValue}
          onChange={(value) => setSelectedProjectId(value || null)}
          disabled={!projectList.length}
          options={projectList.map((project) => ({
            value: project.id,
            label: project.name,
          }))}
        />
      }
    >
      <ProjectDashboardOverview overview={overview} />
    </WorkspaceShell>
  );
}
