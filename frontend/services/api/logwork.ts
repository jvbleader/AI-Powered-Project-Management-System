import { resolveLogworkTitle } from "@/lib/utils/logwork";
import { LogworkFilters, UserProfile, TaskLogworkEntry, ApiResponse } from "@/types";
import { apiEndpoints, requestApi, wrapBackendResponse } from "./core";

export interface PaginatedLogworks {
  items: TaskLogworkEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const logworkApi = {
  async list(filters?: LogworkFilters, viewer?: UserProfile | null): Promise<ApiResponse<PaginatedLogworks>> {
    void viewer; // The backend uses the token for identity
    const searchParams = new URLSearchParams();
    if (filters?.projectId) searchParams.append("project_id", filters.projectId);
    if (filters?.userId) searchParams.append("user_id", filters.userId);
    // If status filter exists, you could append it. Assuming "status" in future LogworkFilters.

    const endpoint = {
      method: "GET" as const,
      path: `/api/v1/logworks?${searchParams.toString()}`
    };

    try {
      const result = await requestApi<{
        items: any[];
        total: number;
        page: number;
        page_size: number;
        total_pages: number;
      }>(endpoint);

      const items = result.data.items.map(item => ({
        id: item.id.toString(),
        taskId: item.task_id.toString(),
        userId: item.user_id ? `usr-${item.user_id}` : "",
        userName: item.user_name || "",
        workDate: item.work_date,
        hoursSpent: item.hours_spent,
        title: resolveLogworkTitle(item.title, item.work_content),
        workContent: item.work_content,
        comment: item.comment,
        progressPercent: item.progress_percent,
        status: item.status,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        projectName: item.project_name,
        taskTitle: item.task_title
      })) as TaskLogworkEntry[];

      return wrapBackendResponse({
        items,
        total: result.data.total,
        page: result.data.page,
        pageSize: result.data.page_size,
        totalPages: result.data.total_pages
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Failed to load logworks");
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async create(payload: Record<string, any>) {
    try {
      const endpoint = {
        method: "POST" as const,
        path: `/api/v1/tasks/${payload.taskId || payload.task_id}/logworks`
      };
      const body = {
        work_date: payload.date || payload.workDate || new Date().toISOString().split('T')[0],
        hours_spent: payload.hours || payload.hoursSpent,
        title: payload.title || payload.name || "",
        work_content: payload.note || payload.workContent || "",
        comment: payload.comment || "",
        progress_percent: payload.progressPercent || 0
      };

      const result = await requestApi(endpoint, { body: JSON.stringify(body) });
      return wrapBackendResponse(result.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Failed to create logwork");
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async update(entryId: string, payload: Record<string, any>) {
    try {
      const endpoint = {
        method: "PUT" as const,
        path: `/api/v1/logworks/${entryId}`
      };
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {};
      if (payload.hours !== undefined) body.hours_spent = payload.hours;
      if (payload.hoursSpent !== undefined) body.hours_spent = payload.hoursSpent;
      if (payload.title !== undefined) body.title = payload.title;
      if (payload.note !== undefined) body.work_content = payload.note;
      if (payload.workContent !== undefined) body.work_content = payload.workContent;
      if (payload.comment !== undefined) body.comment = payload.comment;
      if (payload.progressPercent !== undefined) body.progress_percent = payload.progressPercent;

      const result = await requestApi(endpoint, { body: JSON.stringify(body) });
      return wrapBackendResponse(result.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Failed to update logwork");
    }
  },

  async remove(entryId: string) {
    try {
      const endpoint = {
        method: "DELETE" as const,
        path: `/api/v1/logworks/${entryId}`
      };
      const result = await requestApi(endpoint);
      return wrapBackendResponse(result.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Failed to delete logwork");
    }
  },
};
