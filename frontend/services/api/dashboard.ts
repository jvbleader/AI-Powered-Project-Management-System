import { DashboardOverview, UserProfile } from "@/types";
import { aiInsights, users } from "@/lib/mock/data";
import {
  DEMO_TODAY,
  getAccessibleLogwork,
  getAccessibleProjects,
  getAccessibleTasks,
  getSuggestedActiveProject,
  getSuggestedActiveSprint,
  isPrivilegedUser,
  isTaskOverdue,
  normalizeViewer,
  summarizeTaskCategories,
} from "@/lib/mock/permissions";
import { getProject, respond } from "./core";

export const dashboardApi = {
  async getOverview(viewer?: UserProfile | null, projectId?: string) {
    const currentViewer = normalizeViewer(viewer);
    const activeProject = getSuggestedActiveProject(currentViewer);
    const selectedProject = projectId ? getProject(projectId) : activeProject;
    const scopedProject = getAccessibleProjects(currentViewer).find((project) => project.id === selectedProject.id) ?? activeProject;
    const activeSprint = getSuggestedActiveSprint(currentViewer, scopedProject.id);
    const visibleProjects = getAccessibleProjects(currentViewer);
    const visibleTasks = getAccessibleTasks(currentViewer);
    const overdueTasks = visibleTasks.filter((task) => task.projectId === scopedProject.id && isTaskOverdue(task));
    const workloadBoard = users
      .filter((user) => activeProject.memberIds.includes(user.id))
      .map((user) => ({
        user,
        utilization: Math.round((user.workloadHours / user.capacityHours) * 100),
      }));
    const visibleLogwork = getAccessibleLogwork(currentViewer).slice(0, 5);
    const scopedProjectTasks = visibleTasks.filter((task) => task.projectId === scopedProject.id);
    const taskCategories = summarizeTaskCategories(scopedProjectTasks);
    const portfolioProgress = visibleProjects.length
      ? Math.round(visibleProjects.reduce((sum, project) => sum + project.progress, 0) / visibleProjects.length)
      : 0;
    const logworkOwners = isPrivilegedUser(currentViewer)
      ? users.filter((user) => user.role !== "ADMIN")
      : [currentViewer];
    const logworkCoverage = logworkOwners.length
      ? Math.round(
          (logworkOwners.filter((user) => {
            return getAccessibleLogwork(currentViewer).some((entry) => entry.userId === user.id && entry.date === DEMO_TODAY);
          }).length /
            logworkOwners.length) *
            100,
        )
      : 0;

    const data: DashboardOverview = {
      activeProject: scopedProject,
      activeSprint,
      portfolioProgress,
      stats: [
        {
          label: "Tiến độ danh mục",
          value: `${portfolioProgress}%`,
          change: `${visibleProjects.length} dự án trong phạm vi của bạn`,
          tone: "accent",
        },
        {
          label: "Hoàn thành sprint",
          value: `${activeSprint.progress}%`,
          change: `${activeSprint.completedPoints}/${activeSprint.committedPoints} điểm đã bàn giao`,
          tone: activeSprint.health,
        },
        {
          label: "Tỷ lệ logwork",
          value: `${logworkCoverage}%`,
          change: `${visibleLogwork.length} bản ghi gần nhất đang hiển thị`,
          tone: logworkCoverage >= 80 ? "on-track" : "watch",
        },
        {
          label: "Cảnh báo trọng yếu",
          value: `${taskCategories.OUTDATE + overdueTasks.filter((task) => task.status === "BLOCKED").length}`,
          change: `${taskCategories.OUTDATE} công việc đã trễ hạn`,
          tone: taskCategories.OUTDATE > 0 ? "critical" : "on-track",
        },
      ],
      overdueTasks,
      workloadBoard,
      recentLogwork: visibleLogwork,
      aiInsights,
    };

    return respond(data, 120);
  },
};
