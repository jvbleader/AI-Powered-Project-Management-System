"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { projectApi, taskApi, workspaceApi } from "@/services/api";
import { normalizeViewer } from "@/lib/mock/permissions";
import { useAuthSession } from "@/hooks/use-session";
import type { EnrichedTask, Project, WorkspaceShellData } from "@/types";
import { WbsTable } from "../_components/wbs-table";
import { Surface, EmptyState } from "@/components/ui";

type ProjectDetailState = {
  shellData: WorkspaceShellData;
  project: Project;
  tasks: EnrichedTask[];
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = typeof params?.projectId === "string" ? params.projectId : "";

  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);

  const [state, setState] = useState<ProjectDetailState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadProjectDetails() {
      if (!projectId) return;

      try {
        const [{ data: shellData }, { data: projects }, { data: allTasks }] = await Promise.all([
          workspaceApi.getShellData(viewer),
          projectApi.list(undefined, viewer),
          taskApi.getEnrichedBoard(undefined, viewer),
        ]);

        if (isCancelled) return;

        const currentProject = projects.find((p) => p.id === projectId);

        if (!currentProject) {
          setError("Không tìm thấy dự án hoặc bạn không có quyền truy cập.");
          return;
        }

        const projectTasks = allTasks.filter((task) => task.projectId === projectId);
        setState({ shellData, project: currentProject, tasks: projectTasks });
      } catch (err) {
        if (!isCancelled) {
          setError("Lỗi khi tải chi tiết dự án.");
        }
      }
    }

    void loadProjectDetails();

    return () => {
      isCancelled = true;
    };
  }, [viewer, projectId]);

  const shellData =
    state?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  return (
    <WorkspaceShell
      shellData={shellData}
      heading={state?.project.name ?? "Chi tiết dự án"}
      subheading={state?.project.code ?? "Đang tải dữ liệu..."}
      highlightLabel="Số lượng Task"
      highlightValue={`${state?.tasks.length ?? 0}`}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <button type="button" className="secondary-button" onClick={() => router.push("/projects")}>
          &larr; Quay lại danh sách Dự án
        </button>
      </div>

      {error ? (
        <Surface title="Lỗi">
          <EmptyState title="Không thể hiển thị" description={error} />
        </Surface>
      ) : !state ? (
        <Surface title="Đang tải dữ liệu...">
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)" }}>
            Đang lấy thông tin dự án...
          </div>
        </Surface>
      ) : (
        <section className="two-up" style={{ gridTemplateColumns: "1fr" }}>
          <WbsTable tasks={state.tasks} />
        </section>
      )}
    </WorkspaceShell>
  );
}
