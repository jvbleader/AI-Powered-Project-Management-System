import { Project } from "@/types";

export const projects: Project[] = [
  {
    id: "prj-mock-dashboard",
    code: "MOCK-DASH",
    name: "Mock Dashboard Project",
    description: "Temporary mock project to keep dashboard from crashing.",
    status: "ACTIVE",
    progress: 50,
    managerId: "usr-manager",
    memberIds: ["usr-manager"],
    startDate: "2026-06-01",
    endDate: "2026-12-31",
    currentSprintId: "spr-delivery",
    objectives: [],
    metrics: {
      completedTasks: 0,
      overdueTasks: 0,
      logworkCoverage: 0,
      velocity: 0,
      totalTasks: 0,
    },
  },
];
