"use client";

import {
  DonutChart,
  EmptyState,
  ProgressBar,
  StatusPill,
  Surface,
} from "@/components/ui";
import {
  formatDate,
  formatHours,
  formatPercent,
  formatRange,
  taskStatusLabel,
  taskStatusTone,
} from "@/lib/utils/format";
import { LoadingState } from "@/components/loading-state";
import type { DashboardOverview } from "@/types";

type DashboardStatTone = "accent" | "on-track" | "watch" | "critical";

type DashboardStat = {
  label: string;
  value: string;
  note: string;
  tone: DashboardStatTone;
  icon: "progress" | "open" | "overdue" | "logwork";
};

type CompareRowItem = {
  id: string;
  label: string;
  primaryValue: number;
  secondaryValue: number;
  meta?: string;
  trailing?: string;
};

type FocusTask = DashboardOverview["activeTasks"][number];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function toneFromProgress(value: number): "on-track" | "watch" | "critical" {
  if (value >= 75) {
    return "on-track";
  }

  if (value >= 45) {
    return "watch";
  }

  return "critical";
}

function toneFromCoverage(value: number): "on-track" | "watch" | "critical" {
  if (value >= 80) {
    return "on-track";
  }

  if (value >= 50) {
    return "watch";
  }

  return "critical";
}

function kpiToneClass(tone: DashboardStatTone) {
  if (tone === "critical") return "is-critical";
  if (tone === "watch") return "is-watch";
  if (tone === "on-track") return "is-on-track";
  return "is-accent";
}

