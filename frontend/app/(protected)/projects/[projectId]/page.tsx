"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useParams, useSearchParams } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { dashboardApi, projectApi, sprintApi, taskApi, workspaceApi, userApi } from "@/services/api";
import { canManageProjectMembership, canManageProjectSprints, isAdminRole } from "@/lib/utils/format";
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
  const viewer = session?.currentUser as UserProfile;

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
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [canAddProjectMember, setCanAddProjectMember] = useState(false);

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
    if (activeTab !== "members") {
      setIsAddingMember(false);
    }
  }, [activeTab]);

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
    ? canManageProjectMembership(viewer, state.project)
    : false;
  const canManageSprints = state
    ? canManageProjectSprints(viewer, state.project)
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
  }

  return (
    <WorkspaceShell
      shellData={shellData}
      heading={state?.project.name ?? "Chi tiết dự án"}
      subheading={state?.project.code ?? "Đang tải dữ liệu..."}
      highlightLabel="Số lượng Task"
      highlightValue={`${state?.tasks.length ?? 0}`}
      noScroll={activeTab === "gantt" || activeTab === "kanban"}
    >
      <div style={{ marginBottom: "0.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.25rem", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexWrap: "wrap" }}>
          <button 
            type="button" 
            className="secondary-button" 
            onClick={() => router.push("/projects")}
            style={{ 
              padding: 0, 
              width: "44px", 
              height: "44px", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              borderRadius: "50%",
              flexShrink: 0
            }}
            title="Quay lại danh sách Dự án"
            aria-label="Quay lại danh sách Dự án"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>

          {state && (
            <div
              style={{
                display: "flex",
                gap: "0.12rem",
                padding: "0.3rem",
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
                        minHeight: 38,
                        padding: "0.5rem 1rem",
                        borderRadius: "999px",
                        border: isActive
                          ? "1px solid rgba(37, 99, 235, 0.18)"
                          : "1px solid transparent",
                        background: isActive
                          ? "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(239,246,255,0.96))"
                          : "transparent",
                        color: isActive ? "var(--primary-dark)" : "var(--foreground-muted)",
                        fontSize: "0.9rem",
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
          )}
        </div>

        {state && (activeTab === "gantt" || activeTab === "kanban") && (
          <div style={{ display: "flex", flexDirection: "row", gap: "0.5rem", alignItems: "center", marginLeft: "auto" }}>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setDefaultParentTaskId("");
                setIsCreateModalOpen(true);
              }}
              style={{ fontWeight: 600, fontSize: "0.9rem", padding: "0.5rem 1rem", minHeight: 38 }}
            >
              + Tạo Task mới
            </button>
            {state.project.projectType === "agile" && activeTab === "kanban" && canManageSprints && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsCreateSprintModalOpen(true)}
                style={{ fontWeight: 500, fontSize: "0.9rem", padding: "0.5rem 1rem", minHeight: 38 }}
              >
                + Tạo Sprint mới
              </button>
            )}
          </div>
        )}

        {state && activeTab === "members" && canAddProjectMember && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setIsAddingMember(true)}
            style={{ fontWeight: 600, fontSize: "0.9rem", padding: "0.5rem 1rem", minHeight: 38, marginLeft: "auto" }}
          >
            + Thêm thành viên
          </button>
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

          {activeTab === "overview" && (
            <ProjectDashboardOverview
              overview={state.dashboardOverview}
              canViewLogwork={canManageProjectMembers}
            />
          )}

          {activeTab === "gantt" && (
            <>

              {state.tasks.length > 0 ? (
                <section style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: 0 }}>
                  <div style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
                  </div>
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
            <section style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: 0 }}>
              <div style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <ProjectKanbanBoard
                  tasks={state.tasks}
                  sprints={state.sprints}
                  selectedSprintId={selectedSprintId}
                  viewerId={String(viewer.id)}
                  onSelectedSprintIdChange={handleSelectedSprintIdChange}
                  onTaskClick={(taskId) => {
                    setSelectedTaskId(taskId);
                    setIsTaskDetailModalOpen(true);
                  }}
                  canManageSprints={canManageSprints}
                  onEditSprint={
                    canManageSprints
                      ? (sprintId) => {
                          const sprint = state.sprints.find((s) => String(s.id) === String(sprintId));
                          if (sprint) {
                            setSprintToEdit(sprint);
                            setIsCreateSprintModalOpen(true);
                          }
                        }
                      : undefined
                  }
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
              accessibleUsers={state.users}
              project={state.project}
              isAdding={isAddingMember}
              onAddingChange={setIsAddingMember}
              onCanManageChange={setCanAddProjectMember}
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
          onClose={() => setIsTaskDetailModalOpen(false)}
          showGoToProject={false}
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
          canManage={canManageSprints}
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
