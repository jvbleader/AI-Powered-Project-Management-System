"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { projectApi, taskApi, workspaceApi, userApi } from "@/services/api";
import { normalizeViewer, isPrivilegedUser } from "@/lib/mock/permissions";
import { useAuthSession } from "@/hooks/use-session";
import type { EnrichedTask, Project, WorkspaceShellData, UserProfile } from "@/types";
import { GanttChart } from "../_components/gantt-chart";
import { ProjectMembers } from "../_components/project-members";
import { Surface, EmptyState, StatusPill, ProgressBar } from "@/components/ui";
import { formatRange, projectStatusLabel } from "@/lib/utils/format";
import { enrichTask } from "@/services/api/core";

type ProjectDetailState = {
  shellData: WorkspaceShellData;
  project: Project;
  tasks: EnrichedTask[];
  users: UserProfile[];
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = typeof params?.projectId === "string" ? params.projectId : "";

  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const canManage = isPrivilegedUser(viewer);

  const [state, setState] = useState<ProjectDetailState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "gantt" | "members">("gantt");

  useEffect(() => {
    let isCancelled = false;

    async function loadProjectDetails() {
      if (!projectId) return;

      try {
        const [{ data: shellData }, { data: projects }, { data: allTasks }, { data: users }] = await Promise.all([
          workspaceApi.getShellData(viewer),
          projectApi.list(undefined, viewer),
          taskApi.getEnrichedBoard({ projectId }, viewer),
          userApi.list(viewer)
        ]);

        if (isCancelled) return;

        const currentProject = projects.find((p) => p.id === projectId);

        if (!currentProject) {
          setError("Không tìm thấy dự án hoặc bạn không có quyền truy cập.");
          return;
        }

        setState({ shellData, project: currentProject, tasks: allTasks, users });
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
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Tabs */}
          <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", overflowX: "auto" }}>
            <button 
              type="button"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: activeTab === "overview" ? "2px solid var(--primary-base)" : "2px solid transparent",
                padding: "0.5rem 1rem",
                cursor: "pointer",
                fontWeight: activeTab === "overview" ? 600 : 400,
                color: activeTab === "overview" ? "var(--primary-base)" : "var(--foreground-muted)",
                whiteSpace: "nowrap",
              }}
              onClick={() => setActiveTab("overview")}
            >
              Tổng quan
            </button>

            <button 
              type="button"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: activeTab === "gantt" ? "2px solid var(--primary-base)" : "2px solid transparent",
                padding: "0.5rem 1rem",
                cursor: "pointer",
                fontWeight: activeTab === "gantt" ? 600 : 400,
                color: activeTab === "gantt" ? "var(--primary-base)" : "var(--foreground-muted)",
                whiteSpace: "nowrap",
              }}
              onClick={() => setActiveTab("gantt")}
            >
              Gantt Chart
            </button>
            <button 
              type="button"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: activeTab === "members" ? "2px solid var(--primary-base)" : "2px solid transparent",
                padding: "0.5rem 1rem",
                cursor: "pointer",
                fontWeight: activeTab === "members" ? 600 : 400,
                color: activeTab === "members" ? "var(--primary-base)" : "var(--foreground-muted)",
                whiteSpace: "nowrap",
              }}
              onClick={() => setActiveTab("members")}
            >
              Thành viên
            </button>
          </div>

          {activeTab === "overview" && (
            <Surface title="Thông tin tổng quan" kicker="Overview">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1.5rem",
                  padding: "1rem",
                }}
              >
                <div>
                  <p style={{ margin: "0 0 0.5rem 0", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
                    Trạng thái
                  </p>
                  <StatusPill
                    label={projectStatusLabel(state.project.status)}
                    tone={
                      state.project.status === "ACTIVE"
                        ? "accent"
                        : state.project.status === "PLANNING"
                          ? "watch"
                          : state.project.status === "AT_RISK"
                            ? "critical"
                            : "on-track"
                    }
                  />
                </div>
                <div>
                  <p style={{ margin: "0 0 0.5rem 0", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
                    Tiến độ
                  </p>
                  <ProgressBar value={state.project.progress} />
                </div>
                <div>
                  <p style={{ margin: "0 0 0.5rem 0", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
                    Thời gian
                  </p>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    {formatRange(state.project.startDate, state.project.endDate)}
                  </p>
                </div>
                <div>
                  <p style={{ margin: "0 0 0.5rem 0", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
                    Quản lý dự án
                  </p>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    {state.project.managerName || "Chưa phân công"}
                  </p>
                </div>
                <div>
                  <p style={{ margin: "0 0 0.5rem 0", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
                    Thống kê công việc ({state.tasks.length} tasks)
                  </p>
                  <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", fontSize: "0.875rem", fontWeight: 500 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#94a3b8" }} /> {state.tasks.filter(t => t.status === "TODO").length} Todo
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#3b82f6" }} /> {state.tasks.filter(t => t.status === "IN_PROGRESS").length} In Progress
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#eab308" }} /> {state.tasks.filter(t => t.status === "REVIEW").length} Review
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ef4444" }} /> {state.tasks.filter(t => t.status === "BLOCKED").length} Blocked
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#22c55e" }} /> {state.tasks.filter(t => t.status === "DONE").length} Done
                    </span>
                  </div>
                </div>
              </div>
            </Surface>
          )}


          {activeTab === "gantt" && (
            state.tasks.length > 0 ? (
              <section style={{ flex: 1, display: "flex", height: "calc(100vh - 300px)" }}>
                <GanttChart tasks={state.tasks} />
              </section>
            ) : (
              <Surface title="Tiến độ công việc">
                <EmptyState
                  title="Chưa có công việc nào"
                  description="Dự án này chưa có công việc (task) nào được khởi tạo. Hãy tạo công việc để theo dõi tiến độ trên biểu đồ Gantt."
                />
              </Surface>
            )
          )}

          {activeTab === "members" && (
            <ProjectMembers 
              projectId={projectId} 
              viewerId={viewer.id} 
              canManage={canManage || state.project.managerId === viewer.id} 
              accessibleUsers={state.users} 
            />
          )}

        </div>
      )}
    </WorkspaceShell>
  );
}
