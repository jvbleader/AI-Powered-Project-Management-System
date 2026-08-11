import { UserProfile, WorkspaceShellData } from "@/types";
import { isTaskOpen, respond } from "./core";
import { projectApi } from "./projects";
import { taskApi } from "./tasks";

export const workspaceApi = {
  async getShellData(viewer?: UserProfile | null) {
    const currentUser = viewer as UserProfile;
    
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
      activeProjects: visibleProjects.filter(
        (project) => project.status !== "ON_HOLD" && project.status !== "COMPLETED",
      ).length,
      openTasks,
      missingLogwork: 0,
      alertCount,
    };

    return respond(data, 90);
  },
};
