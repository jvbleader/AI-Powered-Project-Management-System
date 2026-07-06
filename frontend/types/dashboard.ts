import type { HealthTone } from "./common";
import type { Project } from "./project";
import type { Sprint } from "./sprint";
import type { Task } from "./task";
import type { UserProfile } from "./user";
import type { LogworkEntry } from "./logwork";
import type { AiInsight } from "./ai";

export interface DashboardStat {
  label: string;
  value: string;
  change: string;
  tone: HealthTone | "accent";
}

export interface DashboardOverview {
  activeProject: Project;
  activeSprint: Sprint;
  portfolioProgress: number;
  stats: DashboardStat[];
  overdueTasks: Task[];
  workloadBoard: Array<{
    user: UserProfile;
    utilization: number;
  }>;
  recentLogwork: LogworkEntry[];
  aiInsights: AiInsight[];
}

export interface WorkspaceShellData {
  currentUser: UserProfile;
  activeProjects: number;
  openTasks: number;
  missingLogwork: number;
  alertCount: number;
}
