"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";


import { WorkspaceShell } from "@/components/workspace-shell";
import { EmptyState, Surface } from "@/components/ui";
import {
  getTasksPageCache,
  primeTasksPageData,
  setTasksPageCache,
  type TaskPageState,
} from "@/services/page-cache/tasks-page";
import { hasCompanywideProjectAccess } from "@/lib/utils/format";
import { useAuthSession } from "@/hooks/use-session";
import type { UserProfile, WorkspaceShellData } from "@/types";
import { TaskDetailModal } from "./_components/task-detail-modal";
import { GroupedTaskList } from "./_components/grouped-task-list";

function TasksPageContent() {
  const session = useAuthSession();
  const viewer = session?.currentUser as UserProfile;
  const cachedTaskState = getTasksPageCache(viewer.id);
  const [taskState, setTaskState] = useState<TaskPageState | null>(cachedTaskState);
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [taskOpenNotice, setTaskOpenNotice] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTaskId = searchParams.get("taskId");
  const selectedTask = taskState?.tasks?.find((t) => t.id === selectedTaskId);
  const isSelectedTaskAvailable = Boolean(
    selectedTaskId && taskState?.tasks?.some((task) => task.id === selectedTaskId),
  );
  const selectedProjectId = "ALL";
  const visibleTaskOpenNotice = selectedTaskId ? null : taskOpenNotice;

  useEffect(() => {
    let isCancelled = false;

    async function loadBoard() {
      setIsBoardLoading(true);
      try {
        const nextState = await primeTasksPageData(viewer);

        if (isCancelled) {
          return null;
        }

        setTaskState(nextState);
        return nextState;
      } finally {
        if (!isCancelled) {
          setIsBoardLoading(false);
        }
      }
    }

    async function hydratePage() {
      const nextState = await loadBoard();

      if (!selectedTaskId || !nextState || isCancelled) {
        return;
      }

      const hasSelectedTask = nextState.tasks.some((task) => task.id === selectedTaskId);
      if (!hasSelectedTask) {
        setTaskOpenNotice("Công việc này không còn tồn tại hoặc bạn không còn quyền truy cập.");
        router.replace("/tasks", { scroll: false });
      }
    }

    void hydratePage();

    return () => {
      isCancelled = true;
    };
  }, [router, selectedTaskId, viewer]);

  const shellData =
    taskState?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  // Lọc chỉ các task ĐƯỢC GÁN cho viewer và chưa hoàn thành
  const myTasks = taskState?.tasks?.filter(t => t.assigneeId === viewer.id && t.status !== "DONE") ?? [];
  const filteredTasks = selectedProjectId === "ALL"
    ? myTasks
    : myTasks.filter((task) => task.projectId === selectedProjectId);
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
          onTaskClick={(taskId) => {
            setTaskOpenNotice(null);
            router.push(`/tasks?taskId=${taskId}`);
          }}
        />

        {visibleTaskOpenNotice ? (
          <Surface title="Không thể mở công việc">
            <EmptyState
              title="Task không khả dụng"
              description={visibleTaskOpenNotice}
            />
          </Surface>
        ) : null}

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
        taskId={isSelectedTaskAvailable ? selectedTaskId : null}
        isOpen={isSelectedTaskAvailable}
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
        onTaskDeleted={(deletedTaskId) => {
          setTaskOpenNotice(null);
          setTaskState((current) => {
            if (!current) return null;
            const nextState = {
              ...current,
              tasks: current.tasks.filter((task) => task.id !== deletedTaskId),
            };
            setTasksPageCache(viewer.id, nextState);
            return nextState;
          });
          router.replace("/tasks", { scroll: false });
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
