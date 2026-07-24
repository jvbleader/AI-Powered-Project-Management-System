import { logworkEntries, projects, sprints, tasks, users } from "@/lib/mock/data";
import { getDirectoryUserByEmail, getDirectoryUserById } from "@/services/users/directory";
import type { LogworkEntry, Project, Sprint, Task, UserProfile, UserRole } from "@/types";

import {
  hasCompanywideProjectAccess,
  isAdminRole,
  canManageProjectsByRole,
} from "@/lib/utils/format";

export const DEMO_TODAY = "2026-06-29";

export function getDemoUserByEmail(email?: string | null) {
  if (!email) {
    return null;
  }

  return (
    getDirectoryUserByEmail(email) ??
    users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ??
    null
  );
}

export function getDemoUserById(id?: string | null) {
  if (!id) {
    return null;
  }

  return getDirectoryUserById(id) ?? users.find((user) => user.id === id) ?? null;
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
  const currentViewer = normalizeViewer(viewer);
  return isAdminRole(currentViewer.role) || canManageProjectsByRole(currentViewer.role, currentViewer.department);
}

export function isAdminUser(viewer?: UserProfile | null) {
  return isAdminRole(normalizeViewer(viewer).role);
}

export function canAccessTeamDirectory(viewer?: UserProfile | null) {
  return isPrivilegedUser(viewer);
}

export function canManageProject(viewer: UserProfile, project: Project) {
  const currentViewer = normalizeViewer(viewer);

  if (currentViewer.role === "ADMIN") {
    return true;
  }

  const isProjectMember =
    project.managerId === currentViewer.id || project.memberIds.includes(currentViewer.id);

  if (!isProjectMember) {
    return false;
  }

  if (hasCompanywideProjectAccess(currentViewer.role, currentViewer.department)) {
    return true;
  }

  return canManageProjectsByRole(currentViewer.role, currentViewer.department);
}

export function getAccessibleProjects(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);

  if (isAdminRole(currentViewer.role)) {
    return []; // Admin no longer sees projects
  }
  
  if (hasCompanywideProjectAccess(currentViewer.role, currentViewer.department)) {
    return [...projects];
  }

  return projects.filter((project) => {
    return project.managerId === currentViewer.id || project.memberIds.includes(currentViewer.id);
  });
}

export function getManagedProjects(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);

  return projects.filter((project) => canManageProject(currentViewer, project));
}

export function canManageAnyProject(viewer?: UserProfile | null) {
  return getManagedProjects(viewer).length > 0;
}

export function getAccessibleProjectUserIds(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);
  const visibleUserIds = new Set<string>([currentViewer.id]);

  getAccessibleProjects(currentViewer).forEach((project) => {
    project.memberIds.forEach((memberId) => visibleUserIds.add(memberId));
    if (project.managerId) {
      visibleUserIds.add(project.managerId);
    }
  });

  return visibleUserIds;
}

export function getAccessibleProjectUsers(viewer?: UserProfile | null) {
  if (isAdminUser(viewer)) {
    return [...users];
  }

  const visibleUserIds = getAccessibleProjectUserIds(viewer);
  return users.filter((user) => visibleUserIds.has(user.id));
}

export function getManagedProjectUsers(viewer?: UserProfile | null) {
  if (isAdminUser(viewer)) {
    return [...users];
  }

  const visibleUserIds = new Set<string>([normalizeViewer(viewer).id]);
  getManagedProjects(viewer).forEach((project) => {
    project.memberIds.forEach((memberId) => visibleUserIds.add(memberId));
    if (project.managerId) {
      visibleUserIds.add(project.managerId);
    }
  });

  return users.filter((user) => visibleUserIds.has(user.id));
}

export function getLogworkTrackedUsers(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);

  if (isAdminUser(currentViewer)) {
    return users.filter((user) => !isAdminRole(user.role));
  }

  if (canManageAnyProject(currentViewer)) {
    return getManagedProjectUsers(currentViewer).filter((user) => !isAdminRole(user.role));
  }

  return [currentViewer];
}

export function getAccessibleSprints(viewer?: UserProfile | null) {
  const accessibleProjectIds = new Set(getAccessibleProjects(viewer).map((project) => project.id));
  const currentViewer = normalizeViewer(viewer);

  const managedProjectIds = new Set(getManagedProjects(currentViewer).map((project) => project.id));

  if (isAdminUser(currentViewer)) {
    return sprints.filter((sprint) => accessibleProjectIds.has(sprint.projectId));
  }

  if (canManageProjectsByRole(currentViewer.role, currentViewer.department)) {
    return sprints.filter((sprint) => accessibleProjectIds.has(sprint.projectId));
  }

  if (managedProjectIds.size > 0) {
    return sprints.filter((sprint) => managedProjectIds.has(sprint.projectId));
  }

  const ownSprintIds = new Set(
    tasks
      .filter((task) => task.assigneeId === currentViewer.id && task.sprintId)
      .map((task) => task.sprintId),
  );

  return sprints.filter(
    (sprint) => accessibleProjectIds.has(sprint.projectId) && ownSprintIds.has(sprint.id),
  );
}

export function getAccessibleTasks(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);
  const accessibleProjectIds = new Set(
    getAccessibleProjects(currentViewer).map((project) => project.id),
  );
  const managedProjectIds = new Set(getManagedProjects(currentViewer).map((project) => project.id));

  if (isAdminUser(currentViewer)) {
    return [...tasks];
  }

  return tasks.filter((task) => {
    if (!accessibleProjectIds.has(task.projectId)) {
      return false;
    }

    if (managedProjectIds.has(task.projectId)) {
      return true;
    }

    return task.assigneeId === currentViewer.id;
  });
}

export function getAccessibleLogwork(viewer?: UserProfile | null) {
  const currentViewer = normalizeViewer(viewer);
  const accessibleTaskIds = new Set(getAccessibleTasks(currentViewer).map((task) => task.id));
  const managedProjectIds = new Set(getManagedProjects(currentViewer).map((project) => project.id));

  return logworkEntries.filter((entry) => {
    if (!accessibleTaskIds.has(entry.taskId)) {
      return false;
    }

    const relatedTask = tasks.find((task) => task.id === entry.taskId);
    if (!relatedTask) {
      return false;
    }

    if (isAdminUser(currentViewer) || managedProjectIds.has(relatedTask.projectId)) {
      return true;
    }

    return entry.userId === currentViewer.id;
  });
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

  if (task.status === "IN_PROGRESS") {
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
  const ownedTaskIds = new Set(
    taskList.filter((task) => task.assigneeId === userId).map((task) => task.id),
  );

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

  return (
    scopedSprints.find((sprint) => sprint.status?.toUpperCase() === "ACTIVE") ?? scopedSprints[0] ?? sprints[0]
  );
}
