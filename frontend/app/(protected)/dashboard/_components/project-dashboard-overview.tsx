"use client";

import {
  DonutChart,
  EmptyState,
  ProgressBar,
  SegmentBar,
  StatCard,
  StatusPill,
  Surface,
} from "@/components/ui";
import {
  formatDate,
  formatHours,
  formatPercent,
  formatRange,
  healthToneLabel,
  taskStatusLabel,
  taskStatusTone,
} from "@/lib/utils/format";
import type { DashboardOverview } from "@/types";

type DashboardStat = {
  label: string;
  value: string;
  note: string;
  tone: "accent" | "on-track" | "watch" | "critical";
};

type CompareRowItem = {
  id: string;
  label: string;
  primaryValue: number;
  secondaryValue: number;
  meta?: string;
  trailing?: string;
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

function toneFromCoverage(value: number): "on-track" | "watch" | "critical" {
  if (value >= 80) {
    return "on-track";
  }

  if (value >= 50) {
    return "watch";
  }

  return "critical";
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

function TaskFocusList({
  tasks,
  title,
  emptyLabel,
  extraLabel,
}: {
  tasks: DashboardOverview["activeTasks"];
  title: string;
  emptyLabel: string;
  extraLabel: string;
}) {
  const visibleTasks = tasks.slice(0, 3);
  const hiddenTasks = tasks.slice(3);

  return (
    <div className="dashboard-task-focus-block">
      <div className="dashboard-task-focus-head">
        <strong>{title}</strong>
        <span>{tasks.length}</span>
      </div>

      {visibleTasks.length ? (
        <div className="dashboard-task-focus-grid">
          {visibleTasks.map((task) => (
            <article key={task.id} className="dashboard-task-focus-card">
              <StatusPill
                label={taskStatusLabel(task.status)}
                tone={taskStatusTone(task.status)}
              />
              <strong>{task.key}</strong>
              <p>{task.title}</p>
              <span>{task.assigneeName || formatDate(task.dueDate || "")}</span>
            </article>
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
          <div className="dashboard-dropdown-body stack-list compact">
            {hiddenTasks.map((task) => (
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
                  <span>{task.assigneeName || formatDate(task.dueDate || "")}</span>
                </div>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function ProjectDashboardOverview({ overview }: { overview: DashboardOverview | null }) {
  if (!overview) {
    return (
      <Surface title="Đang nạp dashboard..." kicker="Overview">
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)" }}>
          Đang tổng hợp dữ liệu dashboard của dự án...
        </div>
      </Surface>
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
      label: "Tiến độ ET",
      value: formatPercent(overview.projectProgress),
      note: `${doneEt} đã xong · ${remainingEt} còn lại`,
      tone: toneFromProgress(overview.projectProgress),
    },
    {
      label: "Task mở",
      value: `${openTaskCount}`,
      note: `${taskSummary.inProgress} đang làm · ${taskSummary.todo} cần làm`,
      tone: openTaskCount > 0 ? "accent" : "on-track",
    },
    {
      label: "Quá hạn",
      value: `${taskSummary.overdue}`,
      note:
        taskSummary.overdue > 0
          ? "Những task này đang cần xử lý ngay"
          : "Không có task nào bị trễ hạn",
      tone: taskSummary.overdue > 0 ? "critical" : "on-track",
    },
    {
      label: "Logwork hôm nay",
      value: formatPercent(overview.logworkCoverage),
      note: coverageNote,
      tone: toneFromCoverage(overview.logworkCoverage),
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

  return (
    <>
      <section className="dashboard-stat-grid">
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

      <section className="dashboard-visual-grid">
        <Surface
          title={selectedProject?.name ?? "Đang nạp dự án"}
          kicker={selectedProject?.code ?? "PROJECT"}
          className="dashboard-focus-surface"
          aside={
            selectedProject ? (
              <StatusPill
                label={`${overview.projectProgress ?? selectedProject.progress}%`}
                tone={toneFromProgress(overview.projectProgress ?? selectedProject.progress)}
              />
            ) : undefined
          }
        >
          {selectedProject ? (
            <div className="dashboard-focus-card">
              <div className="dashboard-focus-facts">
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
                <article className="dashboard-focus-metric">
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

        <Surface title="Task Pulse" kicker="Workflow">
          <div className="dashboard-task-pulse">
            <DonutChart
              segments={taskSegments.map((segment) => ({ value: segment.value, tone: segment.tone }))}
              centerLabel="Tasks"
              centerValue={`${taskSummary.total}`}
            />
            <div className="dashboard-task-breakdown">
              {taskSegments.map((segment) => (
                <article key={segment.label} className="dashboard-task-mini">
                  <StatusPill
                    label={segment.label}
                    tone={
                      segment.tone === "todo"
                        ? "todo"
                        : segment.tone === "progress"
                          ? "progress"
                          : "done"
                    }
                  />
                  <strong>{segment.value}</strong>
                </article>
              ))}
            </div>
            <SegmentBar segments={taskSegments} showLegend={false} />
          </div>
        </Surface>
      </section>

      <section className="dashboard-single-grid">
        <Surface title="Task Focus" kicker="Overdue + In Flight">
          {overview.overdueTasks.length || overview.activeTasks.length ? (
            <div className="dashboard-task-focus">
              <TaskFocusList
                tasks={overview.overdueTasks}
                title="Overdue"
                emptyLabel="Không có overdue"
                extraLabel="Xem thêm overdue"
              />
              <TaskFocusList
                tasks={overview.activeTasks}
                title="In flight"
                emptyLabel="Không có task đang chạy"
                extraLabel="Xem thêm task đang chạy"
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
        <Surface title="Workload" kicker="Logged vs Estimate">
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
    </>
  );
}