function KpiIcon({ name }: { name: DashboardStat["icon"] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "progress") {
    return (
      <svg {...common}>
        <path d="M12 3a9 9 0 1 0 9 9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (name === "open") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="6" height="16" rx="1" />
        <rect x="14" y="4" width="6" height="10" rx="1" />
      </svg>
    );
  }

  if (name === "overdue") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function CompareRows({
  items,
  primaryLabel,
  secondaryLabel,
  formatValue,
}: {
  items: CompareRowItem[];
  primaryLabel: string;
  secondaryLabel: string;
  formatValue: (value: number) => string;
}) {
  const maxValue = Math.max(
    1,
    ...items.flatMap((item) => [item.primaryValue, item.secondaryValue]),
  );

  return (
    <div className="compare-chart">
      <div className="compare-legend">
        <div className="compare-legend-item">
          <span className="compare-dot compare-dot-primary" />
          <span>{primaryLabel}</span>
        </div>
        <div className="compare-legend-item">
          <span className="compare-dot compare-dot-secondary" />
          <span>{secondaryLabel}</span>
        </div>
      </div>

      <div className="compare-chart-rows">
        {items.map((item) => (
          <article key={item.id} className="compare-row">
            <div className="compare-row-head">
              <div>
                <strong>{item.label}</strong>
                {item.meta ? <p>{item.meta}</p> : null}
              </div>
              {item.trailing ? <span>{item.trailing}</span> : null}
            </div>

            <div className="compare-bars">
              <div className="compare-bar-stack">
                <div className="compare-track">
                  <span
                    className="compare-fill compare-fill-primary"
                    style={{
                      width: `${Math.max(8, (item.primaryValue / maxValue) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{formatValue(item.primaryValue)}</strong>
              </div>

              <div className="compare-bar-stack">
                <div className="compare-track">
                  <span
                    className="compare-fill compare-fill-secondary"
                    style={{
                      width: `${Math.max(8, (item.secondaryValue / maxValue) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{formatValue(item.secondaryValue)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TaskFocusRow({ task }: { task: FocusTask }) {
  return (
    <article className="project-overview-focus-row">
      <div className="project-overview-focus-copy">
        <strong>{task.key}</strong>
        <p>{task.title}</p>
      </div>
      <div className="project-overview-focus-meta">
        <StatusPill label={taskStatusLabel(task.status)} tone={taskStatusTone(task.status)} />
        <span>{task.assigneeName || formatDate(task.dueDate || "")}</span>
      </div>
    </article>
  );
}

function TaskFocusList({
  tasks,
  title,
  emptyLabel,
  extraLabel,
  tone,
}: {
  tasks: FocusTask[];
  title: string;
  emptyLabel: string;
  extraLabel: string;
  tone: "critical" | "accent";
}) {
  const visibleTasks = tasks.slice(0, 3);
  const hiddenTasks = tasks.slice(3);

  return (
    <div className="project-overview-focus-block">
      <div className="project-overview-focus-head">
        <strong>{title}</strong>
        <span className={classNames("project-overview-count", `is-${tone}`)}>{tasks.length}</span>
      </div>

      {visibleTasks.length ? (
        <div className="project-overview-focus-list">
          {visibleTasks.map((task) => (
            <TaskFocusRow key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <EmptyState title={emptyLabel} description="Không có dữ liệu trong nhóm này." />
      )}

      {hiddenTasks.length ? (
        <details className="dashboard-dropdown">
          <summary className="dashboard-dropdown-summary">
            {extraLabel} {hiddenTasks.length}
          </summary>
          <div className="dashboard-dropdown-body">
            <div className="project-overview-focus-list">
              {hiddenTasks.map((task) => (
                <TaskFocusRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function ProjectDashboardOverview({
  overview,
  isLoading = false,
}: {
  overview: DashboardOverview | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <LoadingState variant="dashboard" label="Đang tổng hợp dữ liệu dashboard của dự án..." />;
  }

  if (!overview) {
    return (
      <EmptyState
        title="Không có dữ liệu"
        description="Không thể tải tổng quan dự án. Thử tải lại trang."
      />
    );
  }

  const selectedProject = overview.project;
  const taskSummary = overview.taskSummary;
  const openTaskCount = taskSummary.todo + taskSummary.inProgress;
  const doneEt = formatHours(overview.estimatedHoursDone);
  const remainingEt = formatHours(overview.estimatedHoursRemaining);
  const coverageNote = overview.memberCount
    ? `${overview.membersLoggedToday}/${overview.memberCount} thành viên đã cập nhật`
    : "Chưa có thành viên trong dự án";
  const taskSegments = [
    { label: "To do", value: taskSummary.todo, tone: "todo" as const },
    { label: "In Progress", value: taskSummary.inProgress, tone: "progress" as const },
    { label: "Done", value: taskSummary.done, tone: "done" as const },
  ];
  const statCards: DashboardStat[] = [
    {
      label: "Tiến độ",
      value: formatPercent(overview.projectProgress),
      note: `${doneEt} đã xong · ${remainingEt} còn lại`,
      tone: toneFromProgress(overview.projectProgress),
      icon: "progress",
    },
    {
      label: "Task mở",
      value: `${openTaskCount}`,
      note: `${taskSummary.inProgress} đang làm · ${taskSummary.todo} cần làm`,
      tone: openTaskCount > 0 ? "accent" : "on-track",
      icon: "open",
    },
    {
      label: "Quá hạn",
      value: `${taskSummary.overdue}`,
      note:
        taskSummary.overdue > 0
          ? "Những task này đang cần xử lý ngay"
          : "Không có task nào bị trễ hạn",
      tone: taskSummary.overdue > 0 ? "critical" : "on-track",
      icon: "overdue",
    },
    {
      label: "Logwork hôm nay",
      value: formatPercent(overview.logworkCoverage),
      note: coverageNote,
      tone: toneFromCoverage(overview.logworkCoverage),
      icon: "logwork",
    },
  ];

  const workloadCompareItems: CompareRowItem[] = overview.workloadBoard.map((member) => ({
    id: member.userId,
    label: member.name,
    primaryValue: member.loggedHours,
    secondaryValue: member.estimatedHours,
    meta: `${member.assignedTasks} task · ${member.doneTasks} done`,
    trailing: `${member.progress}%`,
  }));

  const visibleWorkloadItems = workloadCompareItems.slice(0, 4);
  const hiddenWorkloadItems = workloadCompareItems.slice(4);
  const progressTone = toneFromProgress(overview.projectProgress ?? selectedProject?.progress ?? 0);

  return (
    <div className="project-overview">
      <section className="project-overview-kpi-grid">
        {statCards.map((stat) => {
          const toneClass = kpiToneClass(stat.tone);
          return (
            <article key={stat.label} className="global-dash-kpi is-static">
              <span className="global-dash-kpi-label">
                <span className={classNames("global-dash-kpi-icon", toneClass)}>
                  <KpiIcon name={stat.icon} />
                </span>
                {stat.label}
              </span>
              <strong className={classNames("global-dash-kpi-value", toneClass)}>{stat.value}</strong>
              <p className={classNames("global-dash-kpi-note", stat.tone === "critical" && "is-critical")}>
                {stat.note}
              </p>
            </article>
          );
        })}
      </section>

      <section className="dashboard-visual-grid">
        <Surface
          title={selectedProject?.name ?? "Đang nạp dự án"}
          aside={
            selectedProject ? (
              <StatusPill
                label={`${overview.projectProgress ?? selectedProject.progress}%`}
                tone={progressTone}
              />
            ) : undefined
          }
        >
          {selectedProject ? (
            <div className="dashboard-focus-card">
              <div className="project-overview-facts">
                <span>{formatRange(selectedProject.startDate, selectedProject.endDate)}</span>
                <span>{selectedProject.managerName || "Chưa có PM"}</span>
              </div>

              <div className="dashboard-focus-metrics">
                <article className="dashboard-focus-metric">
                  <span>Tổng task</span>
                  <strong>{taskSummary.total}</strong>
                </article>
                <article className="dashboard-focus-metric">
                  <span>Task xong</span>
                  <strong>{taskSummary.done}</strong>
                </article>
                <article className="dashboard-focus-metric">
                  <span>Team</span>
                  <strong>{overview.memberCount || selectedProject.memberIds.length}</strong>
                </article>
                <article
                  className={classNames(
                    "dashboard-focus-metric",
                    taskSummary.overdue > 0 && "is-critical",
                  )}
                >
                  <span>Quá hạn</span>
                  <strong>{taskSummary.overdue}</strong>
                </article>
              </div>

              <ProgressBar
                value={overview.projectProgress ?? selectedProject.progress}
                label="Completion by ET"
              />
            </div>
          ) : (
            <EmptyState
              title="Chưa có dữ liệu dự án"
              description="Project card sẽ hiện ngay khi tài khoản có dự án trong phạm vi."
            />
          )}
        </Surface>

        <Surface title="Task Pulse">
          <div className="dashboard-task-pulse">
            <div className="task-pulse-donut global-dash-donut">
              <DonutChart
                segments={taskSegments.map((segment) => ({ value: segment.value, tone: segment.tone }))}
                centerLabel="Tasks"
                centerValue={`${taskSummary.total}`}
              />
            </div>
            <div className="task-pulse-stats">
              {taskSegments.map((segment) => {
                const pct = taskSummary.total > 0 ? Math.round((segment.value / taskSummary.total) * 100) : 0;
                return (
                  <div key={segment.label} className="task-pulse-stat-item">
                    <div className="task-pulse-stat-header">
                      <span className={classNames("task-pulse-dot", `task-pulse-tone-${segment.tone}`)} />
                      <span className="task-pulse-label">{segment.label}</span>
                      <span className="task-pulse-pct">{pct}%</span>
                    </div>
                    <div className="task-pulse-bar-track">
                      <div
                        className={classNames("task-pulse-bar-fill", `task-pulse-tone-${segment.tone}`)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="task-pulse-count">{segment.value} tasks</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Surface>
      </section>

      <section className="dashboard-single-grid">
        <Surface title="Task Focus">
          {overview.overdueTasks.length || overview.activeTasks.length ? (
            <div className="project-overview-focus">
              <TaskFocusList
                tasks={overview.overdueTasks}
                title="Overdue"
                emptyLabel="Không có overdue"
                extraLabel="Xem thêm overdue"
                tone="critical"
              />
              <TaskFocusList
                tasks={overview.activeTasks}
                title="In flight"
                emptyLabel="Không có task đang chạy"
                extraLabel="Xem thêm task đang chạy"
                tone="accent"
              />
            </div>
          ) : (
            <EmptyState
              title="Chưa có task"
              description="Task focus sẽ hiện khi dự án có dữ liệu công việc."
            />
          )}
        </Surface>
      </section>

      <section className="dashboard-single-grid">
        <Surface title="Workload">
          {visibleWorkloadItems.length ? (
            <>
              <CompareRows
                items={visibleWorkloadItems}
                primaryLabel="Logged"
                secondaryLabel="Estimate"
                formatValue={formatHours}
              />

              {hiddenWorkloadItems.length ? (
                <details className="dashboard-dropdown">
                  <summary className="dashboard-dropdown-summary">
                    Xem thêm {hiddenWorkloadItems.length} thành viên
                  </summary>
                  <div className="dashboard-dropdown-body">
                    <CompareRows
                      items={hiddenWorkloadItems}
                      primaryLabel="Logged"
                      secondaryLabel="Estimate"
                      formatValue={formatHours}
                    />
                  </div>
                </details>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="Chưa có workload"
              description="Biểu đồ tải việc sẽ hiện khi task được giao cho thành viên."
            />
          )}
        </Surface>
      </section>
    </div>
  );
}
