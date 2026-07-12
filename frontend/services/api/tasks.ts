import {
  Task,
  TaskComment,
  TaskFilters,
  UserProfile,
  ApiResponse,
  EnrichedTask,
  Project,
} from "@/types";
import {
  requestApi,
  apiEndpoints,
  filterAttachments,
  respond,
  toInitials,
  wrapBackendResponse,
} from "./core";
import { projectApi } from "./projects";

type BoardContext = {
  projects?: Project[];
  users?: UserProfile[];
};

function emptyUsersResponse(): ApiResponse<UserProfile[]> {
  return wrapBackendResponse([]);
}

function toFrontendUserId(userId: unknown) {
  if (typeof userId === "string") {
    return userId.startsWith("usr-") ? userId : `usr-${userId}`;
  }

  if (typeof userId === "number") {
    return `usr-${userId}`;
  }

  return "";
}

function normalizeTaskStatus(status: unknown): Task["status"] {
  if (typeof status !== "string") {
    return "TODO";
  }

  const normalized = status.toUpperCase();
  if (normalized === "DONE") {
    return "DONE";
  }

  if (normalized === "REVIEW" || normalized === "BLOCKED" || normalized === "INPROGRESS") {
    return "IN_PROGRESS";
  }

  if (normalized === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }

  return "TODO";
}

function mapBackendTask(data: any): Task {
  const primaryAssignee = data.assignees?.[0];

  return {
    id: data.id.toString(),
    projectId: data.project_id?.toString() || "",
    sprintId: data.sprint_id?.toString() || null,
    key: data.key || `TASK-${data.id}`,
    title: data.title || "",
    description: data.description || "",
    status: normalizeTaskStatus(data.status),
    priority: (data.priority?.toUpperCase() || "MEDIUM") as Task["priority"],
    assigneeId: primaryAssignee ? toFrontendUserId(primaryAssignee.user_id) : "",
    assigneeName: primaryAssignee?.name || "",
    assigneeEmail: primaryAssignee?.email || "",
    reporterId: toFrontendUserId(data.created_by_user_id),
    startDate: data.start_date || data.created_at || "",
    dueDate: data.deadline || "",
    estimateHours: data.estimated_hours || 0,
    spentHours: data.spentHours || 0, // Need backend logworks sum to get real spent hours, fallback 0
    tags: [],
    blockers: [],
    commentsCount: 0,
    parentTaskId: data.parent_task_id?.toString() || null,
    lastActivity: data.updated_at || "",
  };
}

function buildSyntheticAssignee(task: Task): UserProfile | null {
  if (!task.assigneeId || !task.assigneeName) {
    return null;
  }

  return {
    id: task.assigneeId,
    name: task.assigneeName,
    email: task.assigneeEmail || "",
    role: "MEMBER",
    roles: ["MEMBER"],
    title: task.assigneeEmail || "Thành viên dự án",
    initials: toInitials(task.assigneeName),
    presence: "online",
    capacityHours: 40,
    workloadHours: 0,
    focusScore: 0,
    isActive: true,
    status: "ACTIVE",
  };
}

function enrichTaskWithContext(task: Task, project: Project, users: UserProfile[]): EnrichedTask {
  const assignee =
    (task.assigneeId ? users.find((user) => user.id === task.assigneeId) : null) ??
    buildSyntheticAssignee(task);

  return {
    ...task,
    project,
    assignee: assignee as any,
    reporter: null as any,
    sprint: null as any,
  };
}

