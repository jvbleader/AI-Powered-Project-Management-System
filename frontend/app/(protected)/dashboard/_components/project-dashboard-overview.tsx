"use client";

import Link from "next/link";
import { useState } from "react";

import {
  DonutChart,
  EmptyState,
  StatusPill,
  Surface,
} from "@/components/ui";
import {
  formatDate,
  formatHours,
  formatPercent,
  formatRange,
  logworkStatusClassName,
  logworkStatusLabel,
} from "@/lib/utils/format";
import type { DashboardOverview } from "@/types";

type BoardTab = "kanban" | "gantt";
type DashboardTask = DashboardOverview["activeTasks"][number];
type AttentionTask = DashboardTask & { attentionType: "overdue" | "upcoming" };
type CompareRowItem = {
  id: string;
  label: string;
  primaryValue: number;
  secondaryValue: number;
  meta?: string;
  trailing?: string;
  href?: string;
};

type ProjectDashboardOverviewProps = {
  overview: DashboardOverview | null;
  canViewLogwork?: boolean;
};

function boardHref(
  projectId: string,
  boardTab: BoardTab,
  options?: { taskId?: string; color?: "red" | "blue" | "green" | "yellow" },
) {
  const params = new URLSearchParams({ tab: boardTab });
  if (options?.taskId) params.set("highlightTaskId", options.taskId);
  if (options?.color) params.set("highlightColor", options.color);
  return `/projects/${projectId}?${params.toString()}`;
}

function membersHref(projectId: string) {
  return `/projects/${projectId}?tab=members`;
}

