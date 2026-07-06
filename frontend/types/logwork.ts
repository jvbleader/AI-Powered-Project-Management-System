import type { WorklogMood } from "./common";

export interface LogworkEntry {
  id: string;
  taskId: string;
  userId: string;
  date: string;
  hours: number;
  note: string;
  mood: WorklogMood;
}

export interface LogworkFilters {
  projectId?: string;
  userId?: string;
}
