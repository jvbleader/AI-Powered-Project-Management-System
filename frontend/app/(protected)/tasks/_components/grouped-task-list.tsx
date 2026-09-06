"use client";

import { useMemo, useState } from "react";
import { EnrichedTask, Project } from "@/types";
import { EmptyState, Surface, StatusPill } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { UserAvatar } from "@/components/user-avatar";
import { formatDateNumeric, taskPriorityLabel, taskStatusLabel, taskStatusTone } from "@/lib/utils/format";
import styles from "./grouped-task-list.module.css";

type ViewMode = "priority" | "project";
type GroupTone = "danger" | "accent";
type HeaderTone = "danger" | "watch" | "accent";

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

interface GroupedTaskListProps {
  projects: Project[];
  tasks: EnrichedTask[];
  selectedProjectId: string;
  onTaskClick?: (taskId: string) => void;
  isLoading?: boolean;
}

const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfCurrentWeek(today: Date) {
  const start = startOfDay(today);
  const day = start.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  const end = new Date(start);
  end.setDate(start.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return end;
}

function sortByPriority(tasks: EnrichedTask[]) {
  return [...tasks].sort((left, right) => {
    const priorityDelta =
      (PRIORITY_ORDER[left.priority] ?? 99) - (PRIORITY_ORDER[right.priority] ?? 99);
    if (priorityDelta !== 0) return priorityDelta;
    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue;
  });
}

function getPriorityStyle(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return { background: "#fee2e2", color: "#991b1b" };
    case "HIGH":
      return { background: "#fef3c7", color: "#b45309" };
    case "MEDIUM":
      return { background: "#fef3c7", color: "#92400e" };
    case "LOW":
      return { background: "#dcfce7", color: "#166534" };
    default:
      return { background: "#f1f5f9", color: "#475569" };
  }
}

