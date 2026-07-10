import type { UserProfile } from "./user";
import type { Project } from "./project";
import type { Sprint } from "./sprint";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "BLOCKED" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Task {
  id: string;
  key: string;
  projectId: string;
  sprintId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  assigneeName?: string;
  assigneeEmail?: string;
  reporterId: string;
  startDate: string;
  dueDate: string;
  estimateHours: number;
  spentHours: number;
  tags: string[];
  blockers: string[];
  commentsCount: number;
  lastActivity: string;
}

export interface EnrichedTask extends Task {
  assignee: UserProfile;
  reporter: UserProfile;
  project: Project;
  sprint: Sprint | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt?: string | null;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  sizeLabel: string;
}

export interface TaskFilters {
  projectId?: string;
  sprintId?: string;
  assigneeId?: string;
  status?: TaskStatus;
  search?: string;
}
