import { UserProfile, WorkspaceShellData } from "@/types";
import { getAccessibleProjects, getAccessibleTasks } from "@/lib/mock/permissions";
import { getCurrentUser, isTaskOpen, missingLogworkCount, respond } from "./core";
import { isTaskOverdue } from "@/lib/mock/permissions";

export const workspaceApi = {
  async getShellData(viewer?: UserProfile | null) {
    const currentUser = getCurrentUser(viewer);
    const visibleProjects = getAccessibleProjects(currentUser);
    const visibleTasks = getAccessibleTasks(currentUser);
    const openTasks = visibleTasks.filter(isTaskOpen).length;
    const alertCount =
      visibleTasks.filter((task) => task.status === "BLOCKED" || isTaskOverdue(task)).length +
      visibleProjects.filter((project) => project.status === "AT_RISK").length;

    const data: WorkspaceShellData = {
      currentUser,
      activeProjects: visibleProjects.filter((project) => project.status === "ACTIVE").length,
      openTasks,
      missingLogwork: missingLogworkCount(currentUser),
      alertCount,
    };

    return respond(data, 90);
  },
};
