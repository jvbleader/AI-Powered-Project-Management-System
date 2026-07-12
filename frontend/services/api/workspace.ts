import { UserProfile, WorkspaceShellData } from "@/types";
import { getCurrentUser, isTaskOpen, missingLogworkCount, respond } from "./core";
import { projectApi } from "./projects";
import { taskApi } from "./tasks";

export const workspaceApi = {
  async getShellData(viewer?: UserProfile | null) {
    const currentUser = getCurrentUser(viewer);
    
    const [projectsRes, tasksRes] = await Promise.all([
      projectApi.list(undefined, viewer),
      taskApi.list(undefined, viewer)
    ]);
    
    const visibleProjects = projectsRes.data || [];
    const visibleTasks = tasksRes.data || [];
    
    const openTasks = visibleTasks.filter(isTaskOpen).length;
    
    const now = new Date().toISOString();
    const alertCount =
      visibleTasks.filter((task) => task.dueDate && task.dueDate < now && task.status !== "DONE").length +
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
