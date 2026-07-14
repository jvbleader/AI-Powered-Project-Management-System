import type { InsightType } from "./common";

export interface AiInsight {
  id: string;
  title: string;
  summary: string;
  type: InsightType;
  source: string;
  actionLabel: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface AiReport {
  id: string;
  title: string;
  summary: string;
  chartLabel: string;
  metric: string;
}

export interface AiWorkspaceBrief {
  messages: AiMessage[];
  reports: AiReport[];
  prompts: string[];
  memoryModes: string[];
}

export type AiQuickResponseAction =
  | "daily_priority"
  | "stalled_tasks"
  | "critical_overdue"
  | "follow_up_members"
  | "leader_brief"
  | "task_health";

export interface AiQuickResponseEntity {
  type: "task" | "user" | "project";
  id: string;
  label: string;
  meta?: string | null;
}

export interface AiQuickResponseRequest {
  action: AiQuickResponseAction;
  projectId: string;
  taskId?: string | null;
}

export interface AiQuickResponse {
  action: AiQuickResponseAction;
  title: string;
  summary: string;
  evidence: string[];
  recommendations: string[];
  entities: AiQuickResponseEntity[];
  generatedAt: string;
  dataFreshnessNote: string;
}
