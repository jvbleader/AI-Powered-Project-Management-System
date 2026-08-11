"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";

import type {
  DashboardRecentLogwork,
  DashboardTaskPreview,
  GlobalDashboardOverview as GlobalDashboardOverviewType,
  ProjectHealthPreview,
} from "@/types";
import { Surface, DonutChart, ColumnChart, type ColumnChartTone } from "@/components/ui";
import { logworkApi } from "@/services/api/logworks";
import { FilterSelect } from "@/components/filter-select";
import { formatDate } from "@/lib/utils/format";

type GlobalDashboardOverviewProps = {
  overview: GlobalDashboardOverviewType | null;
};

const kpiBaseStyle: CSSProperties = {
  padding: "0.65rem 0.85rem",
  borderRadius: "12px",
  boxShadow: "0 2px 8px -4px rgba(15, 23, 42, 0.08)",
  cursor: "pointer",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
  display: "flex",
  flexDirection: "column",
  gap: "0.12rem",
  minHeight: "78px",
  justifyContent: "center",
};

const surfaceCardStyle: CSSProperties = {
  padding: "0.75rem 0.9rem",
  borderRadius: "12px",
  boxShadow: "0 2px 10px -6px rgba(15, 23, 42, 0.1)",
  border: "1px solid rgba(148, 163, 184, 0.14)",
};

const HEALTH_RANK = { critical: 0, watch: 1, "on-track": 2 } as const;

function CountBadge({
  value,
  tone,
}: {
  value: number;
  tone: "red" | "blue";
}) {
  const isRed = tone === "red";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "1.35rem",
        height: "1.35rem",
        padding: "0 0.4rem",
        borderRadius: "999px",
        fontSize: "0.68rem",
        fontWeight: 600,
        letterSpacing: "-0.01em",
        fontVariantNumeric: "tabular-nums",
        color: isRed ? "#b91c1c" : "#1d4ed8",
        background: isRed ? "rgba(254, 226, 226, 0.75)" : "rgba(219, 234, 254, 0.75)",
        flexShrink: 0,
      }}
    >
      {value}
    </span>
  );
}

function TaskLinkRow({
  task,
  accent,
  highlightColor,
}: {
  task: DashboardTaskPreview;
  accent: "red" | "blue";
  highlightColor: "red" | "blue" | "green";
}) {
  const accentBar = accent === "red" ? "#f87171" : "#93c5fd";
  const dateColor = accent === "red" ? "#dc2626" : "var(--foreground-muted)";
  const hoverBg =
    accent === "red" ? "rgba(254, 242, 242, 0.7)" : "rgba(248, 250, 252, 0.95)";
  const isWaterfall = (task.projectType || "").toLowerCase() === "waterfall";
  const tab = isWaterfall ? "gantt" : "kanban";
  const href = task.projectId
    ? `/projects/${task.projectId}?tab=${tab}&highlightTaskId=${task.id}&highlightColor=${highlightColor}`
    : "#";

  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "grid",
        gridTemplateColumns: "2px 1fr auto",
        gap: "0.65rem",
        alignItems: "start",
        padding: "0.45rem 0.35rem 0.45rem 0.15rem",
        borderRadius: "6px",
        background: "transparent",
        borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span
        style={{
          width: 2,
          alignSelf: "stretch",
          borderRadius: 999,
          background: accentBar,
          marginTop: 2,
          marginBottom: 2,
          opacity: 0.85,
        }}
      />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.12rem" }}>
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--ink)",
            lineHeight: 1.35,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={task.title}
        >
          {task.title}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            minWidth: 0,
            fontSize: "0.68rem",
            color: "var(--foreground-muted)",
            lineHeight: 1.2,
          }}
        >
          <span style={{ fontWeight: 600, color: "rgba(71, 85, 105, 0.9)", flexShrink: 0 }}>
            {task.key}
          </span>
          {task.projectName ? (
            <>
              <span style={{ opacity: 0.45, flexShrink: 0 }}>·</span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={task.projectName}
              >
                {task.projectName}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <span
        style={{
          fontSize: "0.68rem",
          color: dateColor,
          fontWeight: 500,
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
          paddingTop: "0.1rem",
        }}
      >
        {task.dueDate
          ? new Date(task.dueDate).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
            })
          : "—"}
      </span>
    </Link>
  );
}

