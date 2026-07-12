export type ProjectStatus = "PLANNING" | "ACTIVE" | "AT_RISK" | "COMPLETED";

export interface ProjectMetrics {
  completedTasks: number;
  overdueTasks: number;
  logworkCoverage: number;
  velocity: number;
  totalTasks: number;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  managerId: string;
  managerName?: string;
  memberIds: string[];
  startDate: string;
  endDate: string;
  currentSprintId: string | null;
  objectives: string[];
  metrics: ProjectMetrics;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  managerId?: string;
  search?: string;
}
