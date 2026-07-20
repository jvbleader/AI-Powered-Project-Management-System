import type { WorklogMood } from "./common";

export interface LogworkEntry {
  id: string;
  taskId: string;
  userId: string;
  date: string;
  hours: number;
  note: string;
  mood: WorklogMood;
  status?: "PENDING" | "APPROVED" | "REJECTED";
}

export interface TaskLogworkEntry {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  workDate: string;
  hoursSpent: number;
  workContent: string;
  comment?: string;
  progressPercent: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
}

export interface LogworkFilters {
  projectId?: string;
  userId?: string;
}