function toneFromProjectStatus(status: string): ColumnChartTone {
  const normalized = (status || "").trim().toUpperCase();
  switch (normalized) {
    case "ACTIVE":
      return "accent";
    case "PLANNING":
    case "INACTIVE": // DB value trước khi map sang PLANNING
      return "watch";
    case "AT_RISK":
      return "critical";
    case "ON_HOLD":
      return "neutral";
    case "COMPLETED":
      return "on-track";
    default:
      return "accent";
  }
}

function buildPortfolioItems(projectHealths: ProjectHealthPreview[]) {
  return [...projectHealths]
    .sort(
      (a, b) =>
        HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
        a.progress - b.progress ||
        a.name.localeCompare(b.name, "vi"),
    )
    .map((ph) => ({
      label: ph.name,
      value: ph.progress,
      tone: toneFromProjectStatus(ph.status),
      href: `/projects/${ph.id}`,
    }));
}

function toLocalDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildHoursByDay(logs: DashboardRecentLogwork[]) {
  const days: Array<{ key: string; label: string; hours: number }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toLocalDateKey(d);
    days.push({
      key,
      label: `${["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()]} ${d.getDate()}`,
      hours: 0,
    });
  }

  const index = new Map(days.map((d) => [d.key, d]));
  for (const log of logs) {
    if (!log.workDate) continue;
    const parsed = new Date(log.workDate);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = toLocalDateKey(parsed);
    const bucket = index.get(key);
    if (bucket) bucket.hours += Number(log.hours) || 0;
  }

  return days;
}

