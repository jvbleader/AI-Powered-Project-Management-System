"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useParams, useSearchParams } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SectionHeader } from "@/components/section-header";
import { dashboardApi, projectApi, sprintApi, taskApi, workspaceApi, userApi } from "@/services/api";
import { canManageProjectMembership, isAdminRole } from "@/lib/utils/format";
import { useAuthSession, PENDING_USER } from "@/hooks/use-session";
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

type SearchParamsLike = {
  entries(): IterableIterator<[string, string]>;
};

function resolveProjectDetailTab(value: string | null): ProjectDetailTab {
  if (value === "overview" || value === "gantt" || value === "kanban" || value === "members") {
    return value;
  }
  return "overview";
}

function resolveProjectTaskTab(projectType: string | null | undefined): ProjectDetailTab {
  return projectType === "waterfall" ? "gantt" : "kanban";
}

function buildProjectDetailHref(
  projectId: string,
  tab: ProjectDetailTab,
  preserve?: { highlightTaskId?: string | null; highlightColor?: string | null },
) {
  const params = new URLSearchParams({ tab });
  if (preserve?.highlightTaskId) {
    params.set("highlightTaskId", preserve.highlightTaskId);
  }
  if (preserve?.highlightColor) {
    params.set("highlightColor", preserve.highlightColor);
  }
  return `/projects/${projectId}?${params.toString()}`;
}

