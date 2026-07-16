import type { HealthTone } from "./common";
import type { Project } from "./project";
import type { TaskPriority } from "./task";

export interface DashboardTaskSummary {
  todo: number;
  inProgress: number;
  done: number;
  total: number;
  overdue: number;
}

export interface DashboardSprintSummary {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "REVIEW" | "CLOSED";
  goal?: string | null;
  startDate: string;
  endDate: string;
  plannedProgress: number;
  actualProgress: number;
  totalTasks: number;
  todoCount: number;
  inProgressCount: number;
  doneCount: number;
  estimatedHours: number;
  loggedHours: number;
  health: HealthTone;
}

export interface DashboardTaskPreview {
  id: string;
  key: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  assigneeName?: string | null;
  sprintName?: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface DashboardWorkloadMember {
  userId: string;
  memberId: string;
  name: string;
  email: string;
  roleName: string;
  assignedTasks: number;
  todoTasks: number;
  inProgressTasks: number;
  doneTasks: number;
  overdueTasks: number;
  estimatedHours: number;
  loggedHours: number;
  progress: number;
}

export interface DashboardRecentLogwork {
  id: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  userId: string;
  userName: string;
  workDate: string;
  hours: number;
  note: string;
  progressPercent: number;
}

export interface DashboardOverview {
  project: Project | null;
  portfolioProgress: number;
  projectProgress: number;
  activeSprintProgress: number;
  estimatedHoursTotal: number;
  estimatedHoursDone: number;
  estimatedHoursRemaining: number;
  logworkCoverage: number;
  memberCount: number;
  membersLoggedToday: number;
  criticalAlerts: number;
  projectsInScope: number;
  openTasksInScope: number;
  taskSummary: DashboardTaskSummary;
  activeSprint: DashboardSprintSummary | null;
  sprintSummaries: DashboardSprintSummary[];
  overdueTasks: DashboardTaskPreview[];
  activeTasks: DashboardTaskPreview[];
  workloadBoard: DashboardWorkloadMember[];
  recentLogwork: DashboardRecentLogwork[];
}

export interface WorkspaceShellData {
  currentUser: import("./user").UserProfile;
  activeProjects: number;
  openTasks: number;
  missingLogwork: number;
  alertCount: number;
}

export interface ProjectHealthPreview {
  id: string;
  name: string;
  code: string;
  status: string;
  progress: number;
  totalTasks: number;
  health: "on-track" | "watch" | "critical";
}

export interface GlobalDashboardOverview {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  taskSummary: DashboardTaskSummary;
  globalWorkload: DashboardWorkloadMember[];
  upcomingDeadlines: DashboardTaskPreview[];
  overdueTasks: DashboardTaskPreview[];
  completedTasks: DashboardTaskPreview[];
  projectHealths: ProjectHealthPreview[];
  activeSprints: DashboardSprintSummary[];
  recentLogworks: DashboardRecentLogwork[];
}
