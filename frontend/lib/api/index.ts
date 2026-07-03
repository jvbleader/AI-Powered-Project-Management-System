import {
  aiInsights,
  aiMessages,
  aiReports,
  logworkEntries,
  projects,
  suggestedPrompts,
  sprints,
  taskAttachments,
  taskComments,
  tasks,
  users,
} from "@/lib/mock/data";
import {
  DEMO_TODAY,
  getAccessibleLogwork,
  getAccessibleProjects,
  getAccessibleSprints,
  getAccessibleTasks,
  getSuggestedActiveProject,
  getSuggestedActiveSprint,
  getTaskAssignee,
  getTaskReporter,
  isPrivilegedUser,
  isTaskOverdue,
  normalizeViewer,
  summarizeTaskCategories,
} from "@/lib/mock/permissions";
import {
  createDirectoryUser,
  getDirectoryUserByEmail,
  getDirectoryUsers,
  listDirectoryUsers,
  updateDirectoryAvatar,
  updateDirectoryProfile,
  updateDirectoryUserRoles,
  updateDirectoryUserStatus,
} from "@/lib/users/directory";
import type {
  AiMessage,
  AiReport,
  AiWorkspaceBrief,
  AdminDeactivateUserPayload,
  ApiResponse,
  AuthSession,
  AdminResetPasswordPayload,
  ChangePasswordPayload,
  CreateUserPayload,
  DashboardOverview,
  EnrichedTask,
  LogworkEntry,
  LogworkFilters,
  LoginPayload,
  PaginatedUsers,
  Project,
  ProjectFilters,
  Sprint,
  SprintFilters,
  Task,
  TaskComment,
  TaskFilters,
  UpdateProfilePayload,
  UserDirectoryFilters,
  UserProfile,
  UserRole,
  UserRolesUpdatePayload,
  UserStatusUpdatePayload,
  WorkspaceShellData,
} from "@/types/dto";

type EndpointMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type BackendUserResponse = {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_admin: boolean;
};

const DEFAULT_API_PORT = "8000";
const NETWORK_ERROR_MESSAGE = "Không kết nối được API backend. Vui lòng kiểm tra backend đang chạy ở http://127.0.0.1:8000.";
const BACKEND_WORKSPACE_ID = "flowpilot";
const BACKEND_SESSION_EXPIRES_IN = 60;
const USER_ADMIN_UNAVAILABLE_MESSAGE =
  "Backend hiện tại chưa hỗ trợ API quản trị người dùng. Tác vụ này mới chỉ chạy ở chế độ preview trên frontend.";
const DEFAULT_INTERNAL_API_BASE_URL = `http://backend:${DEFAULT_API_PORT}`;

function getBackendMeta(): ApiResponse<null>["meta"] {
  return {
    source: "backend",
    latencyMs: 0,
    generatedAt: new Date().toISOString(),
  };
}

function wrapBackendResponse<T>(data: T): ApiResponse<T> {
  return {
    data,
    meta: getBackendMeta(),
  };
}

function toInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "NA";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function toFrontendRole(backendUser: BackendUserResponse): UserRole {
  return backendUser.is_admin ? "ADMIN" : "MEMBER";
}

function toRoleTitle(role: UserRole) {
  if (role === "ADMIN") {
    return "Platform Admin";
  }

  if (role === "MANAGER") {
    return "Project Manager";
  }

  return "Team Member";
}

function toFrontendUserProfile(backendUser: BackendUserResponse): UserProfile {
  const resolvedName = backendUser.full_name?.trim() || backendUser.email.split("@")[0] || "Người dùng";
  const role = toFrontendRole(backendUser);

  return {
    id: `usr-${backendUser.id}`,
    name: resolvedName,
    email: backendUser.email,
    role,
    title: toRoleTitle(role),
    initials: toInitials(resolvedName),
    presence: backendUser.is_active ? "online" : "offline",
    capacityHours: 40,
    workloadHours: 0,
    focusScore: 75,
    isActive: backendUser.is_active,
  };
}

