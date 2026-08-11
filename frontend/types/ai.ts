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
