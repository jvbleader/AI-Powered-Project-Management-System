"use client";

import { useEffect, useMemo, useState } from "react";

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
import { useAuthSession } from "@/hooks/use-session";
import { normalizeViewer } from "@/lib/mock/permissions";
import {
  formatDate,
  formatHours,
  formatPercent,
  formatRange,
  healthToneLabel,
  projectRoleLabel,
  roleLabel,
  taskStatusLabel,
  taskStatusTone,
} from "@/lib/utils/format";
import { dashboardApi, projectApi } from "@/services/api";
import type { DashboardOverview, Project, WorkspaceShellData } from "@/types";

type DashboardState = {
  overview: DashboardOverview;
  projects: Project[];
};

type DashboardStat = {
  label: string;
  value: string;
  note: string;
  tone: "accent" | "on-track" | "watch" | "critical";
};

function toneFromProgress(value: number): "on-track" | "watch" | "critical" {
  if (value >= 75) {
    return "on-track";
  }

  if (value >= 45) {
    return "watch";
  }

  return "critical";
}

export default function DashboardPage() {
  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dashboardState, setDashboardState] = useState<DashboardState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      const { data: projects } = await projectApi.list(undefined, viewer);
      const projectId = selectedProjectId ?? projects[0]?.id;
      const { data: overview } = await dashboardApi.getOverview(viewer, projectId);

      if (isCancelled) {
        return;
      }

      setSelectedProjectId(projectId ?? null);
      setDashboardState({
        overview,
        projects,
      });
    }

    void loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [selectedProjectId, viewer]);

  const overview = dashboardState?.overview ?? null;
  const projectList = dashboardState?.projects ?? [];
  const selectedProject = overview?.project ?? null;
  const taskSummary = overview?.taskSummary ?? {
    todo: 0,
    inProgress: 0,
    done: 0,
    total: 0,
    overdue: 0,
  };
  const taskSegments = [
    { label: "To do", value: taskSummary.todo, tone: "todo" as const },
    { label: "In Progress", value: taskSummary.inProgress, tone: "progress" as const },
    { label: "Done", value: taskSummary.done, tone: "done" as const },
  ];
  const canManageScope =
    viewer.role === "ADMIN" ||
    viewer.role === "MANAGER" ||
    viewer.role === "LEADER" ||
    projectList.some((project) => project.managerId === viewer.id);
  const missingLogwork =
    overview?.workloadBoard.length
      ? Math.max(
          0,
          overview.workloadBoard.length -
            Math.round((overview.workloadBoard.length * overview.logworkCoverage) / 100),
        )
      : 0;
  const shellData: WorkspaceShellData = {
    currentUser: viewer,
    activeProjects: projectList.filter((project) => project.status === "ACTIVE").length,
    openTasks: overview?.openTasksInScope ?? 0,
    missingLogwork,
    alertCount: overview?.criticalAlerts ?? 0,
  };
  const statCards: DashboardStat[] = overview
    ? [
        {
          label: "Tiến độ danh mục",
          value: formatPercent(overview.portfolioProgress),
          note: `${overview.projectsInScope} dự án trong phạm vi truy cập`,
          tone: "accent" as const,
        },
        {
          label: "Tiến độ dự án",
          value: formatPercent(overview.projectProgress),
          note: `${taskSummary.done}/${taskSummary.total} task đã hoàn thành`,
          tone: toneFromProgress(overview.projectProgress),
        },
        {
          label: "Sprint hiện tại",
          value: formatPercent(overview.activeSprintProgress),
          note: overview.activeSprint
            ? `${overview.activeSprint.doneCount}/${overview.activeSprint.totalTasks} task đã chốt`
            : "Chưa có sprint hoạt động",
          tone: overview.activeSprint?.health ?? "watch",
        },
        {
          label: "Tỷ lệ logwork",
          value: formatPercent(overview.logworkCoverage),
          note: `${missingLogwork} thành viên chưa cập nhật hôm nay`,
          tone:
            overview.logworkCoverage >= 80
              ? "on-track"
              : overview.logworkCoverage >= 50
                ? "watch"
                : "critical",
        },
        {
          label: "Cảnh báo trọng yếu",
          value: `${overview.criticalAlerts}`,
          note: `${taskSummary.overdue} task quá hạn trong dự án đang chọn`,
          tone: overview.criticalAlerts > 0 ? "critical" : "on-track",
        },
      ]
    : [];
  const memberScopedText = canManageScope
    ? "Bạn đang xem phạm vi quản lí và điều phối."
    : "Bạn đang xem đúng các dự án, sprint và công việc mình tham gia.";

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Dashboard dự án"
      subheading="Theo dõi tiến độ dự án, sprint, trạng thái task và phân bổ khối lượng công việc trong cùng một màn hình."
      highlightLabel="Phạm vi"
      highlightValue={canManageScope ? "Quản lí" : "Cá nhân"}
    >
      <section className="scope-banner">
        <div>
          <strong>{roleLabel(viewer.role)}</strong>
          <p>{memberScopedText}</p>
        </div>
        <StatusPill
          label={overview?.activeSprint ? overview.activeSprint.name : "Đang đồng bộ"}
          tone={overview?.activeSprint?.health ?? "accent"}
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
                label={`${overview?.projectProgress ?? selectedProject.progress}% hoàn thành`}
                tone={toneFromProgress(overview?.projectProgress ?? selectedProject.progress)}
              />
            ) : undefined
          }
        >
          {selectedProject ? (
            <>
              <p className="hero-copy">
                {selectedProject.description || "Dự án này đang được tổng hợp tiến độ và phân tích tải công việc theo thời gian thực."}
              </p>
              <div className="hero-meta">
                <div>
                  <span>Khung thời gian</span>
                  <strong>{formatRange(selectedProject.startDate, selectedProject.endDate)}</strong>
                </div>
                <div>
                  <span>Quản lý</span>
                  <strong>{selectedProject.managerName || "Chưa phân công"}</strong>
                </div>
                <div>
                  <span>Số task trong phạm vi</span>
                  <strong>{selectedProject.metrics.totalTasks}</strong>
                </div>
              </div>
              <ProgressBar
                value={overview?.projectProgress ?? selectedProject.progress}
                label="Tiến độ hoàn thành dự án"
              />
              <div className="token-row">
                <span className="soft-token">
                  {selectedProject.metrics.completedTasks} task hoàn thành
                </span>
                <span className="soft-token">
                  {selectedProject.metrics.overdueTasks} task quá hạn
                </span>
                <span className="soft-token">
                  {selectedProject.metrics.logworkCoverage}% phủ logwork
                </span>
                <span className="soft-token">Velocity {selectedProject.metrics.velocity}%</span>
              </div>
            </>
          ) : (
            <EmptyState
              title="Chưa có dự án trong phạm vi"
              description="Hãy thêm thành viên vào dự án hoặc đăng nhập bằng tài khoản đang tham gia dự án."
            />
          )}
        </Surface>

        <Surface title="Trạng thái task" kicker="Biểu đồ">
          <DonutChart
            segments={taskSegments.map((segment) => ({ value: segment.value, tone: segment.tone }))}
            centerLabel="Task"
            centerValue={`${taskSummary.total}`}
          />
          <SegmentBar segments={taskSegments} />
        </Surface>
      </section>

      <section className="stat-grid">
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            note={stat.note}
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
                  <div className="selection-card-meta">
                    <span>
                      {project.metrics.completedTasks}/{project.metrics.totalTasks} task done
                    </span>
                    <span>{project.metrics.overdueTasks} quá hạn</span>
                  </div>
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
          {(overview?.sprintSummaries ?? []).length ? (
            <div className="stack-list compact">
              {overview?.sprintSummaries.map((sprint) => (
                <article key={sprint.id} className="sprint-summary-card">
                  <div className="selection-card-head">
                    <div>
                      <strong>{sprint.name}</strong>
                      <p>
                        {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                      </p>
                    </div>
                    <StatusPill
                      label={healthToneLabel(sprint.health)}
                      tone={sprint.health}
                    />
                  </div>
                  <MiniBars
                    items={[
                      {
                        label: "Actual",
                        value: sprint.actualProgress,
                        note: `${sprint.doneCount}/${sprint.totalTasks} task done`,
                      },
                      {
                        label: "Plan",
                        value: sprint.plannedProgress,
                        note: `${formatHours(sprint.loggedHours)} log / ${formatHours(sprint.estimatedHours)} estimate`,
                      },
                    ]}
                  />
                </article>
              ))}
            </div>
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
          {overview?.activeSprint ? (
            <div className="dashboard-stack">
              <KeyValueList
                items={[
                  { label: "Sprint", value: overview.activeSprint.name },
                  {
                    label: "Mục tiêu",
                    value: overview.activeSprint.goal || "Chưa khai báo",
                  },
                  {
                    label: "Sức khỏe",
                    value: healthToneLabel(overview.activeSprint.health),
                  },
                ]}
              />
              <SegmentBar
                segments={[
                  { label: "To do", value: overview.activeSprint.todoCount, tone: "todo" },
                  {
                    label: "In Progress",
                    value: overview.activeSprint.inProgressCount,
                    tone: "progress",
                  },
                  { label: "Done", value: overview.activeSprint.doneCount, tone: "done" },
                ]}
              />
            </div>
          ) : (
            <EmptyState
              title="Chưa có sprint hiện tại"
              description="Khi sprint được khởi tạo, phần này sẽ hiển thị tiến độ và sức khỏe sprint."
            />
          )}
        </Surface>

        <Surface title="Phân tích khối lượng công việc" kicker="Workload">
          {(overview?.workloadBoard ?? []).length ? (
            <div className="stack-list">
              {overview?.workloadBoard.map((member) => (
                <article key={member.userId} className="member-progress-row">
                  <div>
                    <strong>{member.name}</strong>
                    <p>
                      {projectRoleLabel(member.roleName)} · {member.assignedTasks} task được giao
                    </p>
                  </div>
                  <div className="member-progress-copy">
                    <ProgressBar value={member.progress} />
                    <p>
                      {member.todoTasks} todo · {member.inProgressTasks} doing ·{" "}
                      {member.doneTasks} done · {formatHours(member.loggedHours)} /{" "}
                      {formatHours(member.estimatedHours)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Chưa có dữ liệu workload"
              description="Khi dự án có thành viên và task được gán, phần này sẽ hiển thị tải công việc từng người."
            />
          )}
        </Surface>
      </section>

      <section className="two-up">
        <Surface title="Task trễ hạn và cần chú ý" kicker="Rủi ro">
          {(overview?.overdueTasks ?? []).length ? (
            <div className="stack-list">
              {overview?.overdueTasks.map((task) => (
                <article key={task.id} className="risk-row">
                  <div>
                    <strong>{task.key}</strong>
                    <p>{task.title}</p>
                  </div>
                  <div className="align-right">
                    <StatusPill
                      label={taskStatusLabel(task.status)}
                      tone={taskStatusTone(task.status)}
                    />
                    <span>
                      {task.assigneeName || "Chưa phân công"} · Hạn{" "}
                      {formatDate(task.dueDate || "")}
                    </span>
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

        <Surface title="Các hạng mục đang chạy" kicker="Task board">
          {(overview?.activeTasks ?? []).length ? (
            <div className="stack-list">
              {overview?.activeTasks.map((task) => (
                <article key={task.id} className="activity-row">
                  <div>
                    <strong>{task.key}</strong>
                    <p>{task.title}</p>
                  </div>
                  <div className="align-right">
                    <StatusPill
                      label={taskStatusLabel(task.status)}
                      tone={taskStatusTone(task.status)}
                    />
                    <span>
                      {task.assigneeName || "Chưa phân công"} · Hạn{" "}
                      {formatDate(task.dueDate || "")}
                    </span>
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

      <section className="two-up">
        <Surface title="Logwork gần nhất" kicker="Dòng thời gian">
          {(overview?.recentLogwork ?? []).length ? (
            <div className="table-like">
              {overview?.recentLogwork.map((entry) => (
                <div key={entry.id} className="table-row">
                  <span>{formatDate(entry.workDate)}</span>
                  <strong>{entry.userName}</strong>
                  <p>
                    {entry.taskKey} · {entry.taskTitle}
                  </p>
                  <small>
                    {formatHours(entry.hours)} · {entry.progressPercent}% tiến độ
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Chưa có logwork"
              description="Khi có bản ghi thời gian làm việc, phần này sẽ hiện ngay trên dashboard."
            />
          )}
        </Surface>

        <Surface title="Điểm kiểm soát nhanh" kicker="Overview">
          {selectedProject ? (
            <div className="summary-grid">
              <article className="summary-card">
                <span>Task đang mở</span>
                <strong>{overview?.openTasksInScope ?? 0}</strong>
              </article>
              <article className="summary-card">
                <span>Sprint đang theo dõi</span>
                <strong>{overview?.sprintSummaries.length ?? 0}</strong>
              </article>
              <article className="summary-card">
                <span>Thành viên có tải việc</span>
                <strong>{overview?.workloadBoard.length ?? 0}</strong>
              </article>
              <article className="summary-card">
                <span>Logwork hôm nay</span>
                <strong>{formatPercent(overview?.logworkCoverage ?? 0)}</strong>
              </article>
            </div>
          ) : (
            <EmptyState
              title="Chưa có dữ liệu tổng quan"
              description="Chọn dự án để xem nhanh các chỉ số điều phối chính."
            />
          )}
        </Surface>
      </section>
    </WorkspaceShell>
  );
}
