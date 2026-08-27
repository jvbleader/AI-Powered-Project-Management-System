import { Sprint, SprintFilters, UserProfile } from "@/types";
import { apiEndpoints, requestApi, wrapBackendResponse } from "./core";

type BackendSprint = {
  id: number | string;
  project_id: number | string;
  name: string;
  goal?: string | null;
  review_note?: string | null;
  status?: string | null;
  start_date: string;
  end_date: string;
};

type BackendSprintUpdate = Partial<
  Pick<BackendSprint, "name" | "goal" | "review_note" | "status" | "start_date" | "end_date">
>;

function toSprintStatus(status?: string | null): Sprint["status"] {
  const normalized = status?.trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "REVIEW" || normalized === "CLOSED") {
    return normalized;
  }
  return "PLANNED";
}

export function toFrontendSprint(sprint: BackendSprint): Sprint {
  return {
    id: String(sprint.id),
    projectId: String(sprint.project_id),
    name: sprint.name,
    goal: sprint.goal ?? "",
    reviewNote: sprint.review_note ?? "",
    status: toSprintStatus(sprint.status),
    progress: 0,
    committedPoints: 0,
    completedPoints: 0,
    plannedStart: sprint.start_date,
    plannedEnd: sprint.end_date,
    health: "on-track",
    focusAreas: [],
  };
}

export const sprintApi = {
  async list(filters?: SprintFilters, viewer?: UserProfile | null) {
    void viewer;
    if (filters?.projectId) {
      const endpoint = apiEndpoints.sprints.list(filters.projectId);
      const response = await requestApi<BackendSprint[]>(endpoint, undefined);
      return wrapBackendResponse(response.data.map(toFrontendSprint));
    }
    const endpoint = { method: "GET" as const, path: "/api/sprints" };
    const response = await requestApi<BackendSprint[]>(endpoint, undefined);
    return wrapBackendResponse(response.data.map(toFrontendSprint));
  },

  async get(sprintId: string, viewer?: UserProfile | null) {
    void viewer;
    const response = await requestApi<BackendSprint>(apiEndpoints.sprints.detail(sprintId));
    return wrapBackendResponse(toFrontendSprint(response.data));
  },

  async create(projectId: string, payload: Omit<Sprint, "id" | "projectId">) {
    const backendPayload = {
      name: payload.name,
      goal: payload.goal,
      review_note: payload.reviewNote,
      start_date: payload.plannedStart,
      end_date: payload.plannedEnd,
      status: payload.status?.toLowerCase(),
    };
    const response = await requestApi<BackendSprint>(apiEndpoints.sprints.create(projectId), {
      body: JSON.stringify(backendPayload),
    });
    return wrapBackendResponse(toFrontendSprint(response.data));
  },

  async update(sprintId: string, payload: Partial<Sprint>) {
    const backendPayload: BackendSprintUpdate = {};
    if (payload.name !== undefined) backendPayload.name = payload.name;
    if (payload.goal !== undefined) backendPayload.goal = payload.goal;
    if (payload.reviewNote !== undefined) backendPayload.review_note = payload.reviewNote;
    if (payload.plannedStart !== undefined) backendPayload.start_date = payload.plannedStart;
    if (payload.plannedEnd !== undefined) backendPayload.end_date = payload.plannedEnd;
    if (payload.status !== undefined) backendPayload.status = payload.status.toLowerCase();
    
    const response = await requestApi<BackendSprint>(apiEndpoints.sprints.update(sprintId), {
      body: JSON.stringify(backendPayload),
    });
    return wrapBackendResponse(toFrontendSprint(response.data));
  },
};
