import type {
  DashboardOverview,
  DashboardRecentLogwork,
  DashboardSprintSummary,
  DashboardTaskPreview,
  DashboardWorkloadMember,
  UserProfile,
} from "@/types";

import { requestApi } from "./core";
import { mapBackendProject, type BackendProject } from "./projects";

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

type BackendRecord = Record<string, unknown>;

function asRecord(value: unknown): BackendRecord {
  return value && typeof value === "object" ? (value as BackendRecord) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function mapTaskPreview(item: BackendRecord): DashboardTaskPreview {
  return {
    id: String(item.id ?? ""),
    key: asString(item.key),
    title: asString(item.title),
    status: normalizeTaskStatus(item.status),
    priority: (asString(item.priority, "MEDIUM").toUpperCase() || "MEDIUM") as DashboardTaskPreview["priority"],
    startDate: asOptionalString(item.startDate),
    dueDate: asOptionalString(item.dueDate),
    assigneeName: asOptionalString(item.assigneeName),
    sprintName: asOptionalString(item.sprintName),
    projectId: item.projectId != null ? String(item.projectId) : null,
    projectName: asString(item.projectName),
  };
}

function mapSprintSummary(item: BackendRecord): DashboardSprintSummary {
  return {
    id: String(item.id ?? ""),
    name: asString(item.name),
    status: (asString(item.status, "PLANNED") as DashboardSprintSummary["status"]),
    goal: asOptionalString(item.goal),
    startDate: asString(item.startDate),
    endDate: asString(item.endDate),
    plannedProgress: asNumber(item.plannedProgress),
    actualProgress: asNumber(item.actualProgress),
    totalTasks: asNumber(item.totalTasks),
    todoCount: asNumber(item.todoCount),
    inProgressCount: asNumber(item.inProgressCount),
    doneCount: asNumber(item.doneCount),
    estimatedHours: asNumber(item.estimatedHours),
    loggedHours: asNumber(item.loggedHours),
    health: (asString(item.health, "on-track") as DashboardSprintSummary["health"]),
  };
}

function mapWorkloadMember(item: BackendRecord): DashboardWorkloadMember {
  return {
    userId: String(item.userId ?? ""),
    memberId: String(item.memberId ?? ""),
    name: asString(item.name),
    email: asString(item.email),
    roleName: asString(item.roleName),
    assignedTasks: asNumber(item.assignedTasks),
    todoTasks: asNumber(item.todoTasks),
    inProgressTasks: asNumber(item.inProgressTasks),
    doneTasks: asNumber(item.doneTasks),
    overdueTasks: asNumber(item.overdueTasks),
    estimatedHours: asNumber(item.estimatedHours),
    loggedHours: asNumber(item.loggedHours),
    progress: asNumber(item.progress),
  };
}

function mapRecentLogwork(item: BackendRecord): DashboardRecentLogwork {
  return {
    id: String(item.id ?? ""),
    taskId: String(item.taskId ?? ""),
    taskKey: asString(item.taskKey),
    taskTitle: asString(item.taskTitle),
    userId: String(item.userId ?? ""),
    userName: asString(item.userName),
    workDate: asString(item.workDate),
    hours: asNumber(item.hours),
    note: asString(item.note),
    progressPercent: asNumber(item.progressPercent),
  };
}

function mapDashboardOverview(data: unknown): DashboardOverview {
  const overview = asRecord(data);
  const taskSummary = asRecord(overview.taskSummary);

  return {
    project: overview.project ? mapBackendProject(overview.project as BackendProject) : null,
    portfolioProgress: asNumber(overview.portfolioProgress),
    projectProgress: asNumber(overview.projectProgress),
    activeSprintProgress: asNumber(overview.activeSprintProgress),
    estimatedHoursTotal: asNumber(overview.estimatedHoursTotal),
    estimatedHoursDone: asNumber(overview.estimatedHoursDone),
    estimatedHoursRemaining: asNumber(overview.estimatedHoursRemaining),
    logworkCoverage: asNumber(overview.logworkCoverage),
    memberCount: asNumber(overview.memberCount),
    membersLoggedToday: asNumber(overview.membersLoggedToday),
    criticalAlerts: asNumber(overview.criticalAlerts),
    projectsInScope: asNumber(overview.projectsInScope),
    openTasksInScope: asNumber(overview.openTasksInScope),
    taskSummary: {
      todo: asNumber(taskSummary.todo),
      inProgress: asNumber(taskSummary.inProgress),
      done: asNumber(taskSummary.done),
      total: asNumber(taskSummary.total),
      overdue: asNumber(taskSummary.overdue),
    },
    activeSprint: overview.activeSprint ? mapSprintSummary(asRecord(overview.activeSprint)) : null,
    sprintSummaries: Array.isArray(overview.sprintSummaries)
      ? overview.sprintSummaries.map((item) => mapSprintSummary(asRecord(item)))
      : [],
    overdueTasks: Array.isArray(overview.overdueTasks)
      ? overview.overdueTasks.map((item) => mapTaskPreview(asRecord(item)))
      : [],
    activeTasks: Array.isArray(overview.activeTasks)
      ? overview.activeTasks.map((item) => mapTaskPreview(asRecord(item)))
      : [],
    workloadBoard: Array.isArray(overview.workloadBoard)
      ? overview.workloadBoard.map((item) => mapWorkloadMember(asRecord(item)))
      : [],
    recentLogwork: Array.isArray(overview.recentLogwork)
      ? overview.recentLogwork.map((item) => mapRecentLogwork(asRecord(item)))
      : [],
  };
}

function mapProjectHealthPreview(item: BackendRecord): import("@/types").ProjectHealthPreview {
  return {
    id: String(item.id ?? ""),
    name: asString(item.name),
    code: asString(item.code),
    status: asString(item.status, "ACTIVE"),
    progress: asNumber(item.progress),
    totalTasks: asNumber(item.totalTasks),
    health: (asString(item.health, "on-track") as import("@/types").ProjectHealthPreview["health"]),
  };
}

function mapGlobalDashboardOverview(data: unknown): import("@/types").GlobalDashboardOverview {
  const overview = asRecord(data);
  const taskSummary = asRecord(overview.taskSummary);

  return {
    totalProjects: asNumber(overview.totalProjects),
    activeProjects: asNumber(overview.activeProjects),
    completedProjects: asNumber(overview.completedProjects),
    taskSummary: {
      todo: asNumber(taskSummary.todo),
      inProgress: asNumber(taskSummary.inProgress),
      done: asNumber(taskSummary.done),
      total: asNumber(taskSummary.total),
      overdue: asNumber(taskSummary.overdue),
    },
    globalWorkload: Array.isArray(overview.globalWorkload)
      ? overview.globalWorkload.map((item) => mapWorkloadMember(asRecord(item)))
      : [],
    upcomingDeadlines: Array.isArray(overview.upcomingDeadlines)
      ? overview.upcomingDeadlines.map((item) => mapTaskPreview(asRecord(item)))
      : [],
    overdueTasks: Array.isArray(overview.overdueTasks)
      ? overview.overdueTasks.map((item) => mapTaskPreview(asRecord(item)))
      : [],
    completedTasks: Array.isArray(overview.completedTasks)
      ? overview.completedTasks.map((item) => mapTaskPreview(asRecord(item)))
      : [],
    projectHealths: Array.isArray(overview.projectHealths)
      ? overview.projectHealths.map((item) => mapProjectHealthPreview(asRecord(item)))
      : [],
    activeSprints: Array.isArray(overview.activeSprints)
      ? overview.activeSprints.map((item) => mapSprintSummary(asRecord(item)))
      : [],
    recentLogworks: Array.isArray(overview.recentLogworks)
      ? overview.recentLogworks.map((item) => mapRecentLogwork(asRecord(item)))
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
    const response = await requestApi<unknown>({
      method: "GET",
      path,
    });

    return {
      data: mapDashboardOverview(response.data),
      meta: response.meta,
    };
  },

  async getGlobalOverview() {
    const response = await requestApi<unknown>({
      method: "GET",
      path: "/api/dashboard/global-overview",
    });

    return {
      data: mapGlobalDashboardOverview(response.data),
      meta: response.meta,
    };
  },
};