function buildNormalizedHref(pathname: string, params: SearchParamsLike | URLSearchParams) {
  const normalized = new URLSearchParams();
  const entries = Array.from(params.entries()).sort(([keyA, valueA], [keyB, valueB]) => {
    if (keyA === keyB) {
      return valueA.localeCompare(valueB);
    }
    return keyA.localeCompare(keyB);
  });

  entries.forEach(([key, value]) => normalized.append(key, value));

  const query = normalized.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function normalizeHref(href: string) {
  const url = new URL(href, "http://localhost");
  return buildNormalizedHref(url.pathname, url.searchParams);
}

function UserPlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = typeof params?.projectId === "string" ? params.projectId : "";
  const searchTab = searchParams.get("tab");
  const highlightTaskId = searchParams.get("highlightTaskId");
  const highlightColor = searchParams.get("highlightColor");
  const currentHref = buildNormalizedHref(pathname, searchParams);
  const requestedTab = resolveProjectDetailTab(searchTab);

  const session = useAuthSession();
  const viewer = session?.currentUser ?? PENDING_USER;

  const [state, setState] = useState<ProjectDetailState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateSprintModalOpen, setIsCreateSprintModalOpen] = useState(false);
  const [sprintToEdit, setSprintToEdit] = useState<Sprint | null>(null);
  const [defaultParentTaskId, setDefaultParentTaskId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedSprintState, setSelectedSprintState] = useState<{ projectId: string; sprintId: string | null }>({
    projectId,
    sprintId: null,
  });
  const [isTaskDetailModalOpen, setIsTaskDetailModalOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  const selectedSprintId =
    selectedSprintState.projectId === projectId ? selectedSprintState.sprintId : null;

  const handleSelectedSprintIdChange = (sprintId: string | null) => {
    setSelectedSprintState({ projectId, sprintId });
  };

  let activeTab: ProjectDetailTab = requestedTab;
  if (state?.project) {
    const taskTab = resolveProjectTaskTab(state.project.projectType);
    const isWaterfall = state.project.projectType === "waterfall";

    if (highlightTaskId && requestedTab !== taskTab) {
      activeTab = taskTab;
    } else if (isWaterfall && requestedTab === "kanban") {
      activeTab = taskTab;
    } else if (!isWaterfall && requestedTab === "gantt") {
      activeTab = taskTab;
    }
  }

  useEffect(() => {
    if (!state?.project || !projectId) return;

    const nextHref = buildProjectDetailHref(projectId, activeTab, {
      highlightTaskId,
      highlightColor,
    });

    if (normalizeHref(nextHref) !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
  }, [
    activeTab,
    currentHref,
    highlightColor,
    highlightTaskId,
    projectId,
    router,
    state?.project,
  ]);

  useEffect(() => {
    let isCancelled = false;

    async function loadProjectDetails() {
      if (!projectId || !viewer.id) return;

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
    ? canManageProjectMembership(viewer, state.project)
    : false;
  const canManageProjectMembers = state
    ? isAdminRole(viewer.role) || canManageProjectMembership(viewer, state.project)
    : false;

  function handleTabChange(tab: ProjectDetailTab) {
    if (!projectId) {
      return;
    }

    const nextHref = buildProjectDetailHref(projectId, tab);
    if (normalizeHref(nextHref) !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
    if (tab !== "members") {
      setIsAddMemberOpen(false);
    }
  }

  const projectTabs = state
    ? (state.project.projectType === "waterfall"
        ? [
            { id: "overview" as const, label: "Tổng quan" },
            { id: "gantt" as const, label: "Gantt Chart" },
            { id: "members" as const, label: "Thành viên" },
          ]
        : [
            { id: "overview" as const, label: "Tổng quan" },
            { id: "kanban" as const, label: "Kanban & Backlog" },
            { id: "members" as const, label: "Thành viên" },
          ]
      ).map((tab) => ({
        ...tab,
        href: projectId ? buildProjectDetailHref(projectId, tab.id) : "#",
      }))
    : [];

  return (
    <WorkspaceShell
      shellData={shellData}
      heading={state?.project.name ?? "Chi tiết dự án"}
      subheading={state?.project.code ?? "Đang tải dữ liệu..."}
      highlightLabel="Số lượng Task"
      highlightValue={`${state?.tasks.length ?? 0}`}
      fillViewport={activeTab === "gantt"}
    >
      {error ? (
        <Surface title="Lỗi">
          <EmptyState title="Không thể hiển thị" description={error} />
        </Surface>
      ) : (
        <div
          className="page-section-stack"
          style={{
            flex: activeTab === "gantt" ? 1 : undefined,
            minHeight: activeTab === "gantt" ? 0 : undefined,
            overflow: activeTab === "gantt" ? "hidden" : undefined,
            gap: activeTab === "gantt" ? 0 : undefined,
          }}
        >
          {state ? (
            <SectionHeader
              ariaLabel="Điều hướng chi tiết dự án"
              tabs={projectTabs}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              primaryAction={
                activeTab === "members" ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setIsAddMemberOpen(true)}
                  >
                    <UserPlusIcon />
                    Thêm thành viên
                  </button>
                ) : activeTab === "gantt" || activeTab === "kanban" ? (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        setDefaultParentTaskId("");
                        setIsCreateModalOpen(true);
                      }}
                    >
                      + Tạo Task mới
                    </button>
                    {state.project.projectType === "agile" && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setIsCreateSprintModalOpen(true)}
                      >
                        + Tạo Sprint mới
                      </button>
                    )}
                  </>
                ) : undefined
              }
            />
          ) : null}

          {activeTab === "overview" && (
            <ProjectDashboardOverview
              overview={state?.dashboardOverview ?? null}
              isLoading={!state}
            />
          )}

          {activeTab === "gantt" && (
            <>
              {!state || state.tasks.length > 0 ? (
                <section style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
                  <GanttChart
                    tasks={state?.tasks ?? []}
                    isLoading={!state}
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
            <section style={{ flex: 1, display: "flex", height: "calc(100vh - 300px)" }}>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <ProjectKanbanBoard
                  isLoading={!state}
                  tasks={state?.tasks ?? []}
                  sprints={state?.sprints}
                  selectedSprintId={selectedSprintId}
                  viewerId={String(viewer.id)}
                  onSelectedSprintIdChange={handleSelectedSprintIdChange}
                  onTaskClick={(taskId) => {
                    setSelectedTaskId(taskId);
                    setIsTaskDetailModalOpen(true);
                  }}
                  onEditSprint={(sprintId) => {
                    const sprint = state?.sprints.find((s) => String(s.id) === String(sprintId));
                    if (sprint) {
                      setSprintToEdit(sprint);
                      setIsCreateSprintModalOpen(true);
                    }
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
                  onSprintUpdated={async () => {
                    try {
                      const [
                        { data: updatedSprints },
                        { data: updatedTasks },
                        { data: dashboardOverview },
                      ] = await Promise.all([
                        sprintApi.list({ projectId }, viewer),
                        taskApi.getEnrichedBoard({ projectId }, viewer),
                        dashboardApi
                          .getOverview(viewer, projectId)
                          .catch(() => ({ data: null as DashboardOverview | null })),
                      ]);
                      setState((prev) => prev ? { ...prev, sprints: updatedSprints, tasks: updatedTasks, dashboardOverview } : prev);
                    } catch (err) {
                      console.error("Failed to refresh sprints and tasks", err);
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
              accessibleUsers={state?.users ?? []}
              project={state?.project}
              isAddMemberOpen={isAddMemberOpen}
              onAddMemberOpenChange={setIsAddMemberOpen}
            />
          )}
        </div>
      )}

      {isCreateModalOpen && state ? (
        <CreateTaskModal
          projectId={state.project.id}
          projectName={state.project.name}
          projectType={state.project.projectType}
          currentUserId={String(viewer.id)}
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
          hideProjectLink
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
          onTaskDeleted={async () => {
            setIsTaskDetailModalOpen(false);
            setSelectedTaskId(null);
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
          sprintToEdit={sprintToEdit}
          canManage={canManageCurrentProject}
          onClose={() => {
            setIsCreateSprintModalOpen(false);
            setSprintToEdit(null);
          }}
          onSuccess={(newSprintId?: string) => {
            setIsCreateSprintModalOpen(false);
            setSprintToEdit(null);
            // Refresh sprints
            sprintApi.list({ projectId }, viewer).then(({ data }) => {
              setState((prev) => prev ? { ...prev, sprints: data } : prev);
              if (newSprintId) {
                handleSelectedSprintIdChange(newSprintId);
              }
            });
          }}
        />
      )}
    </WorkspaceShell>
  );
}
