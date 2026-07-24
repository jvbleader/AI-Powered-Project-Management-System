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
import { hasCompanywideProjectAccess } from "@/lib/utils/format";
import { useAuthSession } from "@/hooks/use-session";
import type { WorkspaceShellData } from "@/types";
import { TaskDetailModal } from "./_components/task-detail-modal";
import { GroupedTaskList } from "./_components/grouped-task-list";

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

  // Lọc chỉ các task ĐƯỢC GÁN cho viewer (scope theo từng người)
  const myTasks = taskState?.tasks?.filter(t => t.assigneeId === viewer.id) ?? [];
  const filteredTasks = selectedProjectId === "ALL"
    ? myTasks
    : myTasks.filter((task) => task.projectId === selectedProjectId);
  const projectOptions = [
    { value: "ALL", label: "Tất cả dự án" },
    ...((taskState?.projects ?? []).map((project) => ({
      value: project.id,
      label: project.name,
    })) || []),
  ];
  const canManageSelectedTask = Boolean(
    selectedTask &&
      (hasCompanywideProjectAccess(viewer.role, viewer.department) ||
        selectedTask.project.managerId === viewer.id),
  );

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Tiến độ cá nhân"
      subheading="Danh sách nhiệm vụ được giao cho bạn trên tất cả dự án."
      highlightLabel="Task đang mở"
      highlightValue={`${filteredTasks.filter((task) => task.status !== "DONE").length}`}
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: "2rem", marginTop: "0.25rem" }}
      >
        <GroupedTaskList
          projects={taskState?.projects ?? []}
          tasks={filteredTasks}
          selectedProjectId={selectedProjectId}
          onTaskClick={(taskId) => router.push(`/tasks?taskId=${taskId}`)}
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
