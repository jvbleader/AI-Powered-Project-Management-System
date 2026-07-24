import { Sprint, SprintFilters, UserProfile } from "@/types";
import { apiEndpoints, requestApi, respond } from "./core";

export const sprintApi = {
  async list(filters?: SprintFilters, viewer?: UserProfile | null) {
    if (filters?.projectId) {
      const endpoint = apiEndpoints.sprints.list(filters.projectId);
      return requestApi<Sprint[]>(endpoint, undefined);
    }
    const endpoint = { method: "GET" as const, path: "/api/sprints" };
    return requestApi<Sprint[]>(endpoint, undefined);
  },

  async get(sprintId: string, viewer?: UserProfile | null) {
    return requestApi<Sprint>(apiEndpoints.sprints.detail(sprintId));
  },

  async create(projectId: string, payload: Omit<Sprint, "id" | "projectId">) {
    const backendPayload = {
      name: payload.name,
      goal: payload.goal,
      start_date: payload.plannedStart,
      end_date: payload.plannedEnd,
      status: payload.status?.toLowerCase(),
    };
    return requestApi<Sprint>(apiEndpoints.sprints.create(projectId), {
      body: JSON.stringify(backendPayload),
    });
  },

  async update(sprintId: string, payload: Partial<Sprint>) {
    const backendPayload: any = {};
    if (payload.name !== undefined) backendPayload.name = payload.name;
    if (payload.goal !== undefined) backendPayload.goal = payload.goal;
    if (payload.plannedStart !== undefined) backendPayload.start_date = payload.plannedStart;
    if (payload.plannedEnd !== undefined) backendPayload.end_date = payload.plannedEnd;
    if (payload.status !== undefined) backendPayload.status = payload.status.toLowerCase();
    
    return requestApi<Sprint>(apiEndpoints.sprints.update(sprintId), {
      body: JSON.stringify(backendPayload),
    });
  },
};

