import {
  logworkEntries,
  projects,
  sprints,
  taskAttachments,
  taskComments,
  tasks,
  users,
} from "@/lib/mock/data";
import {
  DEMO_TODAY,
  getAccessibleLogwork,
  getAccessibleSprints,
  getAccessibleTasks,
  getLogworkTrackedUsers,
  getTaskAssignee,
  getTaskReporter,
  normalizeViewer,
} from "@/lib/mock/permissions";
import {
  getDirectoryUserByEmail,
} from "@/services/users/directory";
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
  Department,
  EnrichedTask,
  LogworkEntry,
  LogworkFilters,
  LoginPayload,
  PaginatedUsers,
  Project,
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
} from "@/types";

export type EndpointMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type BackendUserResponse = {
  id: number;
  email: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  department: string | null;
  role: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type BackendPaginatedUsers = {
  items: BackendUserResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const DEFAULT_API_PORT = "8000";
export const NETWORK_ERROR_MESSAGE =
  "Không kết nối được API backend. Vui lòng kiểm tra backend đang chạy ở http://127.0.0.1:8000.";
export const BACKEND_WORKSPACE_ID = "flowpilot";
export const BACKEND_SESSION_EXPIRES_IN = 60;
export const USER_ADMIN_UNAVAILABLE_MESSAGE =
  "Backend hiện tại chưa hỗ trợ API quản trị người dùng. Tác vụ này mới chỉ chạy ở chế độ preview trên frontend.";
export const DEFAULT_INTERNAL_API_BASE_URL = `http://backend:${DEFAULT_API_PORT}`;

export function getBackendMeta(): ApiResponse<null>["meta"] {
  return {
    source: "backend",
    latencyMs: 0,
    generatedAt: new Date().toISOString(),
  };
}

export function wrapBackendResponse<T>(data: T): ApiResponse<T> {
  return {
    data,
    meta: getBackendMeta(),
  };
}

export function toInitials(name: string) {
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

export function toFrontendRole(backendUser: BackendUserResponse): UserRole {
  return backendUser.is_admin ? "ADMIN" : "MEMBER";
}

export function toRoleTitle(role: UserRole) {
  if (role === "ADMIN") {
    return "Platform Admin";
  }

  if (role === "MANAGER") {
    return "Project Manager";
  }

  if (role === "LEADER") {
    return "Team Lead";
  }

  return "Team Member";
}

export function toFrontendUserProfile(backendUser: BackendUserResponse): UserProfile {
  const resolvedName =
    backendUser.full_name?.trim() || backendUser.email.split("@")[0] || "Người dùng";
  const role = backendUser.is_admin ? "ADMIN" : (backendUser.role as UserRole) || "MEMBER";

  return {
    id: `usr-${backendUser.id}`,
    name: resolvedName,
    email: backendUser.email,
    role,
    roles: [role],
    title: backendUser.department
      ? `${toRoleTitle(role)} - ${backendUser.department}`
      : toRoleTitle(role),
    initials: toInitials(resolvedName),
    presence: backendUser.is_active ? "online" : "offline",
    capacityHours: 40,
    workloadHours: 0,
    focusScore: 75,
    isActive: backendUser.is_active,
    status: backendUser.is_active ? "ACTIVE" : "INACTIVE",
    phoneNumber: backendUser.phone_number ?? undefined,
    department: backendUser.department ?? undefined,
    avatarUrl: backendUser.avatar_url ?? undefined,
  };
}

export function toAuthSession(currentUser: UserProfile): AuthSession {
  return {
    accessToken: "",
    refreshToken: "",
    tokenType: "cookie",
    expiresIn: BACKEND_SESSION_EXPIRES_IN,
    currentUser,
    workspaceId: BACKEND_WORKSPACE_ID,
  };
}

export function getApiBaseUrl() {
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
    logoutAll: { method: "POST" as EndpointMethod, path: "/logout-all" },
    refresh: { method: "GET" as EndpointMethod, path: "/refresh" },
    changePassword: { method: "PUT" as EndpointMethod, path: "/change-password" },
    me: { method: "GET" as EndpointMethod, path: "/me" },
  },
  projects: {
    list: { method: "GET" as EndpointMethod, path: "/api/projects" },
    detail: (projectId: string) => ({
      method: "GET" as EndpointMethod,
      path: `/api/projects/${projectId}`,
    }),
    create: { method: "POST" as EndpointMethod, path: "/api/projects" },
    update: (projectId: string) => ({
      method: "PATCH" as EndpointMethod,
      path: `/api/projects/${projectId}`,
    }),
  },
  sprints: {
    list: { method: "GET" as EndpointMethod, path: "/api/sprints" },
    detail: (sprintId: string) => ({
      method: "GET" as EndpointMethod,
      path: `/api/sprints/${sprintId}`,
    }),
    create: { method: "POST" as EndpointMethod, path: "/api/sprints" },
    update: (sprintId: string) => ({
      method: "PATCH" as EndpointMethod,
      path: `/api/sprints/${sprintId}`,
    }),
  },
  tasks: {
    list: { method: "GET" as EndpointMethod, path: "/api/tasks" },
    detail: (taskId: string) => ({ method: "GET" as EndpointMethod, path: `/api/tasks/${taskId}` }),
    create: { method: "POST" as EndpointMethod, path: "/api/tasks" },
    update: (taskId: string) => ({
      method: "PATCH" as EndpointMethod,
      path: `/api/tasks/${taskId}`,
    }),
    updateStatus: (taskId: string) => ({
      method: "PATCH" as EndpointMethod,
      path: `/api/tasks/${taskId}/status`,
    }),
  },
  logwork: {
    list: { method: "GET" as EndpointMethod, path: "/api/logwork" },
    create: { method: "POST" as EndpointMethod, path: "/api/logwork" },
    update: (entryId: string) => ({
      method: "PATCH" as EndpointMethod,
      path: `/api/logwork/${entryId}`,
    }),
    remove: (entryId: string) => ({
      method: "DELETE" as EndpointMethod,
      path: `/api/logwork/${entryId}`,
    }),
  },
  users: {
    list: { method: "GET" as EndpointMethod, path: "/api/users" },
    create: { method: "POST" as EndpointMethod, path: "/api/users" },
    deactivate: { method: "POST" as EndpointMethod, path: "/api/users/deactivate" },
    resetPassword: { method: "POST" as EndpointMethod, path: "/api/users/reset-password" },
    updateRole: (userId: string) => ({
      method: "PATCH" as EndpointMethod,
      path: `/api/users/${userId.replace("usr-", "")}/role`,
    }),
    updateStatus: (userId: string) => ({
      method: "PATCH" as EndpointMethod,
      path: `/api/users/${userId.replace("usr-", "")}/status`,
    }),
    updatePhone: { method: "PUT" as EndpointMethod, path: "/me/phone" },
    updateAvatar: { method: "PUT" as EndpointMethod, path: "/me/avatar" },
  },
  ai: {
    quickResponse: { method: "POST" as EndpointMethod, path: "/api/ai/quick-response" },
    quickQuery: { method: "POST" as EndpointMethod, path: "/api/ai/query" },
    reports: { method: "GET" as EndpointMethod, path: "/api/ai/reports" },
    memory: { method: "GET" as EndpointMethod, path: "/api/ai/memory" },
  },
} as const;

export function respond<T>(data: T, latencyMs = 140): Promise<ApiResponse<T>> {
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

export function formatApiError(detail: unknown, fallback: string) {
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

export async function requestApi<T>(
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

  if (
    response.status === 401 &&
    endpoint.path !== "/refresh" &&
    endpoint.path !== "/login" &&
    endpoint.path !== "/logout"
  ) {
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
        if (typeof window !== "undefined")
          window.dispatchEvent(new Event("flowpilot-session-expired"));
      }
    } catch {
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("flowpilot-session-expired"));
    }
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload ? payload.detail : null;
    throw new Error(formatApiError(detail, "Không thể kết nối tới hệ thống xác thực."));
  }

  return wrapBackendResponse(payload as T);
}

export async function fetchCurrentUserProfile() {
  const response = await requestApi<BackendUserResponse>(apiEndpoints.auth.me);
  const backendProfile = toFrontendUserProfile(response.data);
  const storedProfile = getDirectoryUserByEmail(backendProfile.email, backendProfile);

  if (!storedProfile) {
    return backendProfile;
  }

  const effectiveDepartment = backendProfile.department ?? storedProfile.department ?? "";
  const effectiveTitle = effectiveDepartment
    ? `${toRoleTitle(backendProfile.role)} - ${effectiveDepartment}`
    : toRoleTitle(backendProfile.role);

  return {
    ...storedProfile,
    ...backendProfile,
    role: backendProfile.role,
    roles: [backendProfile.role],
    title: effectiveTitle,
    avatarUrl: storedProfile.avatarUrl ?? backendProfile.avatarUrl,
    phoneNumber: storedProfile.phoneNumber ?? "",
    department: effectiveDepartment,
    jobTitle: storedProfile.jobTitle ?? effectiveTitle,
    address: storedProfile.address ?? "",
    employeeCode: storedProfile.employeeCode,
    status: storedProfile.status ?? (backendProfile.isActive ? "ACTIVE" : "INACTIVE"),
    lastLoginAt: storedProfile.lastLoginAt,
    lastUpdatedAt: storedProfile.lastUpdatedAt,
  };
}

export function containsSearch(value: string, search?: string) {
  if (!search) {
    return true;
  }

  return value.toLowerCase().includes(search.toLowerCase());
}

export function getCurrentUser(viewer?: UserProfile | null) {
  return normalizeViewer(viewer);
}

export function getProject(projectId: string) {
  return projects.find((project) => project.id === projectId) ?? projects[0];
}

export function getSprint(sprintId: string) {
  return sprints.find((sprint) => sprint.id === sprintId) ?? sprints[0];
}

export function isTaskOpen(task: Task) {
  return task.status !== "DONE";
}

export function missingLogworkCount(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);
  const visibleUsers = getLogworkTrackedUsers(currentViewer);

  return visibleUsers.filter((user) => {
    return !logworkEntries.some((entry) => entry.userId === user.id && entry.date === DEMO_TODAY);
  }).length;
}

