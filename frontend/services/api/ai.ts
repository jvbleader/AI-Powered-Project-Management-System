import { AiQuickResponse, AiQuickResponseRequest } from "@/types";

import { apiEndpoints, requestApi } from "./core";

type BackendQuickResponseEntity = {
  type: AiQuickResponse["entities"][number]["type"];
  id: string | number;
  label?: string | null;
  meta?: string | null;
};

type BackendQuickResponse = {
  action: AiQuickResponse["action"];
  title?: string | null;
  summary?: string | null;
  evidence?: string[] | null;
  recommendations?: string[] | null;
  entities?: BackendQuickResponseEntity[] | null;
  generated_at?: string | null;
  data_freshness_note?: string | null;
};

function mapQuickResponse(data: BackendQuickResponse): AiQuickResponse {
  return {
    action: data.action,
    title: data.title ?? "",
    summary: data.summary ?? "",
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
    entities: Array.isArray(data.entities)
      ? data.entities.map((entity) => ({
          type: entity.type,
          id: String(entity.id),
          label: entity.label ?? "",
          meta: entity.meta ?? null,
        }))
      : [],
    generatedAt: data.generated_at ?? new Date().toISOString(),
    dataFreshnessNote: data.data_freshness_note ?? "",
  };
}

type BackendClassifyIntentResponse = {
  intent: string;
};

export const aiApi = {
  async classifyIntent(payload: AiQuickResponseRequest) {
    const response = await requestApi<BackendClassifyIntentResponse>(apiEndpoints.ai.classifyIntent, {
      body: JSON.stringify({
        action: payload.action,
        prompt: payload.prompt,
        project_id: payload.projectId ? Number(payload.projectId) : null,
        task_id: payload.taskId ? Number(payload.taskId) : null,
      }),
    });
    return response.data;
  },

  async executeAi(payload: AiQuickResponseRequest & { intent: string }) {
    const response = await requestApi<BackendQuickResponse>(apiEndpoints.ai.executeAi, {
      body: JSON.stringify({
        action: payload.action,
        prompt: payload.prompt,
        project_id: payload.projectId ? Number(payload.projectId) : null,
        task_id: payload.taskId ? Number(payload.taskId) : null,
        intent: payload.intent,
      }),
    });

    return {
      data: mapQuickResponse(response.data),
      meta: response.meta,
    };
  },
};
