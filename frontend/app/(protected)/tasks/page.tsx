"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { EmptyState, Surface } from "@/components/ui";
import { taskApi, workspaceApi, userApi } from "@/services/api";
import {
  getTasksPageCache,
  primeTasksPageData,
  setTasksPageCache,
  type TaskPageState,
} from "@/services/page-cache/tasks-page";
import { normalizeViewer } from "@/lib/mock/permissions";
import { useAuthSession } from "@/hooks/use-session";
import type { WorkspaceShellData } from "@/types";
import { TaskDetailModal } from "./_components/task-detail-modal";
import { GroupedKanbanBoard } from "./_components/grouped-kanban-board";

function TasksPageContent() {
  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const cachedTaskState = getTasksPageCache(viewer.id);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [taskState, setTaskState] = useState<TaskPageState | null>(cachedTaskState);
  const [isBoardLoading, setIsBoardLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTaskId = searchParams.get("taskId");
  const selectedTask = taskState?.tasks?.find((t) => t.id === selectedTaskId);

  useEffect(() => {
    let isCancelled = false;

    async function loadBoard() {
      setIsBoardLoading(true);
      const nextState = await primeTasksPageData(viewer);

      if (isCancelled) {
        return;
      }

      setTaskState(nextState);
      setIsBoardLoading(false);
    }

    async function loadSelectedTaskDetail(taskId: string) {
      const [{ data: shellData }, { data: task }, { data: users }] = await Promise.all([
        workspaceApi.getShellData(viewer),
        taskApi.getEnrichedTask(taskId, viewer),
        userApi.list(viewer),
      ]);

      if (isCancelled) {
        return;
      }

      setTaskState({
        shellData,
        projects: task.project ? [task.project] : [],
        tasks: [task],
        users,
      });
    }

    async function hydratePage() {
      const cachedState = getTasksPageCache(viewer.id);
      const hasSelectedTaskInCache =
        Boolean(cachedState?.tasks.some((task) => task.id === selectedTaskId));

      if (selectedTaskId && !hasSelectedTaskInCache) {
        await loadSelectedTaskDetail(selectedTaskId);
      }

      await loadBoard();
    }

    void hydratePage();

    return () => {
      isCancelled = true;
    };
  }, [selectedTaskId, viewer]);

  const shellData =
    taskState?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  const filteredTasks = !taskState?.tasks
    ? []
    : selectedProjectId === "ALL"
      ? taskState.tasks
      : taskState.tasks.filter((task) => task.projectId === selectedProjectId);
  const canManageSelectedTask = Boolean(
    selectedTask &&
      (viewer.role === "ADMIN" ||
        viewer.role === "MANAGER" ||
        viewer.role === "LEADER" ||
        selectedTask.project.managerId === viewer.id),
  );

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Điều phối công việc"
      subheading="Kanban tổng hợp cho toàn bộ task trong phạm vi quyền hiện tại của bạn."
      highlightLabel="Task đang mở"
      highlightValue={`${filteredTasks.filter((task) => task.status !== "DONE").length}`}
    >
      <section className="filter-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <label>
              <span>Dự án</span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                <option value="ALL">Tất cả dự án</option>
                {(taskState?.projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "2rem", marginTop: "1.5rem" }}
          >
            <GroupedKanbanBoard
              projects={taskState?.projects ?? []}
              tasks={filteredTasks}
              selectedProjectId={selectedProjectId}
              onTaskUpdated={() => {
                taskApi
                  .getEnrichedBoard(undefined, viewer, {
                    projects: taskState?.projects ?? [],
                    users: taskState?.users ?? [],
                  })
                  .then((res) => {
                    setTaskState((current) => {
                      if (!current) {
                        return null;
                      }

                      const nextState = { ...current, tasks: res.data };
                      setTasksPageCache(viewer.id, nextState);
                      return nextState;
                    });
                  });
              }}
            />

            {filteredTasks.length === 0 && selectedProjectId === "ALL" && (
              <Surface title="Chưa có nhiệm vụ">
                <EmptyState
                  title={isBoardLoading ? "Đang tải nhiệm vụ" : "Trống"}
                  description={
                    isBoardLoading
                      ? "Hệ thống đang đồng bộ danh sách nhiệm vụ của bạn."
                      : "Bạn chưa có bất kỳ nhiệm vụ nào."
                  }
                />
              </Surface>
            )}
          </div>

      <TaskDetailModal
        taskId={selectedTaskId}
        isOpen={!!selectedTaskId}
        onClose={() => router.push("/tasks")}
        users={taskState?.users || []}
        viewerId={viewer.id}
        canManage={canManageSelectedTask}
        onTaskUpdated={(updatedTask) => {
          setTaskState((current) => {
            if (!current) return null;
            const nextState = {
              ...current,
              tasks: current.tasks.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t)
            };
            setTasksPageCache(viewer.id, nextState);
            return nextState;
          });
        }}
      />
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