export function GlobalDashboardOverview({ overview }: GlobalDashboardOverviewProps) {
  const [isTotalProjectsModalOpen, setIsTotalProjectsModalOpen] = useState(false);
  const [isCompletedTasksModalOpen, setIsCompletedTasksModalOpen] = useState(false);
  const [isOverdueTasksModalOpen, setIsOverdueTasksModalOpen] = useState(false);
  const [logworkItems, setLogworkItems] = useState<DashboardRecentLogwork[]>([]);
  const [selectedLogwork, setSelectedLogwork] = useState<DashboardRecentLogwork | null>(null);
  const [logworkActionLoading, setLogworkActionLoading] = useState(false);
  const [logworkActionError, setLogworkActionError] = useState<string | null>(null);
  const [overdueProjectFilter, setOverdueProjectFilter] = useState("");
  const [upcomingProjectFilter, setUpcomingProjectFilter] = useState("");
  const riskSectionRef = useRef<HTMLDivElement | null>(null);

  const projectHealths = overview?.projectHealths ?? [];
  const taskSummary = overview?.taskSummary;
  const overdueTasks = overview?.overdueTasks ?? [];
  const upcomingDeadlines = overview?.upcomingDeadlines ?? [];
  const completedTasks = overview?.completedTasks ?? [];

  useEffect(() => {
    setLogworkItems(overview?.recentLogworks ?? []);
  }, [overview?.recentLogworks]);

  const portfolioItems = useMemo(
    () => buildPortfolioItems(projectHealths),
    [projectHealths],
  );
  const hoursByDay = useMemo(() => buildHoursByDay(logworkItems), [logworkItems]);

  const riskProjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of [...overdueTasks, ...upcomingDeadlines]) {
      if (task.projectId && task.projectName) {
        map.set(String(task.projectId), task.projectName);
      }
    }
    for (const project of projectHealths) {
      if (!map.has(String(project.id))) {
        map.set(String(project.id), project.name);
      }
    }
    return [
      { value: "", label: "Tất cả dự án" },
      ...Array.from(map.entries())
        .sort((a, b) => a[1].localeCompare(b[1], "vi"))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [overdueTasks, upcomingDeadlines, projectHealths]);

  const filteredOverdueTasks = useMemo(() => {
    if (!overdueProjectFilter) return overdueTasks;
    return overdueTasks.filter((task) => String(task.projectId) === overdueProjectFilter);
  }, [overdueTasks, overdueProjectFilter]);

  const filteredUpcomingDeadlines = useMemo(() => {
    if (!upcomingProjectFilter) return upcomingDeadlines;
    return upcomingDeadlines.filter((task) => String(task.projectId) === upcomingProjectFilter);
  }, [upcomingDeadlines, upcomingProjectFilter]);

  if (!overview || !taskSummary) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)" }}>
        Đang tải dữ liệu tổng quan...
      </div>
    );
  }

  const {
    totalProjects,
    activeProjects,
    completedProjects,
  } = overview;

  const totalTasks = taskSummary.total;
  const openTasks = taskSummary.todo + taskSummary.inProgress;
  const totalLoggedHours = logworkItems.reduce((sum, l) => sum + (Number(l.hours) || 0), 0);
  const uniqueLoggers = new Set(logworkItems.map((l) => l.userId)).size;
  const maxDayHours = Math.max(...hoursByDay.map((d) => d.hours), 1);

  const updateLogworkLocal = (id: string, patch: Partial<DashboardRecentLogwork>) => {
    setLogworkItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    setSelectedLogwork((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

  const handleApproveLogwork = async () => {
    if (!selectedLogwork) return;
    setLogworkActionLoading(true);
    setLogworkActionError(null);
    try {
      await logworkApi.approve(Number(selectedLogwork.id));
      updateLogworkLocal(selectedLogwork.id, { status: "APPROVED", canApprove: false });
    } catch (err) {
      setLogworkActionError(
        err instanceof Error ? err.message : "Không thể duyệt logwork",
      );
    } finally {
      setLogworkActionLoading(false);
    }
  };

  const handleRejectLogwork = async () => {
    if (!selectedLogwork) return;
    setLogworkActionLoading(true);
    setLogworkActionError(null);
    try {
      await logworkApi.reject(Number(selectedLogwork.id));
      updateLogworkLocal(selectedLogwork.id, { status: "REJECTED", canApprove: false });
    } catch (err) {
      setLogworkActionError(
        err instanceof Error ? err.message : "Không thể từ chối logwork",
      );
    } finally {
      setLogworkActionLoading(false);
    }
  };

  const logworkStatusLabel = (status?: string) => {
    const normalized = (status || "").toUpperCase();
    if (normalized === "APPROVED") return "Đã duyệt";
    if (normalized === "REJECTED") return "Từ chối";
    return "Chờ duyệt";
  };

  const logworkStatusTone = (status?: string) => {
    const normalized = (status || "").toUpperCase();
    if (normalized === "APPROVED") {
      return {
        background: "rgba(34, 197, 94, 0.15)",
        color: "#15803d",
      };
    }
    if (normalized === "REJECTED") {
      return {
        background: "rgba(239, 68, 68, 0.15)",
        color: "#b91c1c",
      };
    }
    return {
      background: "rgba(234, 179, 8, 0.15)",
      color: "#b45309",
    };
  };

  return (
    <div className="global-dash" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      {/* Row 1 — KPI */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.65rem",
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsTotalProjectsModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsTotalProjectsModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
            border: "1px solid rgba(37, 99, 235, 0.12)",
          }}
        >
          <div
            style={{
              color: "#1e3a8a",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Dự án
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#1d4ed8", lineHeight: 1.05 }}>
            {activeProjects}
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#3b82f6" }}>
              {" "}
              / {totalProjects}
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#3b82f6" }}>
            Đang chạy · {completedProjects} hoàn thành
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsCompletedTasksModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsCompletedTasksModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: "1px solid rgba(217, 119, 6, 0.18)",
          }}
        >
          <div
            style={{
              color: "#92400e",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Việc đang mở
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#78350f", lineHeight: 1.05 }}>
            {openTasks}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#b45309" }}>
            trên {totalTasks} tasks toàn hệ thống
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOverdueTasksModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsOverdueTasksModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
            border: "1px solid rgba(220, 38, 38, 0.12)",
          }}
        >
          <div
            style={{
              color: "#7f1d1d",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Quá hạn
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#b91c1c", lineHeight: 1.05 }}>
            {taskSummary.overdue}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#dc2626" }}>Cần xử lý gấp →</div>
        </div>
      </div>

      {/* Row 2 — Task mix + portfolio side by side */}
      <div
        className="global-dash-charts"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 0.9fr) minmax(0, 1.4fr)",
          gap: "0.75rem",
          minWidth: 0,
          alignItems: "stretch",
        }}
      >
        <Surface
          title="Phân bổ nhiệm vụ"
          style={{
            ...surfaceCardStyle,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 330,
          }}
        >
          <div
            className="global-dash-donut"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.25rem",
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "1.35rem",
                maxWidth: "100%",
                width: "100%",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "0 0 auto" }}>
                <DonutChart
                  segments={[
                    { value: taskSummary.todo, tone: "todo" },
                    { value: taskSummary.inProgress, tone: "progress" },
                    { value: taskSummary.done, tone: "done" },
                  ]}
                  centerLabel="Tổng"
                  centerValue={String(totalTasks)}
                />
              </div>
              <div
                style={{
                  flex: "1 1 140px",
                  maxWidth: "200px",
                  minWidth: "132px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {[
                  { label: "Cần làm", value: taskSummary.todo, color: "#eab308" },
                  { label: "Đang xử lý", value: taskSummary.inProgress, color: "#3b82f6" },
                  { label: "Hoàn thành", value: taskSummary.done, color: "#22c55e" },
                ].map((row, index, list) => {
                  const pct = totalTasks > 0 ? Math.round((row.value / totalTasks) * 100) : 0;
                  return (
                    <div
                      key={row.label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "8px 1fr auto",
                        alignItems: "center",
                        gap: "0.55rem",
                        padding: "0.45rem 0",
                        borderBottom:
                          index < list.length - 1 ? "1px solid rgba(148, 163, 184, 0.18)" : "none",
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: row.color,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--foreground-muted)",
                            fontWeight: 500,
                            lineHeight: 1.2,
                          }}
                        >
                          {row.label}
                        </div>
                        <div
                          style={{
                            fontSize: "0.68rem",
                            color: "rgba(100, 116, 139, 0.85)",
                            marginTop: "0.1rem",
                          }}
                        >
                          {pct}%
                        </div>
                      </div>
                      <strong
                        style={{
                          fontSize: "0.95rem",
                          color: "var(--ink)",
                          fontWeight: 700,
                          letterSpacing: "-0.02em",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.value}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Surface>

        <Surface
          title="Tiến độ theo dự án"
          style={{
            ...surfaceCardStyle,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 330,
          }}
          aside={
            <span style={{ fontSize: "0.68rem", color: "var(--foreground-muted)" }}>
              Cuộn ngang · màu theo trạng thái
            </span>
          }
        >
          <div
            style={{
              marginTop: "0.1rem",
              minWidth: 0,
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <ColumnChart height="100%" items={portfolioItems} />
          </div>
        </Surface>
      </div>

      {/* Row 3 — Overdue + upcoming + activity */}
      <div
        ref={riskSectionRef}
        className="global-dash-risk"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          height: 680,
          gap: "0.75rem",
          minWidth: 0,
          alignItems: "stretch",
        }}
      >
        <Surface
          title="Task quá hạn"
          style={{
            ...surfaceCardStyle,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
            gridColumn: 1,
            gridRow: 1,
          }}
          aside={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
              <CountBadge value={filteredOverdueTasks.length} tone="red" />
              <div style={{ minWidth: "150px", maxWidth: "200px", width: "min(200px, 26vw)" }}>
                <FilterSelect
                  value={overdueProjectFilter}
                  onChange={setOverdueProjectFilter}
                  options={riskProjectOptions}
                  placeholder="Tất cả dự án"
                  searchable
                  searchPlaceholder="Tìm tên dự án..."
                />
              </div>
            </div>
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "0.1rem",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              paddingRight: "0.1rem",
              overscrollBehavior: "contain",
            }}
          >
            {filteredOverdueTasks.length > 0 ? (
              filteredOverdueTasks.map((task) => (
                <TaskLinkRow
                  key={task.id}
                  task={task}
                  accent="red"
                  highlightColor="red"
                />
              ))
            ) : (
              <div
                style={{
                  padding: "1rem 0.5rem",
                  textAlign: "center",
                  color: "var(--foreground-muted)",
                  fontSize: "0.78rem",
                }}
              >
                Không có nhiệm vụ quá hạn
                {overdueProjectFilter ? " cho dự án đã chọn" : ""}
              </div>
            )}
          </div>
        </Surface>

        <Surface
          title="Task sắp tới hạn"
          style={{
            ...surfaceCardStyle,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
            gridColumn: 1,
            gridRow: 2,
          }}
          aside={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
              <CountBadge value={filteredUpcomingDeadlines.length} tone="blue" />
              <div style={{ minWidth: "150px", maxWidth: "200px", width: "min(200px, 26vw)" }}>
                <FilterSelect
                  value={upcomingProjectFilter}
                  onChange={setUpcomingProjectFilter}
                  options={riskProjectOptions}
                  placeholder="Tất cả dự án"
                  searchable
                  searchPlaceholder="Tìm tên dự án..."
                />
              </div>
            </div>
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "0.1rem",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              paddingRight: "0.1rem",
              overscrollBehavior: "contain",
            }}
          >
            {filteredUpcomingDeadlines.length > 0 ? (
              filteredUpcomingDeadlines.map((task) => (
                <TaskLinkRow
                  key={task.id}
                  task={task}
                  accent="blue"
                  highlightColor="blue"
                />
              ))
            ) : (
              <div
                style={{
                  padding: "1rem 0.5rem",
                  textAlign: "center",
                  color: "var(--foreground-muted)",
                  fontSize: "0.78rem",
                }}
              >
                Không có nhiệm vụ sắp tới hạn trong 7 ngày
                {upcomingProjectFilter ? " cho dự án đã chọn" : ""}
              </div>
            )}
          </div>
        </Surface>

        <Surface
          title="Hoạt động gần đây"
          style={{
            ...surfaceCardStyle,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
            gridColumn: 2,
            gridRow: "1 / -1",
          }}
          aside={
            <span style={{ fontSize: "0.72rem", color: "var(--foreground-muted)" }}>
              7 ngày gần nhất
            </span>
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              marginTop: "0.1rem",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.55rem",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  background: "rgba(37,99,235,0.06)",
                  border: "1px solid rgba(37,99,235,0.1)",
                }}
              >
                <div style={{ fontSize: "0.7rem", color: "#1e40af", fontWeight: 600 }}>
                  Giờ đã log
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#1d4ed8", marginTop: "0.1rem" }}>
                  {totalLoggedHours.toFixed(1)}h
                </div>
              </div>
              <div
                style={{
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  background: "rgba(15,23,42,0.04)",
                  border: "1px solid rgba(148,163,184,0.18)",
                }}
              >
                <div style={{ fontSize: "0.7rem", color: "#475569", fontWeight: 600 }}>
                  Người log
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", marginTop: "0.1rem" }}>
                  {uniqueLoggers}
                </div>
              </div>
            </div>

            <div style={{ flexShrink: 0 }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--foreground-muted)",
                  marginBottom: "0.4rem",
                }}
              >
                Tổng giờ theo ngày
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "0.45rem",
                  height: "168px",
                  paddingBottom: "0.2rem",
                  borderBottom: "1px solid rgba(148,163,184,0.2)",
                }}
              >
                {hoursByDay.map((day) => {
                  const h = Math.max(day.hours > 0 ? 14 : 4, (day.hours / maxDayHours) * 128);
                  return (
                    <div
                      key={day.key}
                      title={`${day.label}: ${day.hours.toFixed(1)}h`}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.25rem",
                        minWidth: 0,
                        height: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span style={{ fontSize: "0.68rem", color: "var(--foreground-muted)", lineHeight: 1, fontWeight: 600 }}>
                        {day.hours > 0 ? day.hours.toFixed(0) : ""}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          maxWidth: "36px",
                          height: `${h}px`,
                          borderRadius: "6px 6px 0 0",
                          background: day.hours > 0 ? "#3b82f6" : "rgba(148,163,184,0.25)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.68rem",
                          color: "var(--foreground-muted)",
                          textAlign: "center",
                          lineHeight: 1.1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "100%",
                        }}
                      >
                        {day.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--foreground-muted)",
                  marginBottom: "0.4rem",
                  flexShrink: 0,
                }}
              >
                Nhật ký logwork
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  paddingRight: "0.15rem",
                  overscrollBehavior: "contain",
                }}
              >
                {logworkItems.length > 0 ? (
                  logworkItems.map((log) => (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => {
                        setLogworkActionError(null);
                        setSelectedLogwork(log);
                      }}
                      style={{
                        textAlign: "left",
                        width: "100%",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: "0.55rem",
                        alignItems: "center",
                        padding: "0.5rem 0.65rem",
                        borderRadius: "8px",
                        border: "1px solid rgba(148,163,184,0.18)",
                        background: "rgba(248,250,252,0.9)",
                      }}
                    >
                      <div
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "999px",
                          background: "rgba(37,99,235,0.12)",
                          color: "#1d4ed8",
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                        title={log.userName}
                      >
                        {log.userName
                          .split(" ")
                          .filter(Boolean)
                          .slice(-2)
                          .map((p) => p[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: "var(--ink)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={log.taskTitle}
                        >
                          {log.taskTitle}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--foreground-muted)", marginTop: "0.1rem" }}>
                          {log.userName} · {log.taskKey}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#1d4ed8",
                            background: "rgba(37,99,235,0.1)",
                            borderRadius: "999px",
                            padding: "0.15rem 0.5rem",
                          }}
                        >
                          {log.hours}h
                        </div>
                        <div style={{ fontSize: "0.65rem", color: "var(--foreground-muted)", marginTop: "0.15rem" }}>
                          {log.workDate
                            ? new Date(log.workDate).toLocaleDateString("vi-VN", {
                                day: "2-digit",
                                month: "2-digit",
                              })
                            : ""}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div
                    style={{
                      padding: "0.75rem",
                      textAlign: "center",
                      color: "var(--foreground-muted)",
                      fontSize: "0.82rem",
                    }}
                  >
                    Chưa có logwork gần đây
                  </div>
                )}
              </div>
            </div>
          </div>
        </Surface>
      </div>

      {isTotalProjectsModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={() => setIsTotalProjectsModalOpen(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "1.5rem",
                borderBottom: "1px solid rgba(148,163,184,0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Danh sách dự án</h3>
              <button
                type="button"
                onClick={() => setIsTotalProjectsModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                }}
              >
                &times;
              </button>
            </div>
            <div
              style={{
                padding: "1rem",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {projectHealths.map((ph) => (
                <Link
                  key={ph.id}
                  href={`/projects/${ph.id}`}
                  onClick={() => setIsTotalProjectsModalOpen(false)}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    padding: "0.85rem 1rem",
                    border: "1px solid rgba(148,163,184,0.2)",
                    borderRadius: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{ph.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
                      {ph.code} · {ph.status} · {ph.totalTasks} tasks
                      {(ph.overdueCount ?? 0) > 0 ? ` · ${ph.overdueCount} quá hạn` : ""}
                    </div>
                  </div>
                  <strong>{ph.progress}%</strong>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {isOverdueTasksModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={() => setIsOverdueTasksModalOpen(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "1.5rem",
                borderBottom: "1px solid rgba(148,163,184,0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#b91c1c" }}>
                Nhiệm vụ quá hạn ({overdueTasks.length})
              </h3>
              <button
                type="button"
                onClick={() => setIsOverdueTasksModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                }}
              >
                &times;
              </button>
            </div>
            <div
              style={{
                padding: "1rem",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {overdueTasks.length > 0 ? (
                overdueTasks.map((task) => (
                  <TaskLinkRow
                    key={task.id}
                    task={task}
                    accent="red"
                    highlightColor="red"
                  />
                ))
              ) : (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--foreground-muted)",
                  }}
                >
                  Không có nhiệm vụ quá hạn
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isCompletedTasksModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={() => setIsCompletedTasksModalOpen(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "1.5rem",
                borderBottom: "1px solid rgba(148,163,184,0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
                Nhiệm vụ hoàn thành gần đây
              </h3>
              <button
                type="button"
                onClick={() => setIsCompletedTasksModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                }}
              >
                &times;
              </button>
            </div>
            <div
              style={{
                padding: "1rem",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {completedTasks.length > 0 ? (
                completedTasks.map((task) => (
                  <TaskLinkRow
                    key={task.id}
                    task={task}
                    accent="blue"
                    highlightColor="green"
                  />
                ))
              ) : (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--foreground-muted)",
                  }}
                >
                  Chưa có nhiệm vụ hoàn thành
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedLogwork && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: "1.5rem",
          }}
          onClick={() => {
            if (!logworkActionLoading) setSelectedLogwork(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logwork-detail-title"
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              width: "100%",
              maxWidth: "960px",
              maxHeight: "88vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 40px -16px rgba(15, 23, 42, 0.28)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "1.75rem 2rem 0.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--foreground-muted)",
                    marginBottom: "0.35rem",
                  }}
                >
                  {selectedLogwork.taskKey}
                  {selectedLogwork.projectName ? ` · ${selectedLogwork.projectName}` : ""}
                </div>
                <h3
                  id="logwork-detail-title"
                  style={{
                    margin: 0,
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    color: "var(--ink)",
                    lineHeight: 1.35,
                  }}
                >
                  {selectedLogwork.taskTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!logworkActionLoading) setSelectedLogwork(null);
                }}
                aria-label="Đóng"
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.6rem",
                  cursor: "pointer",
                  lineHeight: 1,
                  color: "var(--foreground-muted)",
                  padding: "0.15rem 0.35rem",
                  flexShrink: 0,
                }}
              >
                &times;
              </button>
            </div>

            <div
              style={{
                padding: "1.25rem 2rem 1.75rem",
                overflowY: "auto",
                flex: 1,
              }}
            >
              <article
                style={{
                  padding: "1.35rem 1.5rem",
                  borderRadius: "14px",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1.25rem",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display: "block",
                        marginBottom: "0.2rem",
                        fontSize: "1.05rem",
                        color: "var(--ink)",
                      }}
                    >
                      {selectedLogwork.userName}
                    </strong>
                    <span style={{ color: "var(--foreground-muted)", fontSize: "0.9rem" }}>
                      Ngày logwork: {formatDate(selectedLogwork.workDate)}
                    </span>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: "0.35rem",
                    }}
                  >
                    <strong style={{ fontSize: "1.15rem" }}>{selectedLogwork.hours}h</strong>
                    <span
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        padding: "0.2rem 0.6rem",
                        borderRadius: "999px",
                        ...logworkStatusTone(selectedLogwork.status),
                      }}
                    >
                      {logworkStatusLabel(selectedLogwork.status)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                    color: "var(--ink)",
                    fontSize: "1rem",
                  }}
                >
                  {selectedLogwork.note || "Không có mô tả công việc."}
                </div>

                {selectedLogwork.progressPercent != null ? (
                  <div style={{ fontSize: "0.9rem", color: "var(--foreground-muted)" }}>
                    Tiến độ báo cáo:{" "}
                    <strong style={{ color: "var(--ink)" }}>
                      {selectedLogwork.progressPercent}%
                    </strong>
                  </div>
                ) : null}
              </article>

              {logworkActionError ? (
                <div
                  style={{
                    marginTop: "1rem",
                    color: "#b91c1c",
                    fontSize: "0.875rem",
                  }}
                >
                  {logworkActionError}
                </div>
              ) : null}
            </div>

            <div
              style={{
                padding: "1rem 2rem 1.5rem",
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.65rem",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                disabled={logworkActionLoading}
                onClick={() => setSelectedLogwork(null)}
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  background: "#fff",
                  borderRadius: "12px",
                  padding: "0.7rem 1.2rem",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                Đóng
              </button>
              {selectedLogwork.status === "PENDING" && selectedLogwork.canApprove ? (
                <>
                  <button
                    type="button"
                    disabled={logworkActionLoading}
                    onClick={() => void handleRejectLogwork()}
                    style={{
                      border: "1px solid rgba(185, 28, 28, 0.28)",
                      background: "#fff",
                      color: "#b91c1c",
                      borderRadius: "12px",
                      padding: "0.7rem 1.2rem",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      cursor: logworkActionLoading ? "wait" : "pointer",
                    }}
                  >
                    {logworkActionLoading ? "Đang xử lý..." : "Từ chối"}
                  </button>
                  <button
                    type="button"
                    disabled={logworkActionLoading}
                    onClick={() => void handleApproveLogwork()}
                    style={{
                      border: "none",
                      background: "#16a34a",
                      color: "#fff",
                      borderRadius: "12px",
                      padding: "0.7rem 1.35rem",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      boxShadow: "0 8px 18px -8px rgba(22, 163, 74, 0.55)",
                      cursor: logworkActionLoading ? "wait" : "pointer",
                    }}
                  >
                    {logworkActionLoading ? "Đang xử lý..." : "Duyệt"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
