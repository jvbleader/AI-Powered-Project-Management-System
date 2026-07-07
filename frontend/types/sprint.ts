import type { HealthTone } from "./common";

export type SprintStatus = "PLANNED" | "ACTIVE" | "REVIEW" | "CLOSED";

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  status: SprintStatus;
  progress: number;
  committedPoints: number;
  completedPoints: number;
  plannedStart: string;
  plannedEnd: string;
  health: HealthTone;
  focusAreas: string[];
}

export interface SprintFilters {
  projectId?: string;
  status?: SprintStatus;
}