function toAuthSession(currentUser: UserProfile): AuthSession {
  return {
    accessToken: "",
    refreshToken: "",
    tokenType: "cookie",
    expiresIn: BACKEND_SESSION_EXPIRES_IN,
    currentUser,
    workspaceId: BACKEND_WORKSPACE_ID,
  };
}

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const internalBaseUrl = process.env.API_BASE_URL_INTERNAL;

  if (typeof window === "undefined") {
    return internalBaseUrl ?? configuredBaseUrl ?? DEFAULT_INTERNAL_API_BASE_URL;
  }

  const currentProtocol = window.location.protocol;
  const currentHostname = window.location.hostname;

  if (!configuredBaseUrl) {
    return `${currentProtocol}//${currentHostname}:${DEFAULT_API_PORT}`;
  }

  try {
    const url = new URL(configuredBaseUrl);
    const isLocalConfiguredHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const isLocalCurrentHost = currentHostname === "localhost" || currentHostname === "127.0.0.1";

    if (isLocalConfiguredHost && isLocalCurrentHost) {
      url.protocol = currentProtocol;
      url.hostname = currentHostname;
      if (!url.port) {
        url.port = DEFAULT_API_PORT;
      }
    }

    return url.origin;
  } catch {
    return `${currentProtocol}//${currentHostname}:${DEFAULT_API_PORT}`;
  }
}

export const apiEndpoints = {
  auth: {
    login: { method: "POST" as EndpointMethod, path: "/login" },
    logout: { method: "POST" as EndpointMethod, path: "/logout" },
    refresh: { method: "GET" as EndpointMethod, path: "/refresh" },
    changePassword: { method: "PUT" as EndpointMethod, path: "/change-password" },
    me: { method: "GET" as EndpointMethod, path: "/me" },
  },
  projects: {
    list: { method: "GET" as EndpointMethod, path: "/api/projects" },
    detail: (projectId: string) => ({ method: "GET" as EndpointMethod, path: `/api/projects/${projectId}` }),
    create: { method: "POST" as EndpointMethod, path: "/api/projects" },
    update: (projectId: string) => ({ method: "PATCH" as EndpointMethod, path: `/api/projects/${projectId}` }),
  },
  sprints: {
    list: { method: "GET" as EndpointMethod, path: "/api/sprints" },
    detail: (sprintId: string) => ({ method: "GET" as EndpointMethod, path: `/api/sprints/${sprintId}` }),
    create: { method: "POST" as EndpointMethod, path: "/api/sprints" },
    update: (sprintId: string) => ({ method: "PATCH" as EndpointMethod, path: `/api/sprints/${sprintId}` }),
  },
  tasks: {
    list: { method: "GET" as EndpointMethod, path: "/api/tasks" },
    detail: (taskId: string) => ({ method: "GET" as EndpointMethod, path: `/api/tasks/${taskId}` }),
    create: { method: "POST" as EndpointMethod, path: "/api/tasks" },
    update: (taskId: string) => ({ method: "PATCH" as EndpointMethod, path: `/api/tasks/${taskId}` }),
    updateStatus: (taskId: string) => ({
      method: "PATCH" as EndpointMethod,
      path: `/api/tasks/${taskId}/status`,
    }),
  },
  logwork: {
    list: { method: "GET" as EndpointMethod, path: "/api/logwork" },
    create: { method: "POST" as EndpointMethod, path: "/api/logwork" },
    update: (entryId: string) => ({ method: "PATCH" as EndpointMethod, path: `/api/logwork/${entryId}` }),
    remove: (entryId: string) => ({ method: "DELETE" as EndpointMethod, path: `/api/logwork/${entryId}` }),
  },
  users: {
    list: { method: "GET" as EndpointMethod, path: "/api/users" },
    create: { method: "POST" as EndpointMethod, path: "/api/auth/register" },
    deactivate: { method: "POST" as EndpointMethod, path: "/api/users/deactivate" },
    resetPassword: { method: "POST" as EndpointMethod, path: "/api/users/reset-password" },
    updateRole: (userId: string) => ({ method: "PATCH" as EndpointMethod, path: `/api/users/${userId}/role` }),
  },
  ai: {
    quickQuery: { method: "POST" as EndpointMethod, path: "/api/ai/query" },
    reports: { method: "GET" as EndpointMethod, path: "/api/ai/reports" },
    memory: { method: "GET" as EndpointMethod, path: "/api/ai/memory" },
  },
} as const;

