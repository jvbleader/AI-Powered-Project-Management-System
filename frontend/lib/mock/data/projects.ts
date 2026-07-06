import { Project } from "@/types";

export const projects: Project[] = [
  {
    id: "prj-core",
    code: "FP-CORE",
    name: "AI PM Core Platform",
    description:
      "Central workspace for project, sprint, task, logwork, and executive dashboard flows.",
    status: "ACTIVE",
    progress: 72,
    managerId: "usr-manager",
    memberIds: ["usr-manager", "usr-leader", "usr-fe", "usr-be", "usr-qa"],
    startDate: "2026-06-01",
    endDate: "2026-07-31",
    currentSprintId: "spr-delivery",
    objectives: [
      "Ship a PM cockpit for managers",
      "Keep tasks and logwork aligned in one timeline",
      "Expose contracts for backend services",
    ],
    metrics: {
      completedTasks: 18,
      overdueTasks: 3,
      logworkCoverage: 86,
      velocity: 29,
    },
  },
  {
    id: "prj-rag",
    code: "FP-RAG",
    name: "Insight and RAG Layer",
    description:
      "Vector context, report generation, and semantic retrieval for project conversations.",
    status: "AT_RISK",
    progress: 48,
    managerId: "usr-leader",
    memberIds: ["usr-manager", "usr-leader", "usr-be"],
    startDate: "2026-06-10",
    endDate: "2026-08-08",
    currentSprintId: "spr-rag",
    objectives: [
      "Prepare retrieval-ready data contracts",
      "Define memory pipeline and report schemas",
      "Reduce AI response latency on factual queries",
    ],
    metrics: {
      completedTasks: 9,
      overdueTasks: 2,
      logworkCoverage: 74,
      velocity: 15,
    },
  },
  {
    id: "prj-mobile",
    code: "FP-MOBILE",
    name: "Executive Mobile Snapshot",
    description:
      "A lightweight summary surface so leaders can inspect sprint health from mobile.",
    status: "PLANNING",
    progress: 18,
    managerId: "usr-manager",
    memberIds: ["usr-manager", "usr-fe", "usr-qa"],
    startDate: "2026-07-01",
    endDate: "2026-08-20",
    currentSprintId: "spr-mobile",
    objectives: [
      "Condense metrics to mobile cards",
      "Define push alert logic for overdue work",
      "Reuse dashboard contracts from web",
    ],
    metrics: {
      completedTasks: 3,
      overdueTasks: 0,
      logworkCoverage: 100,
      velocity: 7,
    },
  },
];

