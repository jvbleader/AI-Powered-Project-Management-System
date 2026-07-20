"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ProjectScopeSelect } from "@/components/project-scope-select";
import { WorkspaceShell } from "@/components/workspace-shell";
import { dashboardApi, projectApi, sprintApi, taskApi, workspaceApi, userApi } from "@/services/api";
import { normalizeViewer } from "@/lib/mock/permissions";
import { hasCompanywideProjectAccess, isAdminRole, isManagerRole, isLeaderRole } from "@/lib/utils/format";
import { useAuthSession } from "@/hooks/use-session";
import type {
  DashboardOverview,
  EnrichedTask,
  Project,
  WorkspaceShellData,
  UserProfile,
  Sprint,
} from "@/types";
import { GanttChart } from "../_components/gantt-chart";
import { ProjectKanbanBoard } from "../_components/project-kanban-board";
import { ProjectMembers } from "../_components/project-members";
import { CreateTaskModal } from "../_components/create-task-modal";
import { CreateSprintModal } from "../_components/create-sprint-modal";
import { TaskDetailModal } from "../../tasks/_components/task-detail-modal";
import { Surface, EmptyState } from "@/components/ui";
import { ProjectDashboardOverview } from "../../dashboard/_components/project-dashboard-overview";

type ProjectDetailState = {
  shellData: WorkspaceShellData;
  projects: Project[];
  project: Project;
  tasks: EnrichedTask[];
  users: UserProfile[];
  dashboardOverview: DashboardOverview | null;
  sprints: Sprint[];
};

type ProjectDetailTab = "overview" | "gantt" | "kanban" | "members";

function resolveProjectDetailTab(value: string | null): ProjectDetailTab {
  if (value === "overview" || value === "gantt" || value === "kanban" || value === "members") {
    return value;
  }
  return "overview";
}