function respond<T>(data: T, latencyMs = 140): Promise<ApiResponse<T>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data,
        meta: {
          source: "mock",
          latencyMs,
          generatedAt: new Date("2026-06-29T12:00:00Z").toISOString(),
        },
      });
    }, latencyMs);
  });
}

function formatApiError(detail: unknown, fallback: string) {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String(item.msg);
        }

        return null;
      })
      .filter(Boolean)
      .join(". ");
  }

  return fallback;
}

async function requestApi<T>(
  endpoint: { method: EndpointMethod; path: string },
  init?: Omit<RequestInit, "method">,
): Promise<ApiResponse<T>> {
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${endpoint.path}`, {
      ...init,
      method: endpoint.method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }

  if (response.status === 401 && endpoint.path !== "/refresh" && endpoint.path !== "/login") {
    try {
      const refreshRes = await fetch(`${getApiBaseUrl()}/refresh`, {
        method: "GET",
        credentials: "include",
      });
      if (refreshRes.ok) {
        response = await fetch(`${getApiBaseUrl()}${endpoint.path}`, {
          ...init,
          method: endpoint.method,
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...init?.headers,
          },
        });
      } else {
        if (typeof window !== "undefined") window.dispatchEvent(new Event("flowpilot-session-expired"));
      }
    } catch {
      if (typeof window !== "undefined") window.dispatchEvent(new Event("flowpilot-session-expired"));
    }
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload ? payload.detail : null;
    throw new Error(formatApiError(detail, "Không thể kết nối tới hệ thống xác thực."));
  }

  return wrapBackendResponse(payload as T);
}

async function fetchCurrentUserProfile() {
  const response = await requestApi<BackendUserResponse>(apiEndpoints.auth.me);
  const backendProfile = toFrontendUserProfile(response.data);
  const storedProfile = getDirectoryUserByEmail(backendProfile.email, backendProfile);

  if (!storedProfile) {
    return backendProfile;
  }

  return {
    ...storedProfile,
    ...backendProfile,
    role: backendProfile.role,
    roles: storedProfile.roles?.length ? storedProfile.roles : [backendProfile.role],
    title: storedProfile.jobTitle?.trim() || storedProfile.title || backendProfile.title,
    avatarUrl: storedProfile.avatarUrl ?? backendProfile.avatarUrl,
    phoneNumber: storedProfile.phoneNumber ?? "",
    department: storedProfile.department ?? "",
    jobTitle: storedProfile.jobTitle ?? storedProfile.title ?? backendProfile.title,
    address: storedProfile.address ?? "",
    employeeCode: storedProfile.employeeCode,
    status: storedProfile.status ?? (backendProfile.isActive ? "ACTIVE" : "SUSPENDED"),
    lastLoginAt: storedProfile.lastLoginAt,
    lastUpdatedAt: storedProfile.lastUpdatedAt,
  };
}

function containsSearch(value: string, search?: string) {
  if (!search) {
    return true;
  }

  return value.toLowerCase().includes(search.toLowerCase());
}

function getCurrentUser(viewer?: UserProfile | null) {
  return normalizeViewer(viewer);
}

function getProject(projectId: string) {
  return projects.find((project) => project.id === projectId) ?? projects[0];
}

function getSprint(sprintId: string) {
  return sprints.find((sprint) => sprint.id === sprintId) ?? sprints[0];
}

function isTaskOpen(task: Task) {
  return task.status !== "DONE";
}

function missingLogworkCount(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);
  const visibleUsers = isPrivilegedUser(currentViewer)
    ? users.filter((user) => user.role !== "ADMIN")
    : [currentViewer];

  return visibleUsers.filter((user) => {
    return !logworkEntries.some((entry) => entry.userId === user.id && entry.date === DEMO_TODAY);
  }).length;
}

function enrichTask(task: Task): EnrichedTask {
  return {
    ...task,
    assignee: getTaskAssignee(task),
    reporter: getTaskReporter(task),
    project: getProject(task.projectId),
    sprint: task.sprintId ? getSprint(task.sprintId) : null,
  };
}

function filterProjects(filters?: ProjectFilters, viewer?: UserProfile | null) {
  return getAccessibleProjects(viewer).filter((project) => {
    if (filters?.status && project.status !== filters.status) {
      return false;
    }

    if (filters?.managerId && project.managerId !== filters.managerId) {
      return false;
    }

    if (filters?.search) {
      return containsSearch(`${project.name} ${project.description} ${project.code}`, filters.search);
    }

    return true;
  });
}

function filterSprints(filters?: SprintFilters, viewer?: UserProfile | null) {
  return getAccessibleSprints(viewer).filter((sprint) => {
    if (filters?.projectId && sprint.projectId !== filters.projectId) {
      return false;
    }

    if (filters?.status && sprint.status !== filters.status) {
      return false;
    }

    return true;
  });
}

function filterTasks(filters?: TaskFilters, viewer?: UserProfile | null) {
  return getAccessibleTasks(viewer).filter((task) => {
    if (filters?.projectId && task.projectId !== filters.projectId) {
      return false;
    }

    if (filters?.sprintId && task.sprintId !== filters.sprintId) {
      return false;
    }

    if (filters?.assigneeId && task.assigneeId !== filters.assigneeId) {
      return false;
    }

    if (filters?.status && task.status !== filters.status) {
      return false;
    }

    if (filters?.search) {
      return containsSearch(`${task.title} ${task.description} ${task.key}`, filters.search);
    }

    return true;
  });
}

function filterLogwork(filters?: LogworkFilters, viewer?: UserProfile | null) {
  const projectTaskIds = filters?.projectId
    ? tasks.filter((task) => task.projectId === filters.projectId).map((task) => task.id)
    : [];

  return getAccessibleLogwork(viewer).filter((entry) => {
    if (filters?.userId && entry.userId !== filters.userId) {
      return false;
    }

    if (filters?.projectId && !projectTaskIds.includes(entry.taskId)) {
      return false;
    }

    return true;
  });
}

function filterComments(taskId: string, viewer?: UserProfile | null) {
  const accessibleTaskIds = new Set(getAccessibleTasks(viewer).map((task) => task.id));

  if (!accessibleTaskIds.has(taskId)) {
    return [];
  }

  return taskComments.filter((comment) => comment.taskId === taskId);
}

function filterAttachments(taskId: string, viewer?: UserProfile | null) {
  const accessibleTaskIds = new Set(getAccessibleTasks(viewer).map((task) => task.id));

  if (!accessibleTaskIds.has(taskId)) {
    return [];
  }

  return taskAttachments.filter((attachment) => attachment.taskId === taskId);
}

export const authApi = {
  async login(payload: LoginPayload, options?: { remember?: boolean }) {
    await requestApi<{ message: string; user_id: number }>(apiEndpoints.auth.login, {
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        remember_me: Boolean(options?.remember),
      }),
    });

    const currentUser = await fetchCurrentUserProfile();
    return wrapBackendResponse(toAuthSession(currentUser));
  },

  async refresh() {
    await requestApi<{ message: string; user_id: number }>(apiEndpoints.auth.refresh);
    const currentUser = await fetchCurrentUserProfile();
    return wrapBackendResponse(toAuthSession(currentUser));
  },

  async restoreSession() {
    try {
      const currentUser = await fetchCurrentUserProfile();
      return wrapBackendResponse(toAuthSession(currentUser));
    } catch {
      await requestApi<{ message: string; user_id: number }>(apiEndpoints.auth.refresh);
      const currentUser = await fetchCurrentUserProfile();
      return wrapBackendResponse(toAuthSession(currentUser));
    }
  },

  async logout() {
    try {
      return await requestApi<{ message: string }>(apiEndpoints.auth.logout, {
        body: JSON.stringify({}),
      });
    } catch (error) {
      await requestApi<{ message: string; user_id: number }>(apiEndpoints.auth.refresh);
      try {
        return await requestApi<{ message: string }>(apiEndpoints.auth.logout, {
          body: JSON.stringify({}),
        });
      } catch {
        throw error;
      }
    }
  },

  async me() {
    const currentUser = await fetchCurrentUserProfile();
    return wrapBackendResponse(currentUser);
  },

  async changePassword(_session: AuthSession, payload: ChangePasswordPayload) {
    return requestApi<{ message: string }>(apiEndpoints.auth.changePassword, {
      body: JSON.stringify({
        old_password: payload.currentPassword,
        new_password: payload.newPassword,
      }),
    });
  },
};

export const workspaceApi = {
  async getShellData(viewer?: UserProfile | null) {
    const currentUser = getCurrentUser(viewer);
    const visibleProjects = getAccessibleProjects(currentUser);
    const visibleTasks = getAccessibleTasks(currentUser);
    const openTasks = visibleTasks.filter(isTaskOpen).length;
    const alertCount =
      visibleTasks.filter((task) => task.status === "BLOCKED" || isTaskOverdue(task)).length +
      visibleProjects.filter((project) => project.status === "AT_RISK").length;

    const data: WorkspaceShellData = {
      currentUser,
      activeProjects: visibleProjects.filter((project) => project.status === "ACTIVE").length,
      openTasks,
      missingLogwork: missingLogworkCount(currentUser),
      alertCount,
    };

    return respond(data, 90);
  },
};

export const dashboardApi = {
  async getOverview(viewer?: UserProfile | null, projectId?: string) {
    const currentViewer = normalizeViewer(viewer);
    const activeProject = getSuggestedActiveProject(currentViewer);
    const selectedProject = projectId ? getProject(projectId) : activeProject;
    const scopedProject = getAccessibleProjects(currentViewer).find((project) => project.id === selectedProject.id) ?? activeProject;
    const activeSprint = getSuggestedActiveSprint(currentViewer, scopedProject.id);
    const visibleProjects = getAccessibleProjects(currentViewer);
    const visibleTasks = getAccessibleTasks(currentViewer);
    const overdueTasks = visibleTasks.filter((task) => task.projectId === scopedProject.id && isTaskOverdue(task));
    const workloadBoard = users
      .filter((user) => activeProject.memberIds.includes(user.id))
      .map((user) => ({
        user,
        utilization: Math.round((user.workloadHours / user.capacityHours) * 100),
      }));
    const visibleLogwork = getAccessibleLogwork(currentViewer).slice(0, 5);
    const scopedProjectTasks = visibleTasks.filter((task) => task.projectId === scopedProject.id);
    const taskCategories = summarizeTaskCategories(scopedProjectTasks);
    const portfolioProgress = visibleProjects.length
      ? Math.round(visibleProjects.reduce((sum, project) => sum + project.progress, 0) / visibleProjects.length)
      : 0;
    const logworkOwners = isPrivilegedUser(currentViewer)
      ? users.filter((user) => user.role !== "ADMIN")
      : [currentViewer];
    const logworkCoverage = logworkOwners.length
      ? Math.round(
          (logworkOwners.filter((user) => {
            return getAccessibleLogwork(currentViewer).some((entry) => entry.userId === user.id && entry.date === DEMO_TODAY);
          }).length /
            logworkOwners.length) *
            100,
        )
      : 0;

    const data: DashboardOverview = {
      activeProject: scopedProject,
      activeSprint,
      portfolioProgress,
      stats: [
        {
          label: "Tiến độ danh mục",
          value: `${portfolioProgress}%`,
          change: `${visibleProjects.length} dự án trong phạm vi của bạn`,
          tone: "accent",
        },
        {
          label: "Hoàn thành sprint",
          value: `${activeSprint.progress}%`,
          change: `${activeSprint.completedPoints}/${activeSprint.committedPoints} điểm đã bàn giao`,
          tone: activeSprint.health,
        },
        {
          label: "Tỷ lệ logwork",
          value: `${logworkCoverage}%`,
          change: `${visibleLogwork.length} bản ghi gần nhất đang hiển thị`,
          tone: logworkCoverage >= 80 ? "on-track" : "watch",
        },
        {
          label: "Cảnh báo trọng yếu",
          value: `${taskCategories.OUTDATE + overdueTasks.filter((task) => task.status === "BLOCKED").length}`,
          change: `${taskCategories.OUTDATE} công việc đã trễ hạn`,
          tone: taskCategories.OUTDATE > 0 ? "critical" : "on-track",
        },
      ],
      overdueTasks,
      workloadBoard,
      recentLogwork: visibleLogwork,
      aiInsights,
    };

    return respond(data, 120);
  },
};

export const projectApi = {
  async list(filters?: ProjectFilters, viewer?: UserProfile | null) {
    return respond(filterProjects(filters, viewer), 100);
  },

  async get(projectId: string, viewer?: UserProfile | null) {
    const accessibleProject = filterProjects(undefined, viewer).find((project) => project.id === projectId) ?? getProject(projectId);
    return respond(accessibleProject, 80);
  },

  async create(payload: Omit<Project, "id">) {
    const created: Project = {
      ...payload,
      id: `prj-${projects.length + 1}`,
    };
    projects.unshift(created);
    return respond(created, 180);
  },

  async update(projectId: string, payload: Partial<Project>) {
    const index = projects.findIndex((project) => project.id === projectId);
    const updated = { ...projects[index], ...payload };
    projects[index] = updated;
    return respond(updated, 160);
  },

  async addMember(projectId: string, memberId: string) {
    const index = projects.findIndex((project) => project.id === projectId);
    const current = projects[index];
    const nextMemberIds = current.memberIds.includes(memberId)
      ? current.memberIds
      : [...current.memberIds, memberId];
    const updated = { ...current, memberIds: nextMemberIds };
    projects[index] = updated;
    return respond(updated, 140);
  },

  async removeMember(projectId: string, memberId: string) {
    const index = projects.findIndex((project) => project.id === projectId);
    const current = projects[index];
    const updated = {
      ...current,
      memberIds: current.memberIds.filter((id) => id !== memberId),
    };
    projects[index] = updated;
    return respond(updated, 140);
  },
};

export const sprintApi = {
  async list(filters?: SprintFilters, viewer?: UserProfile | null) {
    return respond(filterSprints(filters, viewer), 90);
  },

  async get(sprintId: string, viewer?: UserProfile | null) {
    const accessibleSprint = filterSprints(undefined, viewer).find((sprint) => sprint.id === sprintId) ?? getSprint(sprintId);
    return respond(accessibleSprint, 80);
  },

  async create(payload: Omit<Sprint, "id">) {
    const created: Sprint = { ...payload, id: `spr-${sprints.length + 1}` };
    sprints.unshift(created);
    return respond(created, 160);
  },

  async update(sprintId: string, payload: Partial<Sprint>) {
    const index = sprints.findIndex((sprint) => sprint.id === sprintId);
    const updated = { ...sprints[index], ...payload };
    sprints[index] = updated;
    return respond(updated, 150);
  },
};

export const taskApi = {
  async list(filters?: TaskFilters, viewer?: UserProfile | null) {
    return respond(filterTasks(filters, viewer), 110);
  },

  async get(taskId: string, viewer?: UserProfile | null) {
    const task = filterTasks(undefined, viewer).find((entry) => entry.id === taskId) ?? tasks[0];
    return respond(task, 80);
  },

  async create(payload: Omit<Task, "id">) {
    const created: Task = { ...payload, id: `tsk-${tasks.length + 1}` };
    tasks.unshift(created);
    return respond(created, 170);
  },

  async update(taskId: string, payload: Partial<Task>) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const updated = { ...tasks[index], ...payload };
    tasks[index] = updated;
    return respond(updated, 160);
  },

  async updateStatus(taskId: string, status: Task["status"]) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const updated = {
      ...tasks[index],
      status,
      lastActivity: `${DEMO_TODAY}T12:00:00Z`,
    };
    tasks[index] = updated;
    return respond(updated, 120);
  },

  async updateAssignee(taskId: string, assigneeId: string) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const updated = {
      ...tasks[index],
      assigneeId,
      lastActivity: `${DEMO_TODAY}T12:00:00Z`,
    };
    tasks[index] = updated;
    return respond(updated, 130);
  },

  async getEnrichedBoard(filters?: TaskFilters, viewer?: UserProfile | null) {
    return respond(filterTasks(filters, viewer).map(enrichTask), 110);
  },

  async listComments(taskId: string, viewer?: UserProfile | null) {
    return respond(filterComments(taskId, viewer), 90);
  },

  async addComment(payload: Omit<TaskComment, "id" | "createdAt" | "updatedAt">) {
    const created: TaskComment = {
      ...payload,
      id: `cmt-${taskComments.length + 1}`,
      createdAt: `${DEMO_TODAY}T12:00:00Z`,
      updatedAt: null,
    };
    taskComments.unshift(created);
    return respond(created, 120);
  },

  async updateComment(commentId: string, content: string) {
    const index = taskComments.findIndex((comment) => comment.id === commentId);
    const updated = {
      ...taskComments[index],
      content,
      updatedAt: `${DEMO_TODAY}T12:00:00Z`,
    };
    taskComments[index] = updated;
    return respond(updated, 120);
  },

  async getAttachments(taskId: string, viewer?: UserProfile | null) {
    return respond(filterAttachments(taskId, viewer), 90);
  },
};

export const logworkApi = {
  async list(filters?: LogworkFilters, viewer?: UserProfile | null) {
    return respond(filterLogwork(filters, viewer), 100);
  },

  async create(payload: Omit<LogworkEntry, "id">) {
    const created: LogworkEntry = {
      ...payload,
      id: `log-${logworkEntries.length + 1}`,
    };
    logworkEntries.unshift(created);
    return respond(created, 150);
  },

  async update(entryId: string, payload: Partial<LogworkEntry>) {
    const index = logworkEntries.findIndex((entry) => entry.id === entryId);
    const updated = { ...logworkEntries[index], ...payload };
    logworkEntries[index] = updated;
    return respond(updated, 140);
  },

  async remove(entryId: string) {
    const index = logworkEntries.findIndex((entry) => entry.id === entryId);
    const removed = logworkEntries[index];
    logworkEntries.splice(index, 1);
    return respond(removed, 130);
  },
};

export const userApi = {
  async list(viewer?: UserProfile | null) {
    const currentViewer = normalizeViewer(viewer);
    const visibleUsers = isPrivilegedUser(currentViewer)
      ? getDirectoryUsers(currentViewer)
      : getDirectoryUsers(currentViewer).filter((user) => user.email.toLowerCase() === currentViewer.email.toLowerCase());

    return respond(visibleUsers, 100);
  },

  async updateRole(userId: string, role: (typeof users)[number]["role"]) {
    const updated = updateDirectoryUserRoles({ userId, roles: [role] });
    return respond(updated, 150);
  },

  async listDirectory(filters?: UserDirectoryFilters, viewer?: UserProfile | null) {
    const currentViewer = normalizeViewer(viewer);
    const data = isPrivilegedUser(currentViewer)
      ? listDirectoryUsers(filters, currentViewer)
      : listDirectoryUsers({ ...filters, page: 1 }, currentViewer);

    if (isPrivilegedUser(currentViewer)) {
      return respond<PaginatedUsers>(data, 110);
    }

    return respond<PaginatedUsers>(
      {
        ...data,
        items: data.items.filter((user) => user.email.toLowerCase() === currentViewer.email.toLowerCase()),
        total: 1,
        page: 1,
        totalPages: 1,
      },
      110,
    );
  },

  async getCurrentProfile(viewer: UserProfile) {
    const currentViewer = normalizeViewer(viewer);
    const matchedUser =
      getDirectoryUsers(currentViewer).find((user) => user.email.toLowerCase() === currentViewer.email.toLowerCase()) ??
      currentViewer;

    return respond(matchedUser, 100);
  },

  async updateCurrentProfile(viewer: UserProfile, payload: UpdateProfilePayload) {
    const updated = updateDirectoryProfile(normalizeViewer(viewer), payload);
    return respond(updated, 140);
  },

  async updateCurrentAvatar(viewer: UserProfile, avatarUrl?: string) {
    const updated = updateDirectoryAvatar(normalizeViewer(viewer), avatarUrl);
    return respond(updated, 120);
  },

  async updateStatus(payload: UserStatusUpdatePayload, viewer?: UserProfile | null) {
    const currentViewer = normalizeViewer(viewer);

    if (currentViewer.role !== "ADMIN") {
      throw new Error("Chỉ quản trị viên mới có thể thay đổi trạng thái tài khoản.");
    }

    const updated = updateDirectoryUserStatus(payload, currentViewer);
    return respond(updated, 140);
  },

  async updateRoles(payload: UserRolesUpdatePayload, viewer?: UserProfile | null) {
    const currentViewer = normalizeViewer(viewer);

    if (currentViewer.role !== "ADMIN") {
      throw new Error("Chỉ quản trị viên mới có thể gán hoặc thu hồi vai trò.");
    }

    const updated = updateDirectoryUserRoles(payload, currentViewer);
    return respond(updated, 140);
  },

  async create(payload: CreateUserPayload): Promise<ApiResponse<UserProfile>> {
    try {
      const created = createDirectoryUser(payload);
      return respond(created, 180);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async deactivate(payload: AdminDeactivateUserPayload): Promise<
    ApiResponse<{
      email: string;
      isActive: boolean;
      message: string;
      revokedRefreshTokens: number;
      revokedAt: string | null;
    }>
  > {
    const targetUser = getDirectoryUsers().find((user) => user.email.toLowerCase() === payload.email.toLowerCase());

    if (!targetUser) {
      throw new Error("Không tìm thấy người dùng trong danh sách preview.");
    }

    const updated = updateDirectoryUserStatus({
      userId: targetUser.id,
      status: "LOCKED",
    });

    return respond(
      {
        email: updated.email,
        isActive: updated.isActive,
        message: "Đã khóa tài khoản trong chế độ preview của frontend.",
        revokedRefreshTokens: 0,
        revokedAt: new Date().toISOString(),
      },
      140,
    );
  },

  async resetPassword(payload: AdminResetPasswordPayload): Promise<
    ApiResponse<{
      email: string;
      message: string;
      revokedRefreshTokens: number;
      revokedAt: string;
    }>
  > {
    void payload;
    throw new Error(USER_ADMIN_UNAVAILABLE_MESSAGE);
  },
};

export const backendCapabilities = {
  userAdmin: false,
  userAdminPreview: true,
} as const;

function quickAnswer(prompt: string) {
  const text = prompt.toLowerCase();

  if (text.includes("block")) {
    return "Current blockers are FP-105 for sprint analytics schema and FP-104 for worklog validation rules.";
  }

  if (text.includes("logwork")) {
    return "One teammate is missing a June 29 worklog entry, and overall coverage is 86%.";
  }

  if (text.includes("overdue")) {
    return "There are 3 overdue tasks across the portfolio, with FP-104 and FP-105 driving the highest risk.";
  }

  return "Sprint 06 is 68% complete. Delivery is healthy on UI, but backend contracts are the main dependency.";
}

export const aiApi = {
  async quickQuery(prompt: string) {
    return respond<AiMessage>(
      {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: quickAnswer(prompt),
      },
      200,
    );
  },

  async getWorkspaceBrief() {
    const data: AiWorkspaceBrief = {
      messages: aiMessages,
      reports: aiReports,
      prompts: suggestedPrompts,
      memoryModes: [
        "Tra cứu nhanh -> công cụ truy xuất xác định -> phản hồi ngắn gọn",
        "Chế độ báo cáo -> số liệu + ngữ cảnh truy xuất -> tường thuật + gợi ý biểu đồ",
        "Bộ nhớ dài hạn -> bộ đệm hội thoại gần nhất -> tóm tắt ngữ cảnh tích lũy",
      ],
    };

    return respond(data, 120);
  },

  async getReports() {
    return respond<AiReport[]>(aiReports, 110);
  },
};
