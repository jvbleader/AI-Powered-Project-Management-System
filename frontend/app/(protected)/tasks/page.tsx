"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { EmptyState, StatusPill, Surface } from "@/components/ui";
import { projectApi, taskApi, workspaceApi } from "@/services/api";
import { normalizeViewer } from "@/lib/mock/permissions";
import { formatDate, formatHours, taskPriorityLabel, taskStatusLabel } from "@/lib/utils/format";
import { useAuthSession } from "@/hooks/use-session";
import type { EnrichedTask, Project, WorkspaceShellData } from "@/types";
import { TaskDetails } from "./_components/task-details";

const columns = ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"] as const;

type TaskPageState = {
  shellData: WorkspaceShellData;
  projects: Project[];
  tasks: EnrichedTask[];
};

function TasksPageContent() {
  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [taskState, setTaskState] = useState<TaskPageState | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTaskId = searchParams.get("taskId");
  const selectedTask = taskState?.tasks?.find(t => t.id === selectedTaskId);

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
      {selectedTask ? (
        <TaskDetails task={selectedTask} viewerId={viewer.id} />
      ) : (
        <>
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

      <div style={{ display: "flex", flexDirection: "column", gap: "2rem", marginTop: "1.5rem" }}>
        {(taskState?.projects ?? [])
          .filter(p => selectedProjectId === "ALL" || p.id === selectedProjectId)
          .map(project => {
            const pTasks = (taskState?.tasks ?? []).filter(t => t.projectId === project.id);
            if (pTasks.length === 0 && selectedProjectId === "ALL") return null;

            return (
              <Surface key={project.id} title={project.name} kicker={project.code}>
                {pTasks.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {pTasks.map(task => (
                      <article 
                        key={task.id} 
                        className="task-card" 
                        style={{ cursor: "pointer", width: "100%", maxWidth: "100%" }}
                        onClick={() => router.push(`/tasks?taskId=${task.id}`)}
                      >
                        <div className="task-topline" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                            <strong>{task.key}</strong>
                            <span style={{ fontSize: "1.1rem", fontWeight: 600 }}>{task.title}</span>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <StatusPill label={taskStatusLabel(task.status)} tone="neutral" />
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
                        </div>
                        <p style={{ marginTop: "0.5rem", color: "var(--foreground-muted)" }}>{task.description}</p>
                        <div className="task-meta" style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem", display: "flex", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", gap: "1.5rem" }}>
                            <span><strong>Người làm:</strong> {task.assignee.name}</span>
                            <span><strong>Hạn:</strong> {formatDate(task.dueDate)}</span>
                          </div>
                          <span><strong>Đã log:</strong> {formatHours(task.spentHours)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Không có nhiệm vụ" description="Bạn chưa có nhiệm vụ nào trong dự án này." />
                )}
              </Surface>
            );
        })}
        
        {filteredTasks.length === 0 && selectedProjectId === "ALL" && (
          <Surface title="Chưa có nhiệm vụ">
            <EmptyState title="Trống" description="Bạn chưa có bất kỳ nhiệm vụ nào." />
          </Surface>
        )}
      </div>
    </>
      )}
    </WorkspaceShell>
  );
}


export default function TasksPage() {
  return (
    <Suspense fallback={<div>Đang tải...</div>}>
      <TasksPageContent />
    </Suspense>
  );
}