export const taskApi = {
  async list(filters?: TaskFilters, viewer?: UserProfile | null): Promise<ApiResponse<Task[]>> {
    const params = new URLSearchParams();
    if (filters?.sprintId) {
      params.append("sprint_id", filters.sprintId);
    }

    const query = params.toString();
    const path = filters?.projectId
      ? `/api/projects/${filters.projectId}/tasks${query ? `?${query}` : ""}`
      : `/api/tasks${query ? `?${query}` : ""}`;
    const endpoint = {
      method: "GET" as const,
      path,
    };

    const response = await requestApi<any[]>(endpoint);
    return { data: response.data.map(mapBackendTask), meta: response.meta };
  },

  async get(taskId: string, viewer?: UserProfile | null): Promise<ApiResponse<Task>> {
    void viewer;
    const endpoint = apiEndpoints.tasks.detail(taskId);
    const response = await requestApi<any>(endpoint);
    return { data: mapBackendTask(response.data), meta: response.meta };
  },

  async create(payload: Omit<Task, "id"> & { projectId: string }): Promise<ApiResponse<Task>> {
    const endpoint = {
      method: "POST" as const,
      path: `/api/projects/${payload.projectId}/tasks`,
    };

    const backendPayload = {
      title: payload.title,
      description: payload.description.trim() ? payload.description.trim() : null,
      status: payload.status?.toLowerCase(),
      priority: payload.priority?.toLowerCase(),
      start_date: payload.startDate,
      deadline: payload.dueDate || null,
      estimated_hours: payload.estimateHours > 0 ? payload.estimateHours : null,
      sprint_id: payload.sprintId ? parseInt(payload.sprintId) : null,
      parent_task_id: payload.parentTaskId ? parseInt(payload.parentTaskId) : null,
      assignee_user_ids: payload.assigneeId ? [payload.assigneeId] : [],
    };

    const response = await requestApi<any>(endpoint, {
      body: JSON.stringify(backendPayload),
    });

    return { data: mapBackendTask(response.data), meta: response.meta };
  },

  async update(taskId: string, payload: Partial<Task>): Promise<ApiResponse<Task>> {
    const endpoint = apiEndpoints.tasks.update(taskId);

    const backendPayload: any = {};
    if ("title" in payload) backendPayload.title = payload.title;
    if ("description" in payload) {
      backendPayload.description =
        typeof payload.description === "string"
          ? payload.description.trim() || null
          : payload.description ?? null;
    }
    if ("status" in payload && payload.status) backendPayload.status = payload.status.toLowerCase();
    if ("priority" in payload && payload.priority)
      backendPayload.priority = payload.priority.toLowerCase();
    if ("startDate" in payload) backendPayload.start_date = payload.startDate;
    if ("dueDate" in payload) backendPayload.deadline = payload.dueDate || null;
    if ("estimateHours" in payload)
      backendPayload.estimated_hours =
        typeof payload.estimateHours === "number" && payload.estimateHours > 0
          ? payload.estimateHours
          : null;
    if ("sprintId" in payload) {
      backendPayload.sprint_id = payload.sprintId ? parseInt(payload.sprintId) : null;
    }
    if ("parentTaskId" in payload) {
      backendPayload.parent_task_id = payload.parentTaskId ? parseInt(payload.parentTaskId) : null;
    }

    const response = await requestApi<any>(endpoint, {
      body: JSON.stringify(backendPayload),
    });

    return { data: mapBackendTask(response.data), meta: response.meta };
  },

  async updateStatus(taskId: string, status: Task["status"]): Promise<ApiResponse<Task>> {
    return this.update(taskId, { status });
  },

  async updateAssignee(taskId: string, assigneeId: string): Promise<ApiResponse<any>> {
    const endpoint = {
      method: "POST" as const,
      path: `/api/tasks/${taskId}/assignees`,
    };
    const response = await requestApi<any>(endpoint, {
      body: JSON.stringify({ user_id: assigneeId }),
    });
    return response;
  },

  async getEnrichedTask(
    taskId: string,
    viewer?: UserProfile | null,
    context?: BoardContext,
  ): Promise<ApiResponse<EnrichedTask>> {
    const [taskRes, usersRes] = await Promise.all([
      this.get(taskId, viewer),
      context?.users?.length
        ? Promise.resolve({ data: context.users } as ApiResponse<UserProfile[]>)
        : Promise.resolve(emptyUsersResponse()),
    ]);
    const task = taskRes.data;
    const project =
      context?.projects?.find((candidate) => candidate.id === task.projectId) ??
      (await projectApi.get(task.projectId)).data;

    return {
      data: enrichTaskWithContext(task, project, usersRes.data),
      meta: taskRes.meta,
    };
  },

  async getEnrichedBoard(
    filters?: TaskFilters,
    viewer?: UserProfile | null,
    context?: BoardContext,
  ): Promise<ApiResponse<EnrichedTask[]>> {
    if (!filters?.projectId) {
      const [projectsRes, usersRes, tasksRes] = await Promise.all([
        context?.projects?.length
          ? Promise.resolve({ data: context.projects } as ApiResponse<Project[]>)
          : projectApi.list(undefined, viewer),
        context?.users?.length
          ? Promise.resolve({ data: context.users } as ApiResponse<UserProfile[]>)
          : Promise.resolve(emptyUsersResponse()),
        this.list(filters, viewer),
      ]);
      const projects = projectsRes.data;
      const users = usersRes.data;
      const projectsById = new Map(projects.map((project) => [project.id, project]));
      const enrichedTasks = tasksRes.data.flatMap((task) => {
        const project = projectsById.get(task.projectId);

        if (!project) {
          return [];
        }

        return [enrichTaskWithContext(task, project, users)];
      });

      return { data: enrichedTasks, meta: tasksRes.meta };
    }

    const [tasksRes, projectRes, usersRes] = await Promise.all([
      this.list(filters, viewer),
      context?.projects?.length
        ? Promise.resolve({
            data: context.projects.find((project) => project.id === filters.projectId) ?? null,
          } as ApiResponse<Project | null>)
        : projectApi.get(filters.projectId),
      context?.users?.length
        ? Promise.resolve({ data: context.users } as ApiResponse<UserProfile[]>)
        : Promise.resolve(emptyUsersResponse()),
    ]);

    const tasks = tasksRes.data;
    const project = projectRes.data ?? (await projectApi.get(filters.projectId)).data;
    const users = usersRes.data;

    const enrichedTasks: EnrichedTask[] = tasks.map((task) =>
      enrichTaskWithContext(task, project, users),
    );

    return { data: enrichedTasks, meta: tasksRes.meta };
  },

  async listComments(
    taskId: string,
    viewer?: UserProfile | null,
  ): Promise<ApiResponse<TaskComment[]>> {
    const endpoint = {
      method: "GET" as const,
      path: `/api/tasks/${taskId}/comments`,
    };
    const response = await requestApi<any[]>(endpoint);
    const comments: TaskComment[] = response.data.map((c) => ({
      id: c.id.toString(),
      taskId: c.task_id.toString(),
      userId: `usr-${c.project_member_id}`,
      content: c.content,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
    return { data: comments, meta: response.meta };
  },

  async addComment(
    payload: Omit<TaskComment, "id" | "createdAt" | "updatedAt">,
  ): Promise<ApiResponse<TaskComment>> {
    const endpoint = {
      method: "POST" as const,
      path: `/api/tasks/${payload.taskId}/comments`,
    };
    const response = await requestApi<any>(endpoint, {
      body: JSON.stringify({ content: payload.content }),
    });
    const c = response.data;
    return {
      data: {
        id: c.id.toString(),
        taskId: c.task_id.toString(),
        userId: `usr-${c.project_member_id}`,
        content: c.content,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      },
      meta: response.meta,
    };
  },

  async getAttachments(taskId: string, viewer?: UserProfile | null) {
    return respond(filterAttachments(taskId, viewer), 90);
  },

  async updateComment(commentId: string, content: string): Promise<ApiResponse<any>> {
    // Note: Backend endpoint for update comment hasn't been implemented yet. Mocking response for now.
    return {
      data: { id: commentId, content, updatedAt: new Date().toISOString() },
      meta: { source: "mock", latencyMs: 120, generatedAt: new Date().toISOString() },
    };
  },
};