export function enrichTask(task: Task): EnrichedTask {
  return {
    ...task,
    assignee: getTaskAssignee(task),
    reporter: getTaskReporter(task),
    project: getProject(task.projectId),
    sprint: task.sprintId ? getSprint(task.sprintId) : null,
  };
}


export function filterSprints(filters?: SprintFilters, viewer?: UserProfile | null) {
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

export function filterTasks(filters?: TaskFilters, viewer?: UserProfile | null) {
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

export function filterLogwork(filters?: LogworkFilters, viewer?: UserProfile | null) {
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

export function filterComments(taskId: string, viewer?: UserProfile | null) {
  const accessibleTaskIds = new Set(getAccessibleTasks(viewer).map((task) => task.id));

  if (!accessibleTaskIds.has(taskId)) {
    return [];
  }

  return taskComments.filter((comment) => comment.taskId === taskId);
}

export function filterAttachments(taskId: string, viewer?: UserProfile | null) {
  const accessibleTaskIds = new Set(getAccessibleTasks(viewer).map((task) => task.id));

  if (!accessibleTaskIds.has(taskId)) {
    return [];
  }

  return taskAttachments.filter((attachment) => attachment.taskId === taskId);
}

export const backendCapabilities = {
  userAdmin: false,
  userAdminPreview: true,
} as const;
