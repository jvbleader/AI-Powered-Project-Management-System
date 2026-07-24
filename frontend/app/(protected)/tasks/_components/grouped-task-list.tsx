"use client";
import { useMemo } from "react";
import { EnrichedTask, Project } from "@/types";
import { StatusPill } from "@/components/ui";
import { taskPriorityLabel, taskStatusLabel, taskStatusTone } from "@/lib/utils/format";
import styles from "./grouped-task-list.module.css";

interface GroupedTaskListProps {
  projects: Project[];
  tasks: EnrichedTask[];
  selectedProjectId: string;
  onTaskClick?: (taskId: string) => void;
}

export function GroupedTaskList({
  projects,
  tasks,
  selectedProjectId,
  onTaskClick,
}: GroupedTaskListProps) {
  const selectedProject =
    selectedProjectId === "ALL"
      ? null
      : projects.find((project) => project.id === selectedProjectId);

  const projectGroups = useMemo(() => {
    if (selectedProject) {
      return [
        {
          project: selectedProject,
          tasks: tasks.filter((task) => task.projectId === selectedProject.id),
        },
      ];
    }

    return projects
      .map((project) => ({
        project,
        tasks: tasks.filter((task) => task.projectId === project.id),
      }))
      .filter((entry) => entry.tasks.length > 0)
      .sort((left, right) => right.tasks.length - left.tasks.length);
  }, [projects, selectedProject, tasks]);

  if (projectGroups.length === 0) {
    return null; // Handled by EmptyState in page.tsx
  }

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return { background: "#fee2e2", color: "#991b1b" };
      case "MEDIUM":
        return { background: "#fef3c7", color: "#92400e" };
      case "LOW":
        return { background: "#dcfce7", color: "#166534" };
      default:
        return { background: "#f1f5f9", color: "#475569" };
    }
  };

  return (
    <div className={styles.container}>
      {projectGroups.map(({ project, tasks }) => (
        <div key={project.id} className={styles.projectSection}>
          <div className={styles.projectHeader}>
            <h3 className={styles.projectTitle}>
              {project.name}
              <span className={styles.taskCount}>{tasks.length}</span>
            </h3>
          </div>

          {tasks.length > 0 ? (
            <div className={styles.cardList}>
              {tasks.map((task) => {
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";
                return (
                  <div
                    key={task.id}
                    className={styles.taskCard}
                    onClick={() => onTaskClick?.(task.id)}
                  >
                    <div className={styles.cardHeader}>
                      <div>
                        <span className={styles.taskKey}>{task.key}</span>
                        <h4 className={styles.taskTitle} title={task.title}>{task.title}</h4>
                      </div>
                    </div>
                    
                    <div className={styles.cardFooter}>
                      <div className={styles.metaGroup}>
                        <StatusPill
                          label={taskStatusLabel(task.status)}
                          tone={taskStatusTone(task.status)}
                        />
                        <span 
                          className={styles.priorityBadge}
                          style={getPriorityStyle(task.priority)}
                        >
                          {taskPriorityLabel(task.priority)}
                        </span>
                      </div>
                      
                      {task.dueDate && (
                        <div className={`${styles.dueDate} ${isOverdue ? styles.overdue : ""}`}>
                          <svg className={styles.dueDateIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          {new Date(task.dueDate).toLocaleDateString("vi-VN")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyProject}>Không có nhiệm vụ nào trong dự án này</div>
          )}
        </div>
      ))}
    </div>
  );
}
