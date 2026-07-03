"use client";

import { useEffect, useState } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { EmptyState, StatusPill, Surface } from "@/components/ui";
import { projectApi, taskApi, workspaceApi } from "@/lib/api";
import { normalizeViewer } from "@/lib/mock/permissions";
import { formatDate, formatHours, taskPriorityLabel, taskStatusLabel } from "@/lib/utils/format";
import { useAuthSession } from "@/lib/auth/use-session";
import type { EnrichedTask, Project, WorkspaceShellData } from "@/types/dto";

const columns = ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"] as const;

type TaskPageState = {
  shellData: WorkspaceShellData;
  projects: Project[];
  tasks: EnrichedTask[];
};

export default function TasksPage() {
  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [taskState, setTaskState] = useState<TaskPageState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadTasks() {
      const [{ data: shellData }, { data: projects }, { data: tasks }] = await Promise.all([
        workspaceApi.getShellData(viewer),
        projectApi.list(undefined, viewer),
        taskApi.getEnrichedBoard(undefined, viewer),
      ]);

      if (isCancelled) {
        return;
      }

      setTaskState({ shellData, projects, tasks });
    }

    void loadTasks();

    return () => {
      isCancelled = true;
    };
  }, [viewer]);

  const shellData =
    taskState?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  const filteredTasks =
    !taskState?.tasks
      ? []
      : selectedProjectId === "ALL"
        ? taskState.tasks
        : taskState.tasks.filter((task) => task.projectId === selectedProjectId);

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Điều phối công việc"
      subheading="Kanban tổng hợp cho toàn bộ task trong phạm vi quyền hiện tại của bạn."
      highlightLabel="Task đang mở"
      highlightValue={`${filteredTasks.filter((task) => task.status !== "DONE").length}`}
    >
      <section className="filter-row">
        <label>
          <span>Dự án</span>
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            <option value="ALL">Tất cả dự án</option>
            {(taskState?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <Surface title="Bảng Kanban tổng hợp" kicker="Kanban">
        {filteredTasks.length ? (
          <div className="kanban-board">
            {columns.map((column) => (
              <div key={column} className="kanban-column">
                <div className="kanban-column-header">
                  <strong>{taskStatusLabel(column)}</strong>
                  <span>{filteredTasks.filter((task) => task.status === column).length}</span>
                </div>
                {filteredTasks
                  .filter((task) => task.status === column)
                  .map((task) => (
                    <article key={task.id} className="task-card">
                      <div className="task-topline">
                        <strong>{task.key}</strong>
                        <StatusPill
                          label={taskPriorityLabel(task.priority)}
                          tone={
                            task.priority === "CRITICAL"
                              ? "critical"
                              : task.priority === "HIGH"
                                ? "watch"
                                : "neutral"
                          }
                        />
                      </div>
                      <h3>{task.title}</h3>
                      <p>{task.description}</p>
                      <div className="task-meta">
                        <span>{task.project.code}</span>
                        <span>{task.assignee.name}</span>
                      </div>
                      <div className="task-meta">
                        <span>Hạn {formatDate(task.dueDate)}</span>
                        <span>{formatHours(task.spentHours)} đã ghi nhận</span>
                      </div>
                    </article>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Không có task trong bộ lọc" description="Đổi dự án hoặc gán task cho tài khoản này để thấy dữ liệu trên Kanban." />
        )}
      </Surface>
    </WorkspaceShell>
  );
}