function CompareRows({
  items,
  primaryLabel,
  secondaryLabel,
}: {
  items: CompareRowItem[];
  primaryLabel: string;
  secondaryLabel: string;
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
        {items.map((item) => {
          const content = (
            <>
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
                  <strong>{formatHours(item.primaryValue)}</strong>
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
                  <strong>{formatHours(item.secondaryValue)}</strong>
                </div>
              </div>
            </>
          );

          return item.href ? (
            <Link
              key={item.id}
              href={item.href}
              className="compare-row compare-row-link"
            >
              {content}
            </Link>
          ) : (
            <article key={item.id} className="compare-row">
              {content}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ExpandToggle({
  expanded,
  hiddenCount,
  unitLabel,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  unitLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="dashboard-dropdown-summary"
      onClick={onToggle}
      style={{
        marginTop: "0.85rem",
        width: "100%",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        borderRadius: "18px",
        background: "rgba(248, 250, 252, 0.9)",
        textAlign: "left",
      }}
    >
      {expanded ? `Thu gọn ${unitLabel}` : `Xem thêm ${hiddenCount} ${unitLabel}`}
    </button>
  );
}

function WorkloadContent({ items }: { items: CompareRowItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleLimit = 4;

  if (!items.length) {
    return (
      <EmptyState
        title="Chưa có dữ liệu phân công"
        description="Khối lượng công việc sẽ hiển thị khi task được giao."
      />
    );
  }

  const hasMore = items.length > visibleLimit;
  const itemsToShow = expanded ? items : items.slice(0, visibleLimit);
  const hiddenCount = items.length - visibleLimit;

  return (
    <>
      <CompareRows
        items={itemsToShow}
        primaryLabel="AT"
        secondaryLabel="ET"
      />
      {hasMore ? (
        <ExpandToggle
          expanded={expanded}
          hiddenCount={hiddenCount}
          unitLabel="thành viên"
          onToggle={() => setExpanded((prev) => !prev)}
        />
      ) : null}
    </>
  );
}

function PersonalWorkloadSummary({ item }: { item?: CompareRowItem }) {
  if (!item) return null;

  const percent = item.secondaryValue
    ? Math.min(100, Math.round((item.primaryValue / item.secondaryValue) * 100))
    : 0;

  return (
    <div className="project-personal-workload">
      <div className="project-personal-workload-summary-head">
        <strong>Khối lượng công việc</strong>
      </div>
      <div className="project-personal-workload-track">
        <span style={{ width: `${Math.max(percent, item.primaryValue ? 4 : 0)}%` }} />
      </div>
      <p>
        {formatHours(item.primaryValue)}/{formatHours(item.secondaryValue)}
      </p>
    </div>
  );
}

function TaskAttentionCard({
  task,
  projectId,
  boardTab,
}: {
  task: AttentionTask;
  projectId: string;
  boardTab: BoardTab;
}) {
  const isOverdue = task.attentionType === "overdue";

  return (
    <Link
      href={boardHref(projectId, boardTab, {
        taskId: task.id,
        color: isOverdue ? "red" : "yellow",
      })}
      className={`project-attention-card ${
        isOverdue
          ? "project-attention-card-overdue"
          : "project-attention-card-upcoming"
      }`}
    >
      <div className="project-attention-card-head">
        <StatusPill
          label={isOverdue ? "Quá hạn" : "Sắp đến hạn"}
          tone={isOverdue ? "critical" : "watch"}
        />
        <strong>{task.key}</strong>
      </div>
      <p>{task.title}</p>
      <div className="project-attention-card-meta">
        <span>{task.assigneeName || "Chưa giao người phụ trách"}</span>
        <span>{task.dueDate ? formatDate(task.dueDate) : "Chưa có hạn chót"}</span>
      </div>
    </Link>
  );
}

function AttentionTasks({
  tasks,
  projectId,
  boardTab,
  personalScope,
}: {
  tasks: AttentionTask[];
  projectId: string;
  boardTab: BoardTab;
  personalScope: boolean;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  if (!tasks.length) {
    return (
      <EmptyState
        title="Không có công việc cần chú ý"
        description="Dự án hiện không có task quá hạn hoặc sắp đến hạn."
      />
    );
  }

  const groups = [
    {
      id: "overdue",
      title: personalScope ? "Task quá hạn của bạn" : "Task quá hạn",
      tasks: tasks.filter((task) => task.attentionType === "overdue"),
    },
    {
      id: "upcoming",
      title: personalScope ? "Task sắp đến hạn của bạn" : "Task sắp đến hạn",
      tasks: tasks.filter((task) => task.attentionType === "upcoming"),
    },
  ];

  return (
    <div className="project-attention-groups">
      {groups.map((group) => {
        const isExpanded = Boolean(expandedGroups[group.id]);
        const visibleLimit = 4;
        const hasMore = group.tasks.length > visibleLimit;
        const tasksToShow = isExpanded ? group.tasks : group.tasks.slice(0, visibleLimit);
        const hiddenCount = group.tasks.length - visibleLimit;

        return (
          <section
            key={group.id}
            className={`project-attention-group project-attention-group-${group.id}`}
          >
            <div className="project-attention-group-head">
              <div>
                <i />
                <strong>{group.title}</strong>
              </div>
              <span>{group.tasks.length}</span>
            </div>

            {tasksToShow.length ? (
              <div className="project-attention-grid">
                {tasksToShow.map((task) => (
                  <TaskAttentionCard
                    key={`${task.attentionType}-${task.id}`}
                    task={task}
                    projectId={projectId}
                    boardTab={boardTab}
                  />
                ))}
              </div>
            ) : (
              <div className="project-attention-group-empty">
                Không có {group.title.toLowerCase()}
              </div>
            )}

            {hasMore ? (
              <ExpandToggle
                expanded={isExpanded}
                hiddenCount={hiddenCount}
                unitLabel="task"
                onToggle={() =>
                  setExpandedGroups((prev) => ({
                    ...prev,
                    [group.id]: !prev[group.id],
                  }))
                }
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function RecentLogworkList({
  items,
  projectId,
  boardTab,
}: {
  items: DashboardOverview["recentLogwork"];
  projectId: string;
  boardTab: BoardTab;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleLimit = 4;

  if (!items.length) {
    return (
      <EmptyState
        title="Chưa có Logwork"
        description="Các cập nhật Logwork mới nhất của dự án sẽ hiển thị tại đây."
      />
    );
  }

  const hasMore = items.length > visibleLimit;
  const itemsToShow = expanded ? items : items.slice(0, visibleLimit);
  const hiddenCount = items.length - visibleLimit;

  return (
    <>
      <div className="project-logwork-list">
        {itemsToShow.map((logwork) => (
          <Link
            key={logwork.id}
            href={boardHref(projectId, boardTab, {
              taskId: logwork.taskId,
              color: "green",
            })}
            className="project-logwork-row"
          >
            <div className="project-logwork-row-head">
              <div>
                <strong>{logwork.userName}</strong>
                <span>{logwork.taskKey}</span>
              </div>
              <strong>{formatHours(logwork.hours)}</strong>
            </div>
            <p>{logwork.taskTitle}</p>
            <div className="project-logwork-row-meta">
              <span>{formatDate(logwork.workDate)}</span>
              <span className={`logwork-status-pill ${logworkStatusClassName(logwork.status)}`}>
                {logworkStatusLabel(logwork.status)}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {hasMore ? (
        <ExpandToggle
          expanded={expanded}
          hiddenCount={hiddenCount}
          unitLabel="logwork"
          onToggle={() => setExpanded((prev) => !prev)}
        />
      ) : null}
    </>
  );
}

export function ProjectDashboardOverview({
  overview,
  canViewLogwork = false,
}: ProjectDashboardOverviewProps) {
  if (!overview) {
    return (
      <Surface title="Đang tải tổng quan..." kicker="Dự án">
        <div className="project-dashboard-loading">
          Đang tổng hợp dữ liệu của dự án...
        </div>
      </Surface>
    );
  }

  const project = overview.project;
  if (!project) {
    return (
      <Surface title="Chưa có dữ liệu dự án" kicker="Tổng quan">
        <EmptyState
          title="Không thể hiển thị tổng quan"
          description="Dự án chưa có dữ liệu trong phạm vi truy cập."
        />
      </Surface>
    );
  }

  const projectId = project.id;
  const boardTab: BoardTab = project.projectType === "waterfall" ? "gantt" : "kanban";
  const boardLabel = boardTab === "gantt" ? "Gantt" : "Kanban";
  const boardUrl = boardHref(projectId, boardTab);
  const membersUrl = membersHref(projectId);
  const personalScope = !canViewLogwork;
  const taskSummary = overview.taskSummary;
  const overdueIds = new Set(overview.overdueTasks.map((task) => task.id));
  const activeTasks = overview.activeTasks.filter((task) => !overdueIds.has(task.id));
  const attentionTasks: AttentionTask[] = [
    ...overview.overdueTasks.map((task) => ({
      ...task,
      attentionType: "overdue" as const,
    })),
    ...activeTasks.map((task) => ({
      ...task,
      attentionType: "upcoming" as const,
    })),
  ];
  const workloadCompareItems: CompareRowItem[] = overview.workloadBoard.map((member) => ({
    id: member.userId,
    label: member.name,
    primaryValue: member.loggedHours,
    secondaryValue: member.estimatedHours,
    meta: `${member.assignedTasks} task · ${member.doneTasks} hoàn thành`,
    trailing: `${member.progress}%`,
    href: personalScope ? undefined : membersUrl,
  }));
  const visibleWorkloadItems = workloadCompareItems.slice(0, 4);

  const taskSegments = [
    { label: "Cần làm", value: taskSummary.todo, tone: "todo" as const },
    {
      label: "Đang thực hiện",
      value: taskSummary.inProgress,
      tone: "progress" as const,
    },
    { label: "Hoàn thành", value: taskSummary.done, tone: "done" as const },
  ];
  return (
    <div className="project-command-dashboard">
      <section className="project-command-center">
        <div className="project-command-center-head">
          <div className="project-command-identity">
            <h2>{project.name}</h2>
            <div className="project-command-meta">
              <span>{formatRange(project.startDate, project.endDate)}</span>
              <span>PM: {project.managerName || "Chưa phân công"}</span>
            </div>
          </div>
        </div>

        <div className="project-overview-visuals">
          <Link href={boardUrl} className="project-visual-card">
            <div className="project-visual-chart">
              <DonutChart
                segments={[
                  { value: overview.projectProgress, tone: "done" },
                  {
                    value: Math.max(0, 100 - overview.projectProgress),
                    tone: "neutral",
                  },
                ]}
                centerLabel="Tiến độ ET"
                centerValue={formatPercent(overview.projectProgress)}
              />
            </div>
            <div className="project-visual-caption">
              <strong>{formatHours(overview.estimatedHoursDone)}</strong>
              <span>trên {formatHours(overview.estimatedHoursTotal)} ET</span>
            </div>
          </Link>

          <Link href={boardUrl} className="project-visual-card">
            <div className="project-visual-chart">
              <DonutChart
                segments={taskSegments.map((segment) => ({
                  value: segment.value,
                  tone: segment.tone,
                }))}
                centerLabel="Tổng task"
                centerValue={`${taskSummary.total}`}
              />
            </div>
            <div className="project-task-compact-legend">
              {taskSegments.map((segment) => (
                <span key={segment.label}>
                  <i className={`project-task-dot project-task-dot-${segment.tone}`} />
                  <span>{segment.label}</span>
                  <strong>{segment.value}</strong>
                </span>
              ))}
            </div>
          </Link>
        </div>
      </section>

      <section className="dashboard-single-grid">
        <Surface
          title={personalScope ? "Công việc cần chú ý" : "Công việc cần chú ý"}
          kicker={personalScope ? "Cá nhân" : "Ưu tiên"}
          className="project-attention-surface"
          aside={
            <Link href={boardUrl} className="dashboard-inline-action">
              Xem toàn bộ trên {boardLabel} →
            </Link>
          }
        >
          {personalScope ? (
            <PersonalWorkloadSummary item={visibleWorkloadItems[0]} />
          ) : null}
          <AttentionTasks
            tasks={attentionTasks}
            projectId={projectId}
            boardTab={boardTab}
            personalScope={personalScope}
          />
        </Surface>
      </section>

      {!personalScope ? (
      <section className="project-dashboard-secondary-grid">
        <Surface
          title="Khối lượng công việc"
          kicker="Theo thành viên"
          aside={
            <Link href={membersUrl} className="dashboard-inline-action">
              Xem thành viên →
            </Link>
          }
        >
          <WorkloadContent items={workloadCompareItems} />
        </Surface>

        {canViewLogwork ? (
          <Surface
            title="Logwork gần đây"
            kicker="Cập nhật"
            aside={
              <span className="project-logwork-coverage">
                {overview.membersLoggedToday}/{overview.memberCount} hôm nay
              </span>
            }
          >
            <RecentLogworkList
              items={overview.recentLogwork}
              projectId={projectId}
              boardTab={boardTab}
            />
          </Surface>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
