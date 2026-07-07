import { Project, ProjectFilters, UserProfile, ApiResponse } from "@/types";
import { requestApi, apiEndpoints } from "./core";

function mapBackendProject(data: any): Project {
  return {
    ...data,
    id: data.id.toString(),
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
    },
  };
}

export const projectApi = {
  async list(filters?: ProjectFilters, viewer?: UserProfile | null): Promise<ApiResponse<Project[]>> {
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
    
    const response = await requestApi<any>(endpoint);
    const items = response.data.items ? response.data.items.map(mapBackendProject) : [];
    
    return { data: items, meta: response.meta };
  },

  async get(projectId: string, viewer?: UserProfile | null): Promise<ApiResponse<Project>> {
    const endpoint = apiEndpoints.projects.detail(projectId);
    const response = await requestApi<any>(endpoint);
    return { data: mapBackendProject(response.data), meta: response.meta };
  },

  async create(payload: Record<string, any>): Promise<ApiResponse<Project>> {
    const response = await requestApi<any>(apiEndpoints.projects.create, {
      body: JSON.stringify(payload),
    });
    const created = mapBackendProject(response.data);
    return { data: created, meta: response.meta };
  },

  async update(projectId: string, payload: Partial<Project>): Promise<ApiResponse<Project>> {
    const endpoint = apiEndpoints.projects.update(projectId);
    
    const backendPayload: any = { ...payload };
    if (payload.startDate) backendPayload.start_date = payload.startDate;
    if (payload.endDate) backendPayload.end_date = payload.endDate;
    
    const response = await requestApi<any>(endpoint, {
      body: JSON.stringify(backendPayload),
    });
    
    return { data: mapBackendProject(response.data), meta: response.meta };
  },

  async addMember(projectId: string, memberId: string): Promise<ApiResponse<Project>> {
    const endpoint = { method: "POST" as const, path: `/api/projects/${projectId}/members` };
    await requestApi<any>(endpoint, {
      body: JSON.stringify({
        user_id: parseInt(memberId.replace("usr-", ""), 10),
        role_id: 2,
      })
    });
    return this.get(projectId);
  },

  async removeMember(projectId: string, memberId: string): Promise<ApiResponse<Project>> {
    const userId = parseInt(memberId.replace("usr-", ""), 10);
    const endpoint = { method: "DELETE" as const, path: `/api/projects/${projectId}/members/${userId}` };
    await requestApi<any>(endpoint);
    return this.get(projectId);
  },
};