function TaskRow({
  task,
  projectName,
  showProject,
  tone,
  onClick,
}: {
  task: EnrichedTask;
  projectName: string;
  showProject: boolean;
  tone: GroupTone;
  onClick?: () => void;
}) {
  const dueLabel = task.dueDate ? formatDateNumeric(task.dueDate) : "—";
  const assigneeName = task.assignee?.name?.trim() || task.assigneeName?.trim() || "";

  return (
    <button
      type="button"
      className={`${styles.taskRow} ${tone === "danger" ? styles.taskRowDanger : styles.taskRowAccent}`}
      onClick={onClick}
    >
      <div className={styles.taskMain}>
        <strong className={styles.taskTitle}>{task.title}</strong>
        <div className={styles.taskMetaBlock}>
          <p className={styles.taskMeta}>
            <span>{task.key}</span>
            {showProject && projectName ? (
              <>
                <span className={styles.metaSep} aria-hidden>
                  ·
                </span>
                <span>{projectName}</span>
              </>
            ) : null}
            {task.dueDate ? (
              <span className={styles.dateInline}>
                <span className={styles.metaSep} aria-hidden>
                  ·
                </span>
                {dueLabel}
              </span>
            ) : null}
          </p>
          {assigneeName ? (
            <p className={styles.assigneeMeta}>
              <UserAvatar
                userId={task.assignee?.id || task.assigneeId}
                email={task.assignee?.email || task.assigneeEmail}
                name={assigneeName}
                avatarUrl={task.assignee?.avatarUrl}
                size={16}
                className={styles.assigneeAvatar}
              />
              <span className={styles.assigneeName}>{assigneeName}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className={styles.taskBadges}>
        <div className={styles.taskStatus}>
          <StatusPill label={taskStatusLabel(task.status)} tone={taskStatusTone(task.status)} />
        </div>
        <span className={styles.priorityBadge} style={getPriorityStyle(task.priority)}>
          {taskPriorityLabel(task.priority)}
        </span>
        <span className={styles.taskDate}>{dueLabel}</span>
      </div>
    </button>
  );
}

export function GroupedTaskList({
  projects,
  tasks,
  selectedProjectId,
  onTaskClick,
  isLoading = false,
}: GroupedTaskListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("priority");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleGroup(groupId: string) {
    setCollapsed((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  function headerClass(tone: HeaderTone) {
    if (tone === "danger") return styles.groupHeaderDanger;
    if (tone === "watch") return styles.groupHeaderWatch;
    return styles.groupHeaderAccent;
  }

  function countClass(tone: HeaderTone) {
    if (tone === "danger") return styles.taskCountDanger;
    if (tone === "watch") return styles.taskCountWatch;
    return styles.taskCountAccent;
  }

  const scopedTasks = useMemo(() => {
    if (selectedProjectId === "ALL") return tasks;
    return tasks.filter((task) => task.projectId === selectedProjectId);
  }, [selectedProjectId, tasks]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => map.set(project.id, project.name));
    scopedTasks.forEach((task) => {
      if (task.project?.name) map.set(task.projectId, task.project.name);
    });
    return map;
  }, [projects, scopedTasks]);

  const urgencyGroups = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = endOfCurrentWeek(today);
    const overdue: EnrichedTask[] = [];
    const thisWeek: EnrichedTask[] = [];
    const later: EnrichedTask[] = [];
    const undated: EnrichedTask[] = [];

    scopedTasks.forEach((task) => {
      if (!task.dueDate) {
        undated.push(task);
        return;
      }
      const due = new Date(task.dueDate);
      if (due < today && task.status !== "DONE") {
        overdue.push(task);
        return;
      }
      if (due >= today && due <= weekEnd) {
        thisWeek.push(task);
        return;
      }
      later.push(task);
    });

    return [
      { id: "overdue", title: "Quá hạn", tone: "danger" as const, headerTone: "danger" as const, tasks: sortByPriority(overdue) },
      { id: "this-week", title: "Tuần này", tone: "accent" as const, headerTone: "watch" as const, tasks: sortByPriority(thisWeek) },
      { id: "later", title: "Sắp tới", tone: "accent" as const, headerTone: "accent" as const, tasks: sortByPriority(later) },
      { id: "undated", title: "Không có hạn", tone: "accent" as const, headerTone: "accent" as const, tasks: sortByPriority(undated) },
    ].filter((group) => group.tasks.length > 0);
  }, [scopedTasks]);

  const projectGroups = useMemo(() => {
    const grouped = new Map<string, EnrichedTask[]>();
    scopedTasks.forEach((task) => {
      const list = grouped.get(task.projectId) ?? [];
      list.push(task);
      grouped.set(task.projectId, list);
    });

    return Array.from(grouped.entries())
      .map(([projectId, projectTasks]) => ({
        id: projectId,
        title: projectNameById.get(projectId) ?? "Dự án",
        tone: "accent" as const,
        headerTone: "accent" as const,
        tasks: sortByPriority(projectTasks),
      }))
      .sort((left, right) => right.tasks.length - left.tasks.length);
  }, [projectNameById, scopedTasks]);

  const groups = viewMode === "priority" ? urgencyGroups : projectGroups;

  if (isLoading) {
    return <LoadingState variant="cards" />;
  }

  if (scopedTasks.length === 0) {
    return (
      <Surface title="Chưa có nhiệm vụ">
        <EmptyState title="Trống" description="Bạn chưa có bất kỳ nhiệm vụ nào." />
      </Surface>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.sectionHead}>
        <div className={styles.viewToggle} role="group" aria-label="Cách nhóm nhiệm vụ">
          <button
            type="button"
            className={`${styles.toggleButton} ${viewMode === "priority" ? styles.toggleButtonActive : ""}`}
            aria-pressed={viewMode === "priority"}
            onClick={() => setViewMode("priority")}
          >
            Theo ưu tiên
          </button>
          <button
            type="button"
            className={`${styles.toggleButton} ${viewMode === "project" ? styles.toggleButtonActive : ""}`}
            aria-pressed={viewMode === "project"}
            onClick={() => setViewMode("project")}
          >
            Theo dự án
          </button>
        </div>
      </div>

      {groups.map((group) => {
        const isCollapsed = Boolean(collapsed[group.id]);
        const panelId = `task-group-${group.id}`;

        return (
          <section key={group.id} className={styles.groupCard}>
            <h3 className={styles.groupHeading}>
              <button
                type="button"
                className={`${styles.groupHeader} ${headerClass(group.headerTone)} ${isCollapsed ? styles.groupHeaderCollapsed : ""}`}
                aria-expanded={!isCollapsed}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.id)}
              >
                <span className={styles.groupAccent} aria-hidden />
                <span className={styles.groupTitleText}>{group.title}</span>
                <span className={`${styles.taskCount} ${countClass(group.headerTone)}`}>{group.tasks.length}</span>
                <span className={`${styles.chevron} ${isCollapsed ? "" : styles.chevronOpen}`}>
                  <ChevronIcon />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              className={`${styles.groupBody} ${isCollapsed ? styles.groupBodyCollapsed : ""}`}
              role="region"
            >
              <div className={styles.groupBodyInner}>
                <div className={styles.taskList}>
                  {group.tasks.map((task) => {
                    const isOverdue = Boolean(
                      task.dueDate && new Date(task.dueDate) < startOfDay(new Date()) && task.status !== "DONE",
                    );
                    const rowTone: GroupTone =
                      group.tone === "danger" || (viewMode === "project" && isOverdue) ? "danger" : "accent";

                    return (
                      <TaskRow
                        key={task.id}
                        task={task}
                        projectName={projectNameById.get(task.projectId) ?? ""}
                        showProject={viewMode !== "project"}
                        tone={rowTone}
                        onClick={() => onTaskClick?.(task.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
