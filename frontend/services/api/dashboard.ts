import { DashboardOverview, UserProfile } from "@/types";

import { requestApi } from "./core";
import { mapBackendProject } from "./projects";

function normalizeTaskStatus(status: unknown): "TODO" | "IN_PROGRESS" | "DONE" {
  const normalized = typeof status === "string" ? status.trim().toUpperCase() : "TODO";

  if (normalized === "DONE") {
    return "DONE";
  }

  if (normalized === "IN_PROGRESS" || normalized === "INPROGRESS") {
    return "IN_PROGRESS";
  }

  return "TODO";
}

function mapTaskPreview(item: any) {
  return {
    id: item.id.toString(),
    key: item.key,
    title: item.title,
    status: normalizeTaskStatus(item.status),
    priority: item.priority?.toUpperCase() || "MEDIUM",
    startDate: item.startDate ?? null,
    dueDate: item.dueDate ?? null,
    assigneeName: item.assigneeName ?? null,
    sprintName: item.sprintName ?? null,
  };
}

function mapSprintSummary(item: any) {
  return {
    id: item.id.toString(),
    name: item.name,
    status: item.status,
    goal: item.goal ?? null,
    startDate: item.startDate,
    endDate: item.endDate,
    plannedProgress: item.plannedProgress ?? 0,
    actualProgress: item.actualProgress ?? 0,
    totalTasks: item.totalTasks ?? 0,
    todoCount: item.todoCount ?? 0,
    inProgressCount: item.inProgressCount ?? 0,
    doneCount: item.doneCount ?? 0,
    estimatedHours: item.estimatedHours ?? 0,
    loggedHours: item.loggedHours ?? 0,
    health: item.health ?? "on-track",
  };
}

function mapWorkloadMember(item: any) {
  return {
    userId: item.userId.toString(),
    memberId: item.memberId.toString(),
    name: item.name,
    email: item.email,
    roleName: item.roleName,
    assignedTasks: item.assignedTasks ?? 0,
    todoTasks: item.todoTasks ?? 0,
    inProgressTasks: item.inProgressTasks ?? 0,
    doneTasks: item.doneTasks ?? 0,
    overdueTasks: item.overdueTasks ?? 0,
    estimatedHours: item.estimatedHours ?? 0,
    loggedHours: item.loggedHours ?? 0,
    progress: item.progress ?? 0,
  };
}

function mapRecentLogwork(item: any) {
  return {
    id: item.id.toString(),
    taskId: item.taskId.toString(),
    taskKey: item.taskKey,
    taskTitle: item.taskTitle,
    userId: item.userId.toString(),
    userName: item.userName,
    workDate: item.workDate,
    hours: item.hours ?? 0,
    note: item.note ?? "",
    progressPercent: item.progressPercent ?? 0,
  };
}

function mapDashboardOverview(data: any): DashboardOverview {
  return {
    project: data.project ? mapBackendProject(data.project) : null,
    portfolioProgress: data.portfolioProgress ?? 0,
    projectProgress: data.projectProgress ?? 0,
    activeSprintProgress: data.activeSprintProgress ?? 0,
    logworkCoverage: data.logworkCoverage ?? 0,
    criticalAlerts: data.criticalAlerts ?? 0,
    projectsInScope: data.projectsInScope ?? 0,
    openTasksInScope: data.openTasksInScope ?? 0,
    taskSummary: {
      todo: data.taskSummary?.todo ?? 0,
      inProgress: data.taskSummary?.inProgress ?? 0,
      done: data.taskSummary?.done ?? 0,
      total: data.taskSummary?.total ?? 0,
      overdue: data.taskSummary?.overdue ?? 0,
    },
    activeSprint: data.activeSprint ? mapSprintSummary(data.activeSprint) : null,
    sprintSummaries: Array.isArray(data.sprintSummaries)
      ? data.sprintSummaries.map(mapSprintSummary)
      : [],
    overdueTasks: Array.isArray(data.overdueTasks) ? data.overdueTasks.map(mapTaskPreview) : [],
    activeTasks: Array.isArray(data.activeTasks) ? data.activeTasks.map(mapTaskPreview) : [],
    workloadBoard: Array.isArray(data.workloadBoard)
      ? data.workloadBoard.map(mapWorkloadMember)
      : [],
    recentLogwork: Array.isArray(data.recentLogwork)
      ? data.recentLogwork.map(mapRecentLogwork)
      : [],
  };
}

export const dashboardApi = {
  async getOverview(viewer?: UserProfile | null, projectId?: string) {
    void viewer;

    const params = new URLSearchParams();
    if (projectId) {
      params.append("project_id", projectId);
    }

    const path = params.size
      ? `/api/dashboard/overview?${params.toString()}`
      : "/api/dashboard/overview";
    const response = await requestApi<any>({
      method: "GET",
      path,
    });

    return {
      data: mapDashboardOverview(response.data),
      meta: response.meta,
    };
  },
};
