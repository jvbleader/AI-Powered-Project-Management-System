"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  taskPriorityLabel,
  taskStatusLabel,
  toVietnamDateInputValue,
  toWorkflowTaskStatus,
} from "@/lib/utils/format";
import type { EnrichedTask } from "@/types";
import { LoadingState } from "@/components/loading-state";
import styles from "../styles/gantt.module.css";
import {
  GanttPersonCell,
  HeaderDateFilter,
  HeaderMultiFilter,
  HeaderTextFilter,
} from "./gantt-column-filters";
import {
  assignOverlapLanes,
  buildTimeline,
  dateToX,
  GANTT_SCALES,
  ganttScaleLabel,
  intervalToX,
  normalizeGanttScale,
  startOfDay,
  toIsoDate,
  type GanttScale,
} from "./gantt-scale";

const UNASSIGNED = "__unassigned__";
const TODAY_LINE_OFFSET = 10;
const MIN_BAR_LABEL_WIDTH = 40;

function FolderIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function TaskGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SignalIcon({ level }: { level: "low" | "medium" | "high" | "critical" }) {
  const bars = {
    low: [true, false, false],
    medium: [true, true, false],
    high: [true, true, true],
    critical: [true, true, true],
  };
  const activeBars = bars[level];
  const color = level === "critical" ? "#e11d48" : level === "high" ? "#d97706" : level === "medium" ? "#059669" : "#2563eb";

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "14px" }}>
      <div style={{ width: "3px", height: "6px", borderRadius: "1px", backgroundColor: activeBars[0] ? color : "#e2e8f0" }} />
      <div style={{ width: "3px", height: "10px", borderRadius: "1px", backgroundColor: activeBars[1] ? color : "#e2e8f0" }} />
      <div style={{ width: "3px", height: "14px", borderRadius: "1px", backgroundColor: activeBars[2] ? color : "#e2e8f0" }} />
    </div>
  );
}

interface GanttChartProps {
  tasks: EnrichedTask[];
  onTaskClick?: (taskId: string) => void;
  onAddSubtask?: (parentId: string) => void;
  isLoading?: boolean;
}

interface WbsNode {
  task: EnrichedTask;
  children: WbsNode[];
  level: number;
}

const MIN_NAME_COL_WIDTH = 160;
const DEFAULT_NAME_COL_WIDTH = 420;
const STATUS_COL_WIDTH = 180;
const PRIORITY_COL_WIDTH = 150;
const DEFAULT_ASSIGNEE_COL_WIDTH = 220;
const START_COL_WIDTH = 132;
const END_COL_WIDTH = 132;
const ET_COL_WIDTH = 168;
const BASE_ROW_HEIGHT = 42;
const LANE_HEIGHT = 22;
const PACKED_LANE_TOP = 24;

function collectLeaves(node: WbsNode): WbsNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectLeaves);
}

function intervalMs(task: EnrichedTask) {
  const start = startOfDay(task.startDate).getTime();
  const endExclusive = startOfDay(task.dueDate || task.startDate).getTime() + 24 * 60 * 60 * 1000;
  return { start, end: endExclusive };
}

function dateKey(value: string | undefined | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return toVietnamDateInputValue(parsed);
}

function etPercent(task: EnrichedTask) {
  const estimate = task.estimateHours || 0;
  if (estimate <= 0) return 0;
  return Math.min(100, Math.round(((task.spentHours || 0) / estimate) * 100));
}

function etToneClass(status: EnrichedTask["status"]) {
  const workflow = toWorkflowTaskStatus(status);
  if (workflow === "DONE") return styles.etBarDone;
  if (workflow === "IN_PROGRESS") return styles.etBarProgress;
  return styles.etBarTodo;
}

function assigneeKey(task: EnrichedTask) {
  return task.assignee?.id || task.assigneeId || UNASSIGNED;
}

function statusPillClass(status: EnrichedTask["status"]) {
  const workflow = toWorkflowTaskStatus(status);
  if (workflow === "DONE") return styles.ganttStatusDone;
  if (workflow === "IN_PROGRESS") return styles.ganttStatusProgress;
  return styles.ganttStatusTodo;
}

function priorityPillClass(priority: EnrichedTask["priority"]) {
  switch (priority) {
    case "LOW":
      return styles.priorityLow;
    case "HIGH":
      return styles.priorityHigh;
    case "CRITICAL":
      return styles.priorityCritical;
    case "MEDIUM":
    default:
      return styles.priorityMedium;
  }
}

