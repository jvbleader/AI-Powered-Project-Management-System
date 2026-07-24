export type ProjectStatus = "PLANNING" | "ACTIVE" | "AT_RISK" | "COMPLETED" | "ON_HOLD";

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
  projectType: "agile" | "waterfall";
  status: ProjectStatus;
  progress: number;
  managerId: string;
  managerName?: string;
  departmentId?: number;
  departmentName?: string | null;
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