function buildProjectDetailHref(projectId: string, tab: ProjectDetailTab) {
  return `/projects/${projectId}?tab=${tab}`;
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = typeof params?.projectId === "string" ? params.projectId : "";
  const searchTab = searchParams.get("tab");

  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);

  const [activeTab, setActiveTab] = useState<ProjectDetailTab>(() =>
    resolveProjectDetailTab(searchTab),
  );
  const [state, setState] = useState<ProjectDetailState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateSprintModalOpen, setIsCreateSprintModalOpen] = useState(false);
  const [defaultParentTaskId, setDefaultParentTaskId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isTaskDetailModalOpen, setIsTaskDetailModalOpen] = useState(false);

  const syncActiveTab = useEffectEvent((tab: ProjectDetailTab) => {
    setActiveTab((currentTab) => (currentTab === tab ? currentTab : tab));
  });

  useEffect(() => {
    const resolvedTab = resolveProjectDetailTab(searchTab);

    if (activeTab !== resolvedTab) {
      queueMicrotask(() => {
        syncActiveTab(resolvedTab);
      });
    }

    if (projectId && searchTab !== resolvedTab) {
      router.replace(buildProjectDetailHref(projectId, resolvedTab), { scroll: false });
    }
  }, [activeTab, projectId, router, searchTab]);

  useEffect(() => {
    let isCancelled = false;

    async function loadProjectDetails() {
      if (!projectId) return;

      try {
        const [
          { data: shellData },
          { data: projects },
          { data: project },
          { data: allTasks },
          { data: users },
          { data: dashboardOverview },
          { data: sprints },
        ] =
          await Promise.all([
            workspaceApi.getShellData(viewer),
            projectApi.list(undefined, viewer),
            projectApi.get(projectId, viewer),
            taskApi.getEnrichedBoard({ projectId }, viewer),
            userApi.list(viewer),
            dashboardApi
              .getOverview(viewer, projectId)
              .catch(() => ({ data: null as DashboardOverview | null })),
            sprintApi.list({ projectId }, viewer).catch(() => ({ data: [] as Sprint[] })),
          ]);

        if (isCancelled) return;

        setState({ shellData, projects, project, tasks: allTasks, users, dashboardOverview, sprints });
      } catch {
        if (!isCancelled) {
          setError("Lỗi khi tải chi tiết dự án.");
        }
      }
    }

    void loadProjectDetails();

    return () => {
      isCancelled = true;
    };
  }, [viewer, projectId]);

  const shellData =
    state?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);
  const canManageCurrentProject = state
    ? hasCompanywideProjectAccess(viewer.role, viewer.department) ||
      state.project.managerId?.replace("usr-", "") === String(viewer.id) ||
      isManagerRole(viewer.role) ||
      isLeaderRole(viewer.role)
    : false;
  const canManageProjectMembers = state
    ? isAdminRole(viewer.role) || state.project.managerId?.replace("usr-", "") === String(viewer.id)
    : false;
  const projectOptions = (state?.projects ?? []).map((project) => ({
    value: project.id,
    label: project.name,
  }));

  function handleTabChange(tab: ProjectDetailTab) {
    if (!projectId) {
      return;
    }

    setActiveTab(tab);

    if (tab === activeTab) {
      return;
    }

    router.replace(buildProjectDetailHref(projectId, tab), { scroll: false });
  }

  return (
    <WorkspaceShell
      shellData={shellData}
      heading={state?.project.name ?? "Chi tiết dự án"}
      subheading={state?.project.code ?? "Đang tải dữ liệu..."}
      highlightLabel="Số lượng Task"
      highlightValue={`${state?.tasks.length ?? 0}`}
      assistantProjectId={projectId || null}
      headerAction={
        <ProjectScopeSelect
          label="Chuyển dự án"
          value={projectId}
          onChange={(value) => {
            if (value && value !== projectId) {
              router.push(buildProjectDetailHref(value, activeTab));
            }
          }}
          options={projectOptions}
          disabled={!projectOptions.length}
        />
      }
    >
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="secondary-button" onClick={() => router.push("/projects")}>
          &larr; Quay lại danh sách Dự án
        </button>

        {state && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end", width: "160px" }}>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setDefaultParentTaskId("");
                setIsCreateModalOpen(true);
              }}
              style={{ fontWeight: 600, width: "100%" }}
            >
              + Tạo Task mới
            </button>
            {state.project.projectType === "agile" && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsCreateSprintModalOpen(true)}
                style={{ fontWeight: 500, fontSize: "0.875rem", width: "100%" }}
              >
                + Tạo Sprint mới
              </button>
            )}
          </div>
        )}
      </div>

      {error ? (
        <Surface title="Lỗi">
          <EmptyState title="Không thể hiển thị" description={error} />
        </Surface>
      ) : !state ? (
        <Surface title="Đang tải dữ liệu...">
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)" }}>
            Đang lấy thông tin dự án...
          </div>
        </Surface>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "1rem",
              padding: "0.5rem",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "999px",
              background: "rgba(255, 255, 255, 0.78)",
              width: "fit-content",
              maxWidth: "100%",
              overflowX: "auto",
            }}
            role="tablist"
            aria-label="Điều hướng chi tiết dự án"
          >
            {(() => {
              const tabs: Array<{ id: ProjectDetailTab; label: string }> =
                state.project.projectType === "waterfall"
                  ? [
                      { id: "overview", label: "Tổng quan" },
                      { id: "gantt", label: "Gantt Chart" },
                      { id: "members", label: "Thành viên" },
                    ]
                  : [
                      { id: "overview", label: "Tổng quan" },
                      { id: "kanban", label: "Kanban & Backlog" },
                      { id: "members", label: "Thành viên" },
                    ];

              return tabs.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <Link
                    key={tab.id}
                    href={projectId ? buildProjectDetailHref(projectId, tab.id) : "#"}
                    role="tab"
                    aria-selected={isActive}
                    aria-current={isActive ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      handleTabChange(tab.id);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 44,
                      padding: "0.7rem 1.15rem",
                      borderRadius: "999px",
                      border: isActive
                        ? "1px solid rgba(37, 99, 235, 0.18)"
                        : "1px solid transparent",
                      background: isActive
                        ? "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(239,246,255,0.96))"
                        : "transparent",
                      color: isActive ? "var(--primary-dark)" : "var(--foreground-muted)",
                      fontSize: "0.95rem",
                      fontWeight: isActive ? 600 : 500,
                      textDecoration: "none",
                      boxShadow: isActive ? "0 4px 12px rgba(37,99,235,0.06)" : "none",
                      transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    {tab.label}
                  </Link>
                );
              });
            })()}
          </div>

          {activeTab === "overview" && (
            <ProjectDashboardOverview overview={state.dashboardOverview} />
          )}

          {activeTab === "gantt" && (
            <>

              {state.tasks.length > 0 ? (
                <section style={{ flex: 1, display: "flex", height: "calc(100vh - 300px)", marginTop: "1rem" }}>
                  <GanttChart
                    tasks={state.tasks}
                    onTaskClick={(taskId) => {
                      setSelectedTaskId(taskId);
                      setIsTaskDetailModalOpen(true);
                    }}
                    onAddSubtask={(parentId) => {
                      setDefaultParentTaskId(parentId);
                      setIsCreateModalOpen(true);
                    }}
                  />
                </section>
              ) : (
                <Surface title="Tiến độ công việc">
                  <EmptyState
                    title="Chưa có công việc nào"
                    description="Dự án này chưa có task nào được khởi tạo. Tạo task mới để biểu đồ Gantt bắt đầu hiển thị timeline."
                  />
                </Surface>
              )}
            </>
          )}

          {activeTab === "kanban" && (
            <section style={{ flex: 1, display: "flex", height: "calc(100vh - 300px)", marginTop: "1rem" }}>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <ProjectKanbanBoard
                  tasks={state.tasks}
                  sprints={state.sprints}
                  viewerId={String(viewer.id)}
                  onTaskClick={(taskId) => {
                    setSelectedTaskId(taskId);
                    setIsTaskDetailModalOpen(true);
                  }}
                  onTaskUpdated={async () => {
                    try {
                      const [
                        { data: updatedTasks },
                        { data: dashboardOverview },
                      ] = await Promise.all([
                        taskApi.getEnrichedBoard({ projectId }, viewer),
                        dashboardApi
                          .getOverview(viewer, projectId)
                          .catch(() => ({ data: null as DashboardOverview | null })),
                      ]);
                      setState((prev) =>
                        prev
                          ? { ...prev, tasks: updatedTasks, dashboardOverview }
                          : prev,
                      );
                    } catch (err) {
                      console.error("Failed to refresh tasks after kanban update", err);
                    }
                  }}
                />
              </div>
            </section>
          )}



          {activeTab === "members" && (
            <ProjectMembers
              projectId={projectId}
              viewerId={String(viewer.id)}
              canManage={canManageProjectMembers}
              accessibleUsers={state.users}
              project={state.project}
            />
          )}
        </div>
      )}

      {isCreateModalOpen && state ? (
        <CreateTaskModal
          projectId={state.project.id}
          projectName={state.project.name}
          isOpen={isCreateModalOpen}
          users={state.users.filter((user) => state.project.memberIds.includes(user.id))}
          tasks={state.tasks}
          defaultParentTaskId={defaultParentTaskId}
          onClose={() => {
            setIsCreateModalOpen(false);
            setDefaultParentTaskId("");
          }}
          onSuccess={async () => {
            const [{ data: updatedTasks }, { data: dashboardOverview }] = await Promise.all([
              taskApi.getEnrichedBoard({ projectId }, viewer),
              dashboardApi
                .getOverview(viewer, projectId)
                .catch(() => ({ data: null as DashboardOverview | null })),
            ]);
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    tasks: updatedTasks,
                    dashboardOverview: dashboardOverview ?? prev.dashboardOverview,
                  }
                : null,
            );
          }}
        />
      ) : null}

      {state && (
        <TaskDetailModal
          taskId={selectedTaskId}
          isOpen={isTaskDetailModalOpen}
          onClose={() => setIsTaskDetailModalOpen(false)}
          users={state.users}
          viewerId={viewer.id}
          canManage={canManageCurrentProject}
          onTaskUpdated={async () => {
            const [{ data: updatedTasks }, { data: dashboardOverview }] = await Promise.all([
              taskApi.getEnrichedBoard({ projectId }, viewer),
              dashboardApi
                .getOverview(viewer, projectId)
                .catch(() => ({ data: null as DashboardOverview | null })),
            ]);
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    tasks: updatedTasks,
                    dashboardOverview: dashboardOverview ?? prev.dashboardOverview,
                  }
                : null,
            );
          }}
        />
      )}
      {state && (
        <CreateSprintModal
          projectId={projectId}
          projectName={state.project.name}
          isOpen={isCreateSprintModalOpen}
          onClose={() => setIsCreateSprintModalOpen(false)}
          onSuccess={() => {
            setIsCreateSprintModalOpen(false);
            window.location.reload();
          }}
        />
      )}
    </WorkspaceShell>
  );
}
