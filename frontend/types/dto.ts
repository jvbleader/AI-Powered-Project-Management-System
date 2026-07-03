export type UserRole = "ADMIN" | "MANAGER" | "LEADER" | "MEMBER";

export type JobRole =
  | "FULLSTACK"
  | "BACKEND"
  | "FRONTEND"
  | "AI_ENGINEER"
  | "QA"
  | "DEVOPS"
  | "UI_UX"
  | "PROJECT_MANAGER";

export type PresenceStatus = "online" | "focus" | "offline";

export type ProjectStatus = "PLANNING" | "ACTIVE" | "AT_RISK" | "COMPLETED";

export type SprintStatus = "PLANNED" | "ACTIVE" | "REVIEW" | "CLOSED";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "BLOCKED" | "DONE";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type HealthTone = "on-track" | "watch" | "critical";

export type InsightType = "summary" | "risk" | "opportunity";

export type WorklogMood = "smooth" | "risky" | "blocked";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  initials: string;
  avatarUrl?: string;
  presence: PresenceStatus;
  capacityHours: number;
  workloadHours: number;
  focusScore: number;
  isActive: boolean;
}

export interface ProjectMetrics {
  completedTasks: number;
  overdueTasks: number;
  logworkCoverage: number;
  velocity: number;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  managerId: string;
  memberIds: string[];
  startDate: string;
  endDate: string;
  currentSprintId: string | null;
  objectives: string[];
  metrics: ProjectMetrics;
}

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

export interface Task {
  id: string;
  key: string;
  projectId: string;
  sprintId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  reporterId: string;
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

export interface LogworkEntry {
  id: string;
  taskId: string;
  userId: string;
  date: string;
  hours: number;
  note: string;
  mood: WorklogMood;
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

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserPayload {
  email: string;
  name: string;
  password: string;
  jobRole: JobRole;
  isAdmin: boolean;
}

export interface AdminResetPasswordPayload {
  email: string;
  newPassword: string;
}

export interface AdminDeactivateUserPayload {
  email: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  currentUser: UserProfile;
  workspaceId: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  current_user: UserProfile;
  workspace_id: string;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  managerId?: string;
  search?: string;
}

export interface SprintFilters {
  projectId?: string;
  status?: SprintStatus;
}

export interface TaskFilters {
  projectId?: string;
  sprintId?: string;
  assigneeId?: string;
  status?: TaskStatus;
  search?: string;
}

export interface LogworkFilters {
  projectId?: string;
  userId?: string;
}

export interface ApiMeta {
  source: "mock" | "backend";
  latencyMs: number;
  generatedAt: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}
