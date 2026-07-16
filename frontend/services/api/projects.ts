import { Project, ProjectFilters, UserProfile, ApiResponse } from "@/types";
import { isSupportedProjectRoleName, normalizeProjectRoleName } from "@/lib/utils/format";
import { requestApi, apiEndpoints } from "./core";

const PROJECT_ROLE_ORDER = ["PROJECT_MANAGER", "DEVELOPER", "QA", "VIEWER"] as const;

export type ProjectMemberResponse = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  roleId: number;
  roleName: string;
  joinedAt: string;
  isActive: boolean;
};

export type ProjectRoleResponse = {
  id: number;
  name: string;
};

export type BackendProject = Record<string, unknown> & {
  id: number | string;
  code: string;
  name: string;
  description?: string;
  status: Project["status"];
  progress: number;
  managerId?: number | null;
  memberIds?: number[];
  startDate?: string;
  endDate?: string;
  currentSprintId?: number | string | null;
  objectives?: string[];
  metrics?: Project["metrics"];
};

type BackendProjectListResponse = {
  items?: BackendProject[];
};

function mapBackendProjectMember(data: ProjectMemberResponse): ProjectMemberResponse {
  const normalizedRoleName = normalizeProjectRoleName(String(data.roleName || ""));

  return {
    ...data,
    roleName: isSupportedProjectRoleName(normalizedRoleName)
      ? normalizedRoleName
      : data.roleName,
  };
}

function normalizeProjectRoles(rawRoles: ProjectRoleResponse[]): ProjectRoleResponse[] {
  const rolesByName = new Map<
    string,
    {
      id: number;
      name: string;
      exactMatch: boolean;
    }
  >();

  rawRoles.forEach((role) => {
    const canonicalName = normalizeProjectRoleName(String(role.name || ""));
    if (!isSupportedProjectRoleName(canonicalName)) {
      return;
    }

    const exactMatch = String(role.name || "").trim().toUpperCase() === canonicalName;
    const existingRole = rolesByName.get(canonicalName);

    if (!existingRole || (exactMatch && !existingRole.exactMatch)) {
      rolesByName.set(canonicalName, {
        id: Number(role.id),
        name: canonicalName,
        exactMatch,
      });
    }
  });

  return PROJECT_ROLE_ORDER.map((roleName) => rolesByName.get(roleName))
    .filter(Boolean)
    .map((role) => ({ id: role!.id, name: role!.name }));
}

export function mapBackendProject(data: BackendProject): Project {
  return {
    ...data,
    id: data.id.toString(),
    description: data.description || "",
    managerId: data.managerId ? `usr-${data.managerId}` : "",
    memberIds: data.memberIds ? data.memberIds.map((id: number) => `usr-${id}`) : [],
    startDate: data.startDate || "",
    endDate: data.endDate || "",
    currentSprintId: data.currentSprintId?.toString() || null,
    objectives: data.objectives || [],
    metrics: data.metrics || {
      completedTasks: 0,
      overdueTasks: 0,
      logworkCoverage: 0,
      velocity: 0,
      totalTasks: 0,
    },
  };
}

export const projectApi = {
  async list(filters?: ProjectFilters, viewer?: UserProfile | null): Promise<ApiResponse<Project[]>> {
    void viewer;
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.managerId) params.append("manager_id", filters.managerId.replace("usr-", ""));
    
    // pagination params if needed
    params.append("page_size", "100");

    const endpoint = {
      ...apiEndpoints.projects.list,
      path: `${apiEndpoints.projects.list.path}?${params.toString()}`,
    };
    
    const response = await requestApi<BackendProjectListResponse>(endpoint);
    const items = response.data.items ? response.data.items.map(mapBackendProject) : [];
    
    return { data: items, meta: response.meta };
  },

  async get(projectId: string, viewer?: UserProfile | null): Promise<ApiResponse<Project>> {
    void viewer;
    const endpoint = apiEndpoints.projects.detail(projectId);
    const response = await requestApi<BackendProject>(endpoint);
    return { data: mapBackendProject(response.data), meta: response.meta };
  },

  async create(payload: Record<string, unknown>): Promise<ApiResponse<Project>> {
    const response = await requestApi<BackendProject>(apiEndpoints.projects.create, {
      body: JSON.stringify(payload),
    });
    const created = mapBackendProject(response.data);
    return { data: created, meta: response.meta };
  },

  async update(projectId: string, payload: Partial<Project>): Promise<ApiResponse<Project>> {
    const endpoint = apiEndpoints.projects.update(projectId);
    
    const backendPayload: Record<string, unknown> = { ...payload };
    if (payload.startDate) backendPayload.start_date = payload.startDate;
    if (payload.endDate) backendPayload.end_date = payload.endDate;
    
    const response = await requestApi<BackendProject>(endpoint, {
      body: JSON.stringify(backendPayload),
    });
    
    return { data: mapBackendProject(response.data), meta: response.meta };
  },

  async listMembers(projectId: string): Promise<ApiResponse<ProjectMemberResponse[]>> {
    const endpoint = { method: "GET" as const, path: `/api/projects/${projectId}/members` };
    const response = await requestApi<ProjectMemberResponse[]>(endpoint);
    return { data: (response.data || []).map(mapBackendProjectMember), meta: response.meta };
  },

  async listRoles(): Promise<ApiResponse<ProjectRoleResponse[]>> {
    const endpoint = { method: "GET" as const, path: `/api/project-roles` };
    const response = await requestApi<ProjectRoleResponse[]>(endpoint);
    return { data: normalizeProjectRoles(response.data || []), meta: response.meta };
  },

  async updateMemberRole(projectId: string, memberId: number, roleId: number): Promise<ApiResponse<ProjectMemberResponse>> {
    const endpoint = { method: "PATCH" as const, path: `/api/projects/${projectId}/members/${memberId}` };
    const response = await requestApi<ProjectMemberResponse>(endpoint, {
      body: JSON.stringify({ role_id: roleId }),
    });
    return { data: response.data, meta: response.meta };
  },

  async addMember(projectId: string, userId: string, roleId: number = 2): Promise<ApiResponse<ProjectMemberResponse>> {
    const endpoint = { method: "POST" as const, path: `/api/projects/${projectId}/members` };
    const response = await requestApi<ProjectMemberResponse>(endpoint, {
      body: JSON.stringify({
        user_id: parseInt(userId.replace("usr-", ""), 10),
        role_id: roleId,
      })
    });
    return { data: response.data, meta: response.meta };
  },

  async removeMember(projectId: string, memberId: number): Promise<ApiResponse<Record<string, never>>> {
    const endpoint = { method: "DELETE" as const, path: `/api/projects/${projectId}/members/${memberId}` };
    const response = await requestApi<Record<string, never>>(endpoint);
    return { data: response.data, meta: response.meta };
  },
};
