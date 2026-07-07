"use client";

import { useEffect, useState } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import {
  DonutChart,
  EmptyState,
  KeyValueList,
  MiniBars,
  ProgressBar,
  SegmentBar,
  StatCard,
  StatusPill,
  Surface,
} from "@/components/ui";
import { dashboardApi, projectApi, sprintApi, taskApi, workspaceApi } from "@/services/api";
import {
  calculateSprintCompletion,
  categorizeTask,
  getProjectManager,
  isPrivilegedUser,
  normalizeViewer,
} from "@/lib/mock/permissions";
import {
  formatDate,
  formatRange,
  healthToneLabel,
  roleLabel,
  taskStatusLabel,
} from "@/lib/utils/format";
import { useAuthSession } from "@/hooks/use-session";
import type { DashboardOverview, EnrichedTask, Project, Sprint, WorkspaceShellData } from "@/types";

type DashboardState = {
  shellData: WorkspaceShellData;
  overview: DashboardOverview;
  projects: Project[];
  sprints: Sprint[];
  tasks: EnrichedTask[];
};

export default function DashboardPage() {
  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dashboardState, setDashboardState] = useState<DashboardState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      const [{ data: projects }] = await Promise.all([projectApi.list(undefined, viewer)]);

      const projectId = selectedProjectId ?? projects[0]?.id;

      const [{ data: shellData }, { data: overview }, { data: sprints }, { data: tasks }] =
        await Promise.all([
          workspaceApi.getShellData(viewer),
          dashboardApi.getOverview(viewer, projectId),
          sprintApi.list(undefined, viewer),
          taskApi.getEnrichedBoard(undefined, viewer),
        ]);

      if (isCancelled) {
        return;
      }

      setSelectedProjectId(projectId ?? null);
      setDashboardState({
        shellData,
        overview,
        projects,
        sprints,
        tasks,
      });
    }

    void loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [selectedProjectId, viewer]);

  const shellData =
    dashboardState?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  const projectList = dashboardState?.projects ?? [];
  const selectedProject =
    projectList.find((project) => project.id === selectedProjectId) ??
    dashboardState?.overview.activeProject ??
    null;
  const selectedProjectTasks = selectedProject
    ? (dashboardState?.tasks ?? []).filter((task) => task.projectId === selectedProject.id)
    : [];
  const selectedProjectSprints = selectedProject
    ? (dashboardState?.sprints ?? []).filter((sprint) => sprint.projectId === selectedProject.id)
    : [];
  const taskSummary = {
    TODO: 0,
    IN_PROGRESS: 0,
    DONE: 0,
    OUTDATE: 0,
  };

  selectedProjectTasks.forEach((task) => {
    taskSummary[categorizeTask(task)] += 1;
  });

  const taskSegments = [
    { label: "To do", value: taskSummary.TODO, tone: "todo" as const },
    { label: "In Progress", value: taskSummary.IN_PROGRESS, tone: "progress" as const },
    { label: "Done", value: taskSummary.DONE, tone: "done" as const },
    { label: "Outdate", value: taskSummary.OUTDATE, tone: "outdate" as const },
  ];

  const memberScopedText = isPrivilegedUser(viewer)
    ? "Bạn đang xem phạm vi quản lí và điều phối."
    : "Bạn đang xem đúng các dự án, sprint và công việc mình tham gia.";

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Dashboard dự án"
      subheading="Tổng quan tiến độ dự án, nhịp sprint và trạng thái task trong phạm vi công việc của bạn."
      highlightLabel="Phạm vi"
      highlightValue={isPrivilegedUser(viewer) ? "Quản lí" : "Cá nhân"}
    >
      <section className="scope-banner">
        <div>
          <strong>{roleLabel(viewer.role)}</strong>
          <p>{memberScopedText}</p>
        </div>
        <StatusPill
          label={
            dashboardState?.overview.activeSprint
              ? dashboardState.overview.activeSprint.name
              : "Đang đồng bộ"
          }
          tone={dashboardState?.overview.activeSprint?.health ?? "accent"}
        />
      </section>

      <section className="hero-grid">
        <Surface
          title={selectedProject?.name ?? "Đang nạp dự án"}
          kicker={selectedProject?.code ?? "Dashboard"}
          className="hero-surface"
          aside={
            selectedProject ? (
              <StatusPill
                label={`${selectedProject.progress}% hoàn thành`}
                tone={
                  selectedProject.progress >= 70
                    ? "on-track"
                    : selectedProject.progress >= 40
                      ? "watch"
                      : "critical"
                }
              />
            ) : undefined
          }
        >
          {selectedProject ? (
            <>
              <p className="hero-copy">{selectedProject.description}</p>
              <div className="hero-meta">
                <div>
                  <span>Khung thời gian</span>
                  <strong>{formatRange(selectedProject.startDate, selectedProject.endDate)}</strong>
                </div>
                <div>
                  <span>Quản lý</span>
                  <strong>{getProjectManager(selectedProject).name}</strong>
                </div>
              </div>
              <ProgressBar value={selectedProject.progress} label="Tiến độ hoàn thành dự án" />
              <div className="token-row">
                {selectedProject.objectives.map((objective) => (
                  <span key={objective} className="soft-token">
                    {objective}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="Chưa có dự án trong phạm vi"
              description="Hãy thêm thành viên vào dự án hoặc đăng nhập bằng tài khoản có dự án đang hoạt động."
            />
          )}
        </Surface>

        <Surface title="Trạng thái task" kicker="Biểu đồ">
          <DonutChart
            segments={taskSegments.map((segment) => ({ value: segment.value, tone: segment.tone }))}
            centerLabel="Task"
            centerValue={`${selectedProjectTasks.length}`}
          />
          <SegmentBar segments={taskSegments} />
        </Surface>
      </section>

      <section className="stat-grid">
        {(dashboardState?.overview.stats ?? []).map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            note={stat.change}
            tone={stat.tone}
          />
        ))}
      </section>

      <section className="two-up">
        <Surface title="Tiến độ các dự án đang tham gia" kicker="Portfolio">
          {projectList.length ? (
            <div className="stack-list">
              {projectList.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`selection-card ${selectedProjectId === project.id ? "selection-card-active" : ""}`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="selection-card-head">
                    <div>
                      <strong>{project.name}</strong>
                      <p>{project.code}</p>
                    </div>
                    <span>{project.progress}%</span>
                  </div>
                  <ProgressBar value={project.progress} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Chưa có dữ liệu dự án"
              description="Danh sách này sẽ hiện khi bạn được gán vào ít nhất một dự án."
            />
          )}
        </Surface>

        <Surface title="Tiến độ từng sprint" kicker="Sprint">
          {selectedProjectSprints.length ? (
            <MiniBars
              items={selectedProjectSprints.map((sprint) => ({
                label: sprint.name,
                value: calculateSprintCompletion(sprint),
                note: `${formatDate(sprint.plannedStart)} - ${formatDate(sprint.plannedEnd)}`,
              }))}
            />
          ) : (
            <EmptyState
              title="Chưa có sprint"
              description="Project này chưa được lập sprint hoặc sprint chưa nằm trong phạm vi của bạn."
            />
          )}
        </Surface>
      </section>

      <section className="two-up">
        <Surface title="Tổng hợp sprint hiện tại" kicker="Chi tiết">
          {dashboardState?.overview.activeSprint ? (
            <KeyValueList
              items={[
                { label: "Sprint", value: dashboardState.overview.activeSprint.name },
                {
                  label: "Mục tiêu",
                  value: dashboardState.overview.activeSprint.goal,
                },
                {
                  label: "Sức khỏe",
                  value: healthToneLabel(dashboardState.overview.activeSprint.health),
                },
              ]}
            />
          ) : (
            <EmptyState
              title="Chưa có sprint hiện tại"
              description="Khi sprint được khởi tạo, phần này sẽ hiển thị tiến độ và sức khỏe sprint."
            />
          )}
        </Surface>

        <Surface title="Task trễ hạn và cần chú ý" kicker="Rủi ro">
          {(dashboardState?.overview.overdueTasks ?? []).length ? (
            <div className="stack-list">
              {dashboardState?.overview.overdueTasks.map((task) => (
                <article key={task.id} className="risk-row">
                  <div>
                    <strong>{task.key}</strong>
                    <p>{task.title}</p>
                  </div>
                  <div className="align-right">
                    <StatusPill label={taskStatusLabel(task.status)} tone="critical" />
                    <span>Hạn {formatDate(task.dueDate)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Không có task quá hạn"
              description="Phần này sẽ tự động chuyển đỏ khi có công việc trễ deadline."
            />
          )}
        </Surface>
      </section>

      <section className="two-up">
        <Surface title="Logwork gần nhất" kicker="Dòng thời gian">
          {(dashboardState?.overview.recentLogwork ?? []).length ? (
            <div className="table-like">
              {dashboardState?.overview.recentLogwork.map((entry) => {
                const relatedTask = dashboardState.tasks.find((task) => task.id === entry.taskId);

                return (
                  <div key={entry.id} className="table-row">
                    <span>{formatDate(entry.date)}</span>
                    <strong>{relatedTask?.assignee.name ?? viewer.name}</strong>
                    <p>{entry.note}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Chưa có logwork"
              description="Khi có bản ghi thời gian làm việc, phần này sẽ hiện ngay trên dashboard."
            />
          )}
        </Surface>

        <Surface title="Các hạng mục đang chạy" kicker="Task board">
          {selectedProjectTasks.length ? (
            <div className="stack-list">
              {selectedProjectTasks.slice(0, 6).map((task) => (
                <article key={task.id} className="activity-row">
                  <div>
                    <strong>{task.key}</strong>
                    <p>{task.title}</p>
                  </div>
                  <div className="align-right">
                    <span>{task.assignee.name}</span>
                    <span>Hạn {formatDate(task.dueDate)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Chưa có task"
              description="Project này chưa có task nào trong phạm vi hiển thị hiện tại."
            />
          )}
        </Surface>
      </section>
    </WorkspaceShell>
  );
}