function getPriorityPresentation(priority: EnrichedTask["priority"]) {
  switch (priority) {
    case "LOW":
      return {
        label: taskPriorityLabel(priority),
        icon: <SignalIcon level="low" />,
        textClass: styles.textPriorityLow,
        barClass: styles.ganttBarLow,
      };
    case "HIGH":
      return {
        label: taskPriorityLabel(priority),
        icon: <SignalIcon level="high" />,
        textClass: styles.textPriorityHigh,
        barClass: styles.ganttBarHigh,
      };
    case "CRITICAL":
      return {
        label: taskPriorityLabel(priority),
        icon: <SignalIcon level="critical" />,
        textClass: styles.textPriorityCritical,
        barClass: styles.ganttBarCritical,
      };
    case "MEDIUM":
    default:
      return {
        label: taskPriorityLabel(priority),
        icon: <SignalIcon level="medium" />,
        textClass: styles.textPriorityMedium,
        barClass: styles.ganttBarMedium,
      };
  }
}

function GanttTaskTooltip({
  task,
  x,
  y,
}: {
  task: EnrichedTask;
  x: number;
  y: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 14, top: y + 14 });
  const spent = task.spentHours || 0;
  const estimate = task.estimateHours || 0;
  const pct = etPercent(task);
  const due = task.dueDate || task.startDate;
  const priority = getPriorityPresentation(task.priority);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let left = x + 14;
    let top = y + 14;
    if (left + rect.width > window.innerWidth - margin) {
      left = x - rect.width - 14;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = y - rect.height - 14;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    setPos({ left, top });
  }, [task.id, x, y]);

  return createPortal(
    <div ref={ref} className={styles.ganttTooltip} style={{ left: pos.left, top: pos.top }}>
      <p className={styles.ganttTooltipTitle}>{task.title}</p>
      <dl>
        <div className={styles.ganttTooltipRow}>
          <dt>Trạng thái</dt>
          <dd>{taskStatusLabel(task.status)}</dd>
        </div>
        <div className={styles.ganttTooltipRow}>
          <dt>Ưu tiên</dt>
          <dd>{priority.label}</dd>
        </div>
        <div className={styles.ganttTooltipRow}>
          <dt>Người thực hiện</dt>
          <dd>{task.assignee?.name || "Chưa giao"}</dd>
        </div>
        <div className={styles.ganttTooltipRow}>
          <dt>Thời gian</dt>
          <dd>
            {new Date(task.startDate).toLocaleDateString("vi-VN")} – {new Date(due).toLocaleDateString("vi-VN")}
          </dd>
        </div>
        <div className={styles.ganttTooltipRow}>
          <dt>Tiến độ</dt>
          <dd>
            {pct}% · {spent}h / {estimate}h
          </dd>
        </div>
      </dl>
      <div className={styles.etCell} style={{ marginTop: 6 }}>
        <div className={styles.etBarTrack}>
          <div className={`${styles.etBarFill} ${etToneClass(task.status)}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function GanttChart({ tasks, onTaskClick, onAddSubtask, isLoading = false }: GanttChartProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams.get("highlightTaskId");
  const highlightColor = searchParams.get("highlightColor") || "blue";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [nameColWidth, setNameColWidth] = useState(DEFAULT_NAME_COL_WIDTH);
  const [assigneeColWidth, setAssigneeColWidth] = useState(DEFAULT_ASSIGNEE_COL_WIDTH);
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [tooltip, setTooltip] = useState<{ task: EnrichedTask; x: number; y: number } | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scale, setScale] = useState<GanttScale>("day");
  const activeScale = normalizeGanttScale(scale);
  const scaleRef = useRef<GanttScale>(activeScale);

  const fixedPaneWidth = STATUS_COL_WIDTH + PRIORITY_COL_WIDTH + assigneeColWidth + START_COL_WIDTH + END_COL_WIDTH + ET_COL_WIDTH;
  const leftPaneWidth = nameColWidth + fixedPaneWidth;

  const onResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const delta = e.clientX - dragState.current.startX;
    setNameColWidth(Math.max(MIN_NAME_COL_WIDTH, dragState.current.startWidth + delta));
  }, []);

  const onResizeMouseUp = useCallback(() => {
    dragState.current = null;
    document.removeEventListener("mousemove", onResizeMouseMove);
    document.removeEventListener("mouseup", onResizeMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onResizeMouseMove]);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: nameColWidth };
    document.addEventListener("mousemove", onResizeMouseMove);
    document.addEventListener("mouseup", onResizeMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [nameColWidth, onResizeMouseMove, onResizeMouseUp]);

  const measureColumns = useCallback((currentTasks: EnrichedTask[]) => {
    if (currentTasks.length === 0) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bodyFont = getComputedStyle(document.body).fontFamily || "sans-serif";
    ctx.font = `13px ${bodyFont}`;

    let maxNameWidth = DEFAULT_NAME_COL_WIDTH;
    let maxAssigneeWidth = DEFAULT_ASSIGNEE_COL_WIDTH;

    const getLevel = (taskId: string, tasksMap: Map<string, EnrichedTask>): number => {
      let level = 0;
      let curr = tasksMap.get(taskId);
      while (curr && curr.parentTaskId) {
        level++;
        curr = tasksMap.get(curr.parentTaskId);
      }
      return level;
    };

    const map = new Map(currentTasks.map((t) => [t.id, t]));

    currentTasks.forEach((task) => {
      const level = getLevel(task.id, map);
      const indent = level * 24;
      const iconWidth = 30;
      ctx.font = `13px ${bodyFont}`;
      const measuredName = ctx.measureText(task.title).width + indent + iconWidth + 40;
      if (measuredName > maxNameWidth) maxNameWidth = measuredName;

      const assigneeName = task.assignee?.name || "Chưa giao";
      const assigneeCode = task.assignee?.employeeCode || "";
      ctx.font = `13px ${bodyFont}`;
      const nameWidth = ctx.measureText(assigneeName).width;
      ctx.font = `11px ${bodyFont}`;
      const codeWidth = assigneeCode ? ctx.measureText(assigneeCode).width : 0;
      const measuredAssignee = Math.max(nameWidth, codeWidth) + 22 + 8 + 36;
      if (measuredAssignee > maxAssigneeWidth) maxAssigneeWidth = measuredAssignee;
    });

    setNameColWidth(Math.ceil(maxNameWidth));
    setAssigneeColWidth(Math.ceil(maxAssigneeWidth));
  }, []);

  useEffect(() => {
    measureColumns(tasks);
  }, [tasks, measureColumns]);

  const onResizeDblClick = useCallback(() => {
    measureColumns(tasks);
  }, [tasks, measureColumns]);

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(tasks.map((task) => toWorkflowTaskStatus(task.status)))).map((status) => ({
        value: status,
        label: taskStatusLabel(status),
      })),
    [tasks],
  );

  const priorityOptions = useMemo(
    () =>
      Array.from(new Set(tasks.map((task) => task.priority))).map((priority) => ({
        value: priority,
        label: taskPriorityLabel(priority),
      })),
    [tasks],
  );

  const assigneeOptions = useMemo(() => {
    const seen = new Map<string, { label: string; person?: { name: string; employeeCode?: string; userId?: string; email?: string; avatarUrl?: string } | null }>();
    tasks.forEach((task) => {
      const key = assigneeKey(task);
      if (!seen.has(key)) {
        const assignee = task.assignee;
        seen.set(key, {
          label: assignee?.name || "Chưa giao",
          person: assignee?.id
            ? {
                name: assignee.name,
                employeeCode: assignee.employeeCode,
                userId: assignee.id,
                email: assignee.email,
                avatarUrl: assignee.avatarUrl,
              }
            : null,
        });
      }
    });
    return Array.from(seen.entries())
      .map(([value, item]) => ({ value, label: item.label, person: item.person }))
      .sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [tasks]);

  const rootNodes = useMemo(() => {
    const taskMap = new Map<string, WbsNode>();
    const roots: WbsNode[] = [];

    tasks.forEach((task) => {
      taskMap.set(task.id, { task, children: [], level: 0 });
    });

    tasks.forEach((task) => {
      const node = taskMap.get(task.id);
      if (node) {
        if (task.parentTaskId && taskMap.has(task.parentTaskId)) {
          taskMap.get(task.parentTaskId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    function setLevels(nodes: WbsNode[], currentLevel: number) {
      nodes.forEach((node) => {
        node.level = currentLevel;
        setLevels(node.children, currentLevel + 1);
      });
    }
    setLevels(roots, 0);
    return roots;
  }, [tasks]);

  const filtersActive =
    nameQuery.trim().length > 0 ||
    statusFilter.length > 0 ||
    priorityFilter.length > 0 ||
    assigneeFilter.length > 0 ||
    Boolean(startDateFilter || endDateFilter);

  const clearAllFilters = useCallback(() => {
    setNameQuery("");
    setStatusFilter([]);
    setPriorityFilter([]);
    setAssigneeFilter([]);
    setStartDateFilter("");
    setEndDateFilter("");
    setOpenFilter(null);
  }, []);

  const taskMatches = useCallback(
    (task: EnrichedTask) => {
      if (nameQuery.trim() && !task.title.toLowerCase().includes(nameQuery.trim().toLowerCase())) {
        return false;
      }
      if (statusFilter.length > 0 && !statusFilter.includes(toWorkflowTaskStatus(task.status))) {
        return false;
      }
      if (priorityFilter.length > 0 && !priorityFilter.includes(task.priority)) {
        return false;
      }
      if (assigneeFilter.length > 0 && !assigneeFilter.includes(assigneeKey(task))) {
        return false;
      }
      if (startDateFilter && dateKey(task.startDate) !== startDateFilter) {
        return false;
      }
      if (endDateFilter && dateKey(task.dueDate) !== endDateFilter) {
        return false;
      }
      return true;
    },
    [assigneeFilter, endDateFilter, nameQuery, priorityFilter, startDateFilter, statusFilter],
  );

  const filteredNodes = useMemo(() => {
    function filterTree(nodes: WbsNode[]): WbsNode[] {
      const next: WbsNode[] = [];
      nodes.forEach((node) => {
        const children = filterTree(node.children);
        if (taskMatches(node.task) || children.length > 0) {
          next.push({ ...node, children });
        }
      });
      return next;
    }
    return filtersActive ? filterTree(rootNodes) : rootNodes;
  }, [filtersActive, rootNodes, taskMatches]);

  const visibleRows = useMemo(() => {
    const rows: WbsNode[] = [];
    function walk(nodes: WbsNode[]) {
      nodes.forEach((node) => {
        rows.push(node);
        const isExpanded = filtersActive || expanded[node.task.id] !== false;
        if (isExpanded && node.children.length > 0) {
          walk(node.children);
        }
      });
    }
    walk(filteredNodes);
    return rows;
  }, [expanded, filteredNodes, filtersActive]);

  const overlapLayout = useMemo(() => {
    const heights = new Map<string, number>();
    const packed = new Map<string, Array<{ node: WbsNode; lane: number }>>();

    visibleRows.forEach((node) => {
      const isExpanded = filtersActive || expanded[node.task.id] !== false;
      if (node.children.length > 0 && !isExpanded) {
        const leaves = collectLeaves(node);
        const { lanes, laneCount } = assignOverlapLanes(leaves.map((leaf) => intervalMs(leaf.task)));
        packed.set(
          node.task.id,
          leaves.map((leaf, index) => ({ node: leaf, lane: lanes[index] })),
        );
        heights.set(node.task.id, Math.max(BASE_ROW_HEIGHT, PACKED_LANE_TOP + laneCount * LANE_HEIGHT + 8));
        return;
      }
      heights.set(node.task.id, BASE_ROW_HEIGHT);
    });

    return { heights, packed };
  }, [expanded, filtersActive, visibleRows]);

  const timeline = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    tasks.forEach((task) => {
      const start = task.startDate ? new Date(task.startDate).getTime() : NaN;
      const end = task.dueDate ? new Date(task.dueDate).getTime() : (isNaN(start) ? NaN : start);
      if (!isNaN(start) && start < min) min = start;
      if (!isNaN(end) && end > max) max = end;
    });

    if (min === Infinity || max === -Infinity) {
      min = Date.now();
      max = Date.now();
    }

    const minDate = new Date(min);
    minDate.setDate(minDate.getDate() - 15);
    const maxDate = new Date(max);
    if (activeScale === "month") {
      maxDate.setMonth(maxDate.getMonth() + 6);
    } else if (activeScale === "week") {
      maxDate.setDate(maxDate.getDate() + 90);
    } else {
      maxDate.setDate(maxDate.getDate() + 180);
    }

    return buildTimeline(toIsoDate(minDate), toIsoDate(maxDate), activeScale);
  }, [activeScale, tasks]);

  const todayOffset = useMemo(() => {
    if (!timeline.columns.length) return null;
    const x = dateToX(todayStr, timeline);
    if (x < 0 || x > timeline.width) return null;
    return x + TODAY_LINE_OFFSET;
  }, [timeline, todayStr]);

  const scrollTodayIntoView = useCallback((smooth = false) => {
    const pane = rightPaneRef.current;
    if (!pane || todayOffset === null) return;
    const viewportWidth = pane.clientWidth;
    if (viewportWidth <= 0) return;
    const maxScroll = Math.max(0, pane.scrollWidth - viewportWidth);
    const next = Math.max(0, Math.min(maxScroll, todayOffset - viewportWidth / 2));
    if (smooth) {
      pane.scrollTo({ left: next, behavior: "smooth" });
      return;
    }
    pane.scrollLeft = next;
  }, [todayOffset]);

  useLayoutEffect(() => {
    const scaleChanged = scaleRef.current !== activeScale;
    scaleRef.current = activeScale;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) scrollTodayIntoView(scaleChanged);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [activeScale, scrollTodayIntoView, timeline.width, tasks.length]);

  useEffect(() => {
    if (isLoading) return;
    const pane = rightPaneRef.current;
    if (!pane) return;

    const observer = new ResizeObserver(() => {
      scrollTodayIntoView();
    });
    observer.observe(pane);
    window.addEventListener("resize", scrollTodayIntoView);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scrollTodayIntoView);
    };
  }, [isLoading, scrollTodayIntoView]);

  const toggleExpand = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({
      ...prev,
      [taskId]: prev[taskId] === undefined ? false : !prev[taskId],
    }));
  };

  const handleRowClick = (taskId: string) => {
    if (onTaskClick) {
      onTaskClick(taskId);
    } else {
      router.push(`/tasks?taskId=${taskId}`);
    }
  };

  const showTooltip = (task: EnrichedTask, event: React.MouseEvent) => {
    setTooltip({ task, x: event.clientX, y: event.clientY });
  };

  const onRowEnter = useCallback((taskId: string) => {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current);
      hoverLeaveTimer.current = null;
    }
    setHoveredRowId(String(taskId));
  }, []);

  const onRowLeave = useCallback((taskId: string) => {
    hoverLeaveTimer.current = setTimeout(() => {
      setHoveredRowId((current) => (current === String(taskId) ? null : current));
    }, 60);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (highlightTaskId) {
      setTimeout(() => {
        const pane = leftPaneRef.current;
        const el = document.getElementById(`gantt-row-${highlightTaskId}`);
        if (pane && el) {
          const paneRect = pane.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const delta = elRect.top - paneRect.top - pane.clientHeight / 2 + elRect.height / 2;
          pane.scrollTo({ top: pane.scrollTop + delta, behavior: "smooth" });
        }
      }, 500);

      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("highlightTaskId");
        url.searchParams.delete("highlightColor");
        window.history.replaceState({}, "", url.pathname + url.search);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [highlightTaskId, expanded]);

  if (isLoading) {
    return <LoadingState variant="gantt" />;
  }

  if (tasks.length === 0) {
    return (
      <div className={styles.ganttContainer} style={{ padding: "2rem", textAlign: "center" }}>
        Chưa có nhiệm vụ nào.
      </div>
    );
  }

  const renderLeftRow = (node: WbsNode) => {
    const isExpanded = filtersActive || expanded[node.task.id] !== false;
    const hasChildren = node.children.length > 0;
    const isRoot = node.level === 0;
    const effectiveDueDate = node.task.dueDate || node.task.startDate;
    const priorityPresentation = getPriorityPresentation(node.task.priority);
    const spent = node.task.spentHours || 0;
    const estimate = node.task.estimateHours || 0;
    const pct = etPercent(node.task);
    const isHovered = String(hoveredRowId) === String(node.task.id);

    let circleClass = styles.circleYellow;
    const stateText = taskStatusLabel(node.task.status);
    if (node.task.status === "DONE") {
      circleClass = styles.circleGreen;
    } else if (node.task.status === "IN_PROGRESS") {
      circleClass = styles.circleBlue;
    }

    return (
      <div
        key={node.task.id}
        id={`gantt-row-${node.task.id}`}
        className={`${styles.ganttRow} ${isRoot ? styles.ganttRowRoot : styles.ganttRowChild} ${node.level >= 2 ? styles.ganttRowNested : ""} ${isHovered ? styles.ganttRowHovered : ""} ${String(node.task.id) === String(highlightTaskId) ? (highlightColor === "red" ? styles.flashHighlightRed : highlightColor === "green" ? styles.flashHighlightGreen : styles.flashHighlightBlue) : ""}`}
        style={{ height: overlapLayout.heights.get(node.task.id) ?? BASE_ROW_HEIGHT }}
        data-gantt-row={node.task.id}
        onMouseEnter={() => onRowEnter(node.task.id)}
        onMouseLeave={() => onRowLeave(node.task.id)}
      >
        <div className={styles.ganttLeftCell} style={{ width: `${leftPaneWidth}px` }} onClick={() => handleRowClick(node.task.id)}>
          <div className={styles.ganttLeftCol} style={{ width: `${nameColWidth}px` }}>
            {node.level > 0 ? (
              <div style={{ width: `${node.level * 28}px`, flexShrink: 0 }} />
            ) : null}
            {hasChildren ? (
              <button
                type="button"
                className={`${styles.taskTypeIcon} ${styles.taskTypeFolder}`}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Thu gọn công việc con" : "Mở rộng công việc con"}
                onClick={(e) => toggleExpand(node.task.id, e)}
              >
                <FolderIcon open={isExpanded} />
              </button>
            ) : (
              <span className={`${styles.taskTypeIcon} ${styles.taskTypeLeaf}`}>
                <TaskGlyph />
              </span>
            )}
            <span className={styles.taskName}>
              {node.task.title}
            </span>
            {onAddSubtask ? (
              <button
                type="button"
                className={styles.expandBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  onAddSubtask(node.task.id);
                }}
                title="Tạo subtask"
                style={{ marginLeft: "auto" }}
              >
                +
              </button>
            ) : null}
          </div>
          <div className={styles.ganttLeftCol} style={{ width: `${ET_COL_WIDTH}px` }}>
            <div className={styles.etCell}>
              <div className={styles.etBarTrack}>
                <div className={`${styles.etBarFill} ${etToneClass(node.task.status)}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.ganttMetaText} style={{ fontWeight: 500 }}>
                {spent}h / {estimate}h
              </span>
            </div>
          </div>
          <div className={`${styles.ganttLeftCol} ${styles.ganttAssigneeCol}`} style={{ width: `${assigneeColWidth}px` }}>
            <GanttPersonCell
              person={
                node.task.assignee?.id
                  ? {
                      name: node.task.assignee.name,
                      employeeCode: node.task.assignee.employeeCode,
                      userId: node.task.assignee.id,
                      email: node.task.assignee.email,
                      avatarUrl: node.task.assignee.avatarUrl,
                    }
                  : null
              }
            />
          </div>
          <div className={`${styles.ganttLeftCol} ${styles.priorityCol}`} style={{ width: `${PRIORITY_COL_WIDTH}px` }}>
            <span className={`${styles.priorityBadge} ${priorityPillClass(node.task.priority)}`}>
              {priorityPresentation.icon}
              {priorityPresentation.label}
            </span>
          </div>
          <div className={styles.ganttLeftCol} style={{ width: `${START_COL_WIDTH}px` }}>
            <span className={styles.ganttMetaText}>
              {new Date(node.task.startDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>
          <div className={styles.ganttLeftCol} style={{ width: `${END_COL_WIDTH}px` }}>
            <span className={styles.ganttMetaText}>
              {new Date(effectiveDueDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>
          <div className={styles.ganttLeftCol} style={{ width: `${STATUS_COL_WIDTH}px` }}>
            <span className={`${styles.ganttStatusPill} ${statusPillClass(node.task.status)}`}>
              <span className={`${styles.statusCircle} ${circleClass}`} />
              <span className={styles.statusText}>{stateText}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderRightRow = (node: WbsNode) => {
    const hasChildren = node.children.length > 0;
    const isRoot = node.level === 0;
    const isExpanded = filtersActive || expanded[node.task.id] !== false;
    const effectiveDueDate = node.task.dueDate || node.task.startDate;
    const priorityPresentation = getPriorityPresentation(node.task.priority);
    const isLeaf = !hasChildren;
    const packed = !isExpanded ? overlapLayout.packed.get(node.task.id) : undefined;
    const rowHeight = overlapLayout.heights.get(node.task.id) ?? BASE_ROW_HEIGHT;
    const geometry = intervalToX(node.task.startDate, effectiveDueDate, timeline);
    const showSummaryBar = hasChildren;
    const isHovered = String(hoveredRowId) === String(node.task.id);

    return (
      <div
        key={node.task.id}
        className={`${styles.ganttRow} ${isRoot ? styles.ganttRowRoot : styles.ganttRowChild} ${node.level >= 2 ? styles.ganttRowNested : ""} ${isHovered ? styles.ganttRowHovered : ""}`}
        style={{ height: rowHeight }}
        data-gantt-row={node.task.id}
        onMouseEnter={() => onRowEnter(node.task.id)}
        onMouseLeave={() => onRowLeave(node.task.id)}
      >
        <div
          className={styles.ganttRightCell}
          style={{
            width: `${timeline.width}px`,
            minWidth: `${timeline.width}px`,
            cursor: "pointer",
          }}
          onClick={() => handleRowClick(node.task.id)}
        >
          {showSummaryBar ? (
            <div
              className={styles.ganttEpicBar}
              style={{
                left: geometry.left,
                width: geometry.width,
                top: 6,
              }}
              onMouseEnter={(event) => showTooltip(node.task, event)}
              onMouseMove={(event) => showTooltip(node.task, event)}
              onMouseLeave={() => setTooltip(null)}
            >
              <div className={styles.ganttEpicCap} data-side="left" />
              <div className={styles.ganttEpicCap} data-side="right" />
            </div>
          ) : null}

          {packed
            ? packed.map(({ node: child, lane }) => {
                const childDue = child.task.dueDate || child.task.startDate;
                const childGeo = intervalToX(child.task.startDate, childDue, timeline);
                const childPriority = getPriorityPresentation(child.task.priority);
                const top = PACKED_LANE_TOP + lane * LANE_HEIGHT;
                return (
                  <div
                    key={child.task.id}
                    className={`${styles.ganttBar} ${childPriority.barClass}`}
                    style={{ left: childGeo.left, width: childGeo.width, top }}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRowClick(child.task.id);
                    }}
                    onMouseEnter={(event) => {
                      showTooltip(child.task, event);
                    }}
                    onMouseMove={(event) => showTooltip(child.task, event)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {childGeo.width >= MIN_BAR_LABEL_WIDTH ? (
                      <span className={styles.ganttBarLabel}>{child.task.title}</span>
                    ) : null}
                  </div>
                );
              })
            : null}

          {isLeaf ? (
            <>
              <div
                className={`${styles.ganttBar} ${priorityPresentation.barClass}`}
                style={{
                  left: geometry.left,
                  width: geometry.width,
                  top: 12,
                }}
                onMouseEnter={(event) => {
                  showTooltip(node.task, event);
                }}
                onMouseMove={(event) => showTooltip(node.task, event)}
                onMouseLeave={() => setTooltip(null)}
              >
                {geometry.width >= MIN_BAR_LABEL_WIDTH ? (
                  <span className={styles.ganttBarLabel}>{node.task.title}</span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.ganttContainer} style={{ flex: 1, width: "100%", height: "100%" }}>
      <div className={styles.ganttChrome}>
        <div className={styles.ganttChromeLeft}>
          {filtersActive ? (
            <button
              type="button"
              className={styles.ganttClearFilters}
              onClick={clearAllFilters}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M13.013 3H2l8 9.06v7L18 21v-8.94l1.627-1.838" />
                <path d="m16 16 5 5" />
                <path d="m21 16-5 5" />
              </svg>
              Xóa tất cả bộ lọc
            </button>
          ) : null}
        </div>
        <div
          className={styles.ganttChromeRight}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.ganttHeaderControls}>
            <div className={styles.ganttScaleToggle} role="group" aria-label="Chế độ xem thời gian">
              {GANTT_SCALES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${styles.ganttScaleButton} ${activeScale === item ? styles.ganttScaleButtonActive : ""}`}
                  aria-pressed={activeScale === item}
                  onClick={() => setScale(item)}
                >
                  {ganttScaleLabel(item)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.ganttTodayBtn}
              title="Về hôm nay"
              onClick={() => scrollTodayIntoView(true)}
            >
              <span className={styles.ganttTodayDot} aria-hidden />
              Hôm nay
            </button>
          </div>
        </div>
      </div>
      <div className={styles.ganttSplit}>
        <div className={styles.ganttLeftPane}>
          <div className={styles.ganttLeftScroll} ref={leftPaneRef}>
          <div className={styles.ganttLeftInner} style={{ width: leftPaneWidth }}>
            <div className={styles.ganttLeftHeader} style={{ width: leftPaneWidth }}>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${nameColWidth}px`, position: "relative" }}>
                <span className={styles.ganttHeaderLabel}>Tên công việc</span>
                <HeaderTextFilter
                  filterKey="name"
                  openKey={openFilter}
                  onOpenKeyChange={setOpenFilter}
                  title="Tìm tên công việc"
                  label="Tìm tên công việc"
                  value={nameQuery}
                  onChange={setNameQuery}
                  placeholder="Tìm tên công việc..."
                  icon="search"
                />
                <div
                  className={styles.colResizeHandle}
                  onMouseDown={onResizeMouseDown}
                  onDoubleClick={onResizeDblClick}
                  title="Kéo để thay đổi kích thước. Double-click để tự khớp."
                />
              </div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${ET_COL_WIDTH}px` }}>
                <span className={styles.ganttHeaderLabel}>Tiến độ</span>
              </div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${assigneeColWidth}px` }}>
                <span className={styles.ganttHeaderLabel}>Người thực hiện</span>
                <HeaderMultiFilter
                  filterKey="assignee"
                  openKey={openFilter}
                  onOpenKeyChange={setOpenFilter}
                  title="Lọc theo người thực hiện"
                  label="Lọc người thực hiện"
                  options={assigneeOptions}
                  value={assigneeFilter}
                  onChange={setAssigneeFilter}
                  searchable
                  searchPlaceholder="Tìm người thực hiện..."
                  minWidth={280}
                />
              </div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${PRIORITY_COL_WIDTH}px` }}>
                <span className={styles.ganttHeaderLabel}>Ưu tiên</span>
                <HeaderMultiFilter
                  filterKey="priority"
                  openKey={openFilter}
                  onOpenKeyChange={setOpenFilter}
                  title="Lọc theo ưu tiên"
                  label="Lọc ưu tiên"
                  options={priorityOptions}
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                />
              </div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${START_COL_WIDTH}px` }}>
                <span className={styles.ganttHeaderLabel}>Bắt đầu</span>
                <HeaderDateFilter
                  filterKey="start"
                  openKey={openFilter}
                  onOpenKeyChange={setOpenFilter}
                  title="Lọc theo ngày bắt đầu"
                  label="Lọc ngày bắt đầu"
                  value={startDateFilter}
                  onChange={setStartDateFilter}
                />
              </div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${END_COL_WIDTH}px` }}>
                <span className={styles.ganttHeaderLabel}>Kết thúc</span>
                <HeaderDateFilter
                  filterKey="end"
                  openKey={openFilter}
                  onOpenKeyChange={setOpenFilter}
                  title="Lọc theo ngày kết thúc"
                  label="Lọc ngày kết thúc"
                  value={endDateFilter}
                  onChange={setEndDateFilter}
                />
              </div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${STATUS_COL_WIDTH}px` }}>
                <span className={styles.ganttHeaderLabel}>Trạng thái</span>
                <HeaderMultiFilter
                  filterKey="status"
                  openKey={openFilter}
                  onOpenKeyChange={setOpenFilter}
                  title="Lọc theo trạng thái"
                  label="Lọc trạng thái"
                  options={statusOptions}
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
              </div>
            </div>

            <div className={styles.ganttBody}>
              {visibleRows.length === 0 ? (
                <div className={styles.ganttEmptyFilter}>Không có công việc phù hợp bộ lọc.</div>
              ) : (
                visibleRows.map(renderLeftRow)
              )}
            </div>
          </div>
          </div>
        </div>

        <div className={styles.ganttRightPane}>
          <div className={styles.ganttRightScroll} ref={rightPaneRef}>
          <div className={styles.ganttRightInner} style={{ width: timeline.width, minWidth: timeline.width }}>
            <div
              className={styles.ganttRightHeader}
              style={{ width: `${timeline.width}px`, minWidth: `${timeline.width}px` }}
            >
              <div className={styles.ganttRightHeaderTop}>
                {timeline.bands.map((band, i) => (
                  <div key={`${band.label}-${i}`} className={styles.ganttMonthHeader} style={{ left: band.offset, width: band.width }}>
                    {band.label}
                  </div>
                ))}
              </div>
              <div className={styles.ganttRightHeaderBottom}>
                {timeline.columns.map((column, i) => (
                  <div
                    key={i}
                    className={styles.ganttDayHeader}
                    style={{ left: column.offset, width: column.width }}
                    title={column.title}
                  >
                    {column.label}
                  </div>
                ))}
              </div>
            </div>

            {todayOffset !== null ? (
              <div className={styles.todayLine} style={{ left: todayOffset }} />
            ) : null}

            <div className={styles.ganttBody}>
              <div className={styles.ganttBodyRows}>
                <div className={styles.ganttGridLines} style={{ width: `${timeline.width}px` }}>
                  {timeline.columns.map((column, i) => (
                    <div key={i} className={styles.ganttGridLine} style={{ left: column.offset }} />
                  ))}
                </div>
                {visibleRows.map(renderRightRow)}
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {tooltip ? <GanttTaskTooltip task={tooltip.task} x={tooltip.x} y={tooltip.y} /> : null}
    </div>
  );
}
