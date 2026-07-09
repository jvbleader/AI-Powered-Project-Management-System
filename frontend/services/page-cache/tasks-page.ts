import { normalizeViewer } from "@/lib/mock/permissions";
import { projectApi } from "@/services/api/projects";
import { taskApi } from "@/services/api/tasks";
import { workspaceApi } from "@/services/api/workspace";
import type { EnrichedTask, Project, UserProfile, WorkspaceShellData } from "@/types";

export type TaskPageState = {
  shellData: WorkspaceShellData;
  projects: Project[];
  tasks: EnrichedTask[];
};

type TaskPageCacheEntry = {
  viewerId: string;
  data: TaskPageState;
};

type PendingTaskPageRequest = {
  viewerId: string;
  promise: Promise<TaskPageState>;
};

let tasksPageCache: TaskPageCacheEntry | null = null;
let pendingTaskPageRequest: PendingTaskPageRequest | null = null;

export function getTasksPageCache(viewerId: string) {
  return tasksPageCache?.viewerId === viewerId ? tasksPageCache.data : null;
}

export function setTasksPageCache(viewerId: string, data: TaskPageState) {
  tasksPageCache = { viewerId, data };
}

export function clearTasksPageCache(viewerId?: string) {
  if (!viewerId || tasksPageCache?.viewerId === viewerId) {
    tasksPageCache = null;
  }
}

export async function primeTasksPageData(viewer?: UserProfile | null) {
  const resolvedViewer = normalizeViewer(viewer);
  const cached = getTasksPageCache(resolvedViewer.id);

  if (cached) {
    return cached;
  }

  if (pendingTaskPageRequest?.viewerId === resolvedViewer.id) {
    return pendingTaskPageRequest.promise;
  }

  const promise = (async () => {
    const [{ data: shellData }, { data: projects }] = await Promise.all([
      workspaceApi.getShellData(resolvedViewer),
      projectApi.list(undefined, resolvedViewer),
    ]);
    const { data: tasks } = await taskApi.getEnrichedBoard(undefined, resolvedViewer, { projects });
    const nextState = { shellData, projects, tasks };

    setTasksPageCache(resolvedViewer.id, nextState);
    return nextState;
  })().finally(() => {
    if (pendingTaskPageRequest?.viewerId === resolvedViewer.id) {
      pendingTaskPageRequest = null;
    }
  });

  pendingTaskPageRequest = {
    viewerId: resolvedViewer.id,
    promise,
  };

  return promise;
}
