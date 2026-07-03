import { logworkEntries, projects, sprints, tasks, users } from "@/lib/mock/data";
import type {
  LogworkEntry,
  Project,
  Sprint,
  Task,
  TaskStatus,
  UserProfile,
  UserRole,
} from "@/types/dto";

export const DEMO_TODAY = "2026-06-29";

const privilegedRoles = new Set<UserRole>(["ADMIN", "MANAGER", "LEADER"]);
const reviewLikeStatuses = new Set<TaskStatus>(["IN_PROGRESS", "REVIEW", "BLOCKED"]);

export function getDemoUserByEmail(email?: string | null) {
  if (!email) {
    return null;
  }

  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function getDemoUserById(id?: string | null) {
  if (!id) {
    return null;
  }

  return users.find((user) => user.id === id) ?? null;
}

export function normalizeViewer(viewer?: UserProfile | null) {
  if (!viewer) {
    return users[0];
  }

  const matchedUser = getDemoUserByEmail(viewer.email) ?? getDemoUserById(viewer.id);

  if (!matchedUser) {
    return viewer;
  }

  return {
    ...matchedUser,
    ...viewer,
    avatarUrl: viewer.avatarUrl ?? matchedUser.avatarUrl,
  };
}

export function isPrivilegedUser(viewer?: UserProfile | null) {
  return privilegedRoles.has(normalizeViewer(viewer).role);
}

export function canManageProject(viewer: UserProfile, project: Project) {
  if (viewer.role === "ADMIN") {
    return true;
  }

  if (viewer.role === "MANAGER") {
    return project.managerId === viewer.id || project.memberIds.includes(viewer.id);
  }

  if (viewer.role === "LEADER") {
    return project.memberIds.includes(viewer.id);
  }

  return false;
}

export function getAccessibleProjects(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);

  if (currentViewer.role === "ADMIN") {
    return [...projects];
  }

  return projects.filter((project) => {
    return project.managerId === currentViewer.id || project.memberIds.includes(currentViewer.id);
  });
}

export function getManagedProjects(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);

  if (currentViewer.role === "ADMIN") {
    return [...projects];
  }

  if (currentViewer.role === "MANAGER") {
    return projects.filter((project) => project.managerId === currentViewer.id);
  }

  if (currentViewer.role === "LEADER") {
    return projects.filter((project) => project.memberIds.includes(currentViewer.id));
  }

  return [];
}

export function getAccessibleSprints(viewer?: UserProfile | null) {
  const accessibleProjectIds = new Set(getAccessibleProjects(viewer).map((project) => project.id));
  const currentViewer = normalizeViewer(viewer);

  if (isPrivilegedUser(currentViewer)) {
    return sprints.filter((sprint) => accessibleProjectIds.has(sprint.projectId));
  }

  const ownSprintIds = new Set(
    tasks
      .filter((task) => task.assigneeId === currentViewer.id && task.sprintId)
      .map((task) => task.sprintId),
  );

  return sprints.filter((sprint) => accessibleProjectIds.has(sprint.projectId) && ownSprintIds.has(sprint.id));
}

export function getAccessibleTasks(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);
  const accessibleProjectIds = new Set(getAccessibleProjects(currentViewer).map((project) => project.id));
  const scopedTasks = tasks.filter((task) => accessibleProjectIds.has(task.projectId));

  if (isPrivilegedUser(currentViewer)) {
    return scopedTasks;
  }

  return scopedTasks.filter((task) => task.assigneeId === currentViewer.id);
}

export function getAccessibleLogwork(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);
  const accessibleTaskIds = new Set(getAccessibleTasks(currentViewer).map((task) => task.id));

  if (isPrivilegedUser(currentViewer)) {
    return logworkEntries.filter((entry) => accessibleTaskIds.has(entry.taskId));
  }

  return logworkEntries.filter((entry) => entry.userId === currentViewer.id && accessibleTaskIds.has(entry.taskId));
}

export function getProjectMembers(project: Project) {
  return users.filter((user) => project.memberIds.includes(user.id));
}

export function getProjectManager(project: Project) {
  return getDemoUserById(project.managerId) ?? users[0];
}

export function getProjectSprints(projectId: string) {
  return sprints.filter((sprint) => sprint.projectId === projectId);
}

export function getProjectTasks(projectId: string) {
  return tasks.filter((task) => task.projectId === projectId);
}

export function getSprintTasks(sprintId: string) {
  return tasks.filter((task) => task.sprintId === sprintId);
}

export function getTaskAssignee(task: Task) {
  return getDemoUserById(task.assigneeId) ?? users[0];
}

export function getTaskReporter(task: Task) {
  return getDemoUserById(task.reporterId) ?? users[0];
}

export function isTaskOverdue(task: Task, today = DEMO_TODAY) {
  return task.status !== "DONE" && task.dueDate < today;
}

export function categorizeTask(task: Task, today = DEMO_TODAY) {
  if (task.status === "DONE") {
    return "DONE";
  }

  if (isTaskOverdue(task, today)) {
    return "OUTDATE";
  }

  if (task.status === "TODO") {
    return "TODO";
  }

  if (reviewLikeStatuses.has(task.status)) {
    return "IN_PROGRESS";
  }

  return "TODO";
}

export function summarizeTaskCategories(taskList: Task[]) {
  return taskList.reduce(
    (summary, task) => {
      const key = categorizeTask(task);
      summary[key] += 1;
      return summary;
    },
    { TODO: 0, IN_PROGRESS: 0, DONE: 0, OUTDATE: 0 },
  );
}

export function calculateProjectCompletion(taskList: Task[]) {
  if (!taskList.length) {
    return 0;
  }

  const completed = taskList.filter((task) => task.status === "DONE").length;
  return Math.round((completed / taskList.length) * 100);
}

export function calculateSprintCompletion(sprint: Sprint) {
  if (!sprint.committedPoints) {
    return sprint.progress;
  }

  return Math.round((sprint.completedPoints / sprint.committedPoints) * 100);
}

export function calculateMemberHours(taskList: Task[], entries: LogworkEntry[], userId: string) {
  const ownedTaskIds = new Set(taskList.filter((task) => task.assigneeId === userId).map((task) => task.id));

  return entries
    .filter((entry) => entry.userId === userId && ownedTaskIds.has(entry.taskId))
    .reduce((sum, entry) => sum + entry.hours, 0);
}

export function getSuggestedActiveProject(viewer?: UserProfile | null) {
  const managed = getManagedProjects(viewer);
  const accessible = getAccessibleProjects(viewer);

  return managed[0] ?? accessible[0] ?? projects[0];
}

export function getSuggestedActiveSprint(viewer?: UserProfile | null, projectId?: string) {
  const scopedSprints = projectId
    ? getAccessibleSprints(viewer).filter((sprint) => sprint.projectId === projectId)
    : getAccessibleSprints(viewer);

  return scopedSprints.find((sprint) => sprint.status === "ACTIVE") ?? scopedSprints[0] ?? sprints[0];
}
