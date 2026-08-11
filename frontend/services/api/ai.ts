import { apiEndpoints, requestApi } from "./core";

export const aiApi = {
  async classifyIntent(payload: { prompt?: string | null; projectId?: string | null } = {}) {
    const response = await requestApi<{ intent: string }>(apiEndpoints.ai.classifyIntent, {
      body: JSON.stringify({
        prompt: payload.prompt ?? "ping",
        project_id: payload.projectId ? Number(payload.projectId) : null,
      }),
    });
    return response.data;
  },

  async clearSession(sessionId: string) {
    const endpoint = apiEndpoints.ai.clearSession(sessionId);
    await requestApi(endpoint);
  },

  async getSessions() {
    const response = await requestApi<any[]>(apiEndpoints.ai.sessions);
    return response.data;
  },

  async createSession(title: string) {
    const response = await requestApi<any>(
      { path: apiEndpoints.ai.sessions.path, method: "POST" },
      {
        body: JSON.stringify({ title }),
      }
    );
    return response.data;
  },

  async updateSession(sessionId: string, title: string) {
    const response = await requestApi<any>(apiEndpoints.ai.updateSession(sessionId), {
      body: JSON.stringify({ title }),
    });
    return response.data;
  },

  async getSessionMessages(sessionId: string) {
    const response = await requestApi<any[]>(apiEndpoints.ai.sessionMessages(sessionId));
    return response.data;
  },

  async confirmTasks(projectId: number | null, tasksData: any[], messageId?: number | null) {
    const response = await requestApi<any>(
      { path: "/api/ai/confirm-tasks", method: "POST" },
      {
        body: JSON.stringify({
          project_id: projectId,
          tasks_data: tasksData,
          message_id: messageId ?? null,
        }),
      }
    );
    return response.data;
  },

  async confirmSprintStatus(
    updates: Array<{ sprint_id: number; status: string }>,
    messageId?: number | null
  ) {
    const response = await requestApi<any>(
      { path: "/api/ai/confirm-sprint-status", method: "POST" },
      {
        body: JSON.stringify({
          updates,
          message_id: messageId ?? null,
        }),
      }
    );
    return response.data;
  },

  async updateMessage(messageId: string, content: string) {
    const response = await requestApi<any>(
      { path: `/api/ai/messages/${messageId}`, method: "PUT" },
      {
        body: JSON.stringify({ content }),
      }
    );
    return response.data;
  },

  streamChatUrl: apiEndpoints.ai.chat.path,
};
