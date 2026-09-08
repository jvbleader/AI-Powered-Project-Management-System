import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  differenceInDays,
  generateDateRange,
  formatAssigneeNames,
  taskPriorityLabel,
  taskStatusLabel,
} from "@/lib/utils/format";
import type { EnrichedTask, UserProfile } from "@/types";
import styles from "../styles/gantt.module.css";

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
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px' }}>
      {level !== "critical" ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
          <div style={{ width: '3px', height: '6px', borderRadius: '1px', backgroundColor: activeBars[0] ? color : '#e2e8f0' }} />
          <div style={{ width: '3px', height: '10px', borderRadius: '1px', backgroundColor: activeBars[1] ? color : '#e2e8f0' }} />
          <div style={{ width: '3px', height: '14px', borderRadius: '1px', backgroundColor: activeBars[2] ? color : '#e2e8f0' }} />
        </div>
      ) : (
        <svg style={{ color: '#e11d48' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
      )}
    </div>
  );
}

interface GanttChartProps {
  tasks: EnrichedTask[];
  onTaskClick?: (taskId: string) => void;
  onAddSubtask?: (parentId: string) => void;
}

interface WbsNode {
  task: EnrichedTask;
  children: WbsNode[];
  level: number;
}

const MIN_NAME_COL_WIDTH = 140;
const DEFAULT_NAME_COL_WIDTH = 220;
const MAX_NAME_COL_WIDTH = 400;
const STATUS_COL_WIDTH = 180;
const PRIORITY_COL_WIDTH = 150;
const DEFAULT_ASSIGNEE_COL_WIDTH = 180;
const START_COL_WIDTH = 120;
const END_COL_WIDTH = 120;
const ET_COL_WIDTH = 110;
const DAY_COLUMN_WIDTH = 18;

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

export function GanttChart({ tasks, onTaskClick, onAddSubtask }: GanttChartProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams.get("highlightTaskId");
  const highlightColor = searchParams.get("highlightColor") || "yellow";
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(highlightTaskId);
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>(highlightColor || "yellow");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [nameColWidth, setNameColWidth] = useState(DEFAULT_NAME_COL_WIDTH);
  const [assigneeColWidth, setAssigneeColWidth] = useState(DEFAULT_ASSIGNEE_COL_WIDTH);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [tooltipData, setTooltipData] = useState<{
    task: EnrichedTask;
    isEpic: boolean;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (highlightTaskId) {
      setActiveHighlightId(highlightTaskId);
      setActiveHighlightColor(highlightColor || "yellow");
    }
  }, [highlightTaskId, highlightColor]);

  useEffect(() => {
    const handleCustomHighlight = (
      e: CustomEvent<{ taskId: string | number; projectId?: string | number }>,
    ) => {
      if (e.detail?.taskId) {
        setActiveHighlightId(String(e.detail.taskId));
        setActiveHighlightColor("yellow");
      }
    };
    window.addEventListener("flowpilot-highlight-task", handleCustomHighlight as EventListener);
    return () => {
      window.removeEventListener("flowpilot-highlight-task", handleCustomHighlight as EventListener);
    };
  }, []);

  const handleMouseMoveTooltip = useCallback((e: React.MouseEvent, task: EnrichedTask, isEpic: boolean) => {
    setTooltipData({ task, isEpic, x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseLeaveTooltip = useCallback(() => {
    setTooltipData(null);
  }, []);
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const didInitTodayScroll = useRef(false);

  const fixedPaneWidth = STATUS_COL_WIDTH + PRIORITY_COL_WIDTH + assigneeColWidth + START_COL_WIDTH + ET_COL_WIDTH;
  const leftPaneWidth = nameColWidth + fixedPaneWidth;

  const clampNameColWidth = useCallback((width: number) => {
    let max = MAX_NAME_COL_WIDTH;
    const pane = leftPaneRef.current;
    if (pane) {
      max = Math.min(max, Math.floor(pane.clientWidth * 0.65));
    }
    return Math.min(max, Math.max(MIN_NAME_COL_WIDTH, Math.round(width)));
  }, []);

  // ── Resize handlers ────────────────────────────────────────────────────────
  const onResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const delta = e.clientX - dragState.current.startX;
    setNameColWidth(clampNameColWidth(dragState.current.startWidth + delta));
  }, [clampNameColWidth]);

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

  const onResizeDblClick = useCallback(() => {
    setNameColWidth(DEFAULT_NAME_COL_WIDTH);
  }, []);

  const rootNodes = useMemo(() => {
    const taskMap = new Map<string, WbsNode>();
    const roots: WbsNode[] = [];

    tasks.forEach((task) => {
      taskMap.set(task.id, { task: { ...task }, children: [], level: 0 });
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

    function collectLeafAssignees(n: WbsNode): UserProfile[] {
      if (n.children.length === 0) {
        if (n.task.assignees && n.task.assignees.length > 0) return n.task.assignees;
        if (n.task.assignee) return [n.task.assignee];
        if (n.task.assigneeName) {
          return [{
            id: String(n.task.id) + "-assignee",
            name: n.task.assigneeName,
            email: "",
            role: "MEMBER",
            title: "",
            initials: n.task.assigneeName.slice(0, 2).toUpperCase(),
            presence: "offline",
          } as UserProfile];
        }
        return [];
      }
      const list: UserProfile[] = [];
      n.children.forEach((c) => {
        list.push(...collectLeafAssignees(c));
      });
      return list;
    }

    function setLevelsAndDates(nodes: WbsNode[], currentLevel: number) {
      nodes.forEach((node) => {
        node.level = currentLevel;
        setLevelsAndDates(node.children, currentLevel + 1);

        if (node.children.length > 0) {
          let minStart = Infinity;
          let maxEnd = -Infinity;

          node.children.forEach((child) => {
            const start = child.task.startDate ? new Date(child.task.startDate).getTime() : Infinity;
            const end = child.task.dueDate
              ? new Date(child.task.dueDate).getTime()
              : child.task.startDate
                ? new Date(child.task.startDate).getTime()
                : -Infinity;

            if (start !== Infinity && start < minStart) minStart = start;
            if (end !== -Infinity && end > maxEnd) maxEnd = end;
          });

          if (minStart !== Infinity) {
            node.task.startDate = new Date(minStart).toISOString();
          }
          if (maxEnd !== -Infinity) {
            node.task.dueDate = new Date(maxEnd).toISOString();
          }

          const sumEstimate = node.children.reduce((acc, c) => acc + (c.task.estimateHours || 0), 0);
          const sumSpent = node.children.reduce((acc, c) => acc + (c.task.spentHours || 0), 0);
          if (sumEstimate > 0) {
            node.task.estimateHours = sumEstimate;
          }
          node.task.spentHours = sumSpent;

          const leafAssignees = collectLeafAssignees(node);
          const seen = new Set<string>();
          const uniqueAssignees = leafAssignees.filter((a) => {
            const key = String(a.id || a.name || "");
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (uniqueAssignees.length > 0) {
            node.task.assignees = uniqueAssignees;
            node.task.assignee = uniqueAssignees[0];
            node.task.assigneeName = uniqueAssignees.map((a) => a.name).filter(Boolean).join(", ");
          }
        }
      });

      nodes.sort((a, b) => {
        const startA = a.task.startDate ? new Date(a.task.startDate).getTime() : Infinity;
        const startB = b.task.startDate ? new Date(b.task.startDate).getTime() : Infinity;
        return startB - startA;
      });
    }
    setLevelsAndDates(roots, 0);
    return roots;
  }, [tasks]);

  const { dates, minDateStr, months } = useMemo(() => {
    if (tasks.length === 0) {
      return { dates: [], minDateStr: "", months: [] };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    let min = today.getTime() - 90 * dayMs;
    let max = today.getTime() + 180 * dayMs;

    tasks.forEach((task) => {
      const start = task.startDate ? new Date(task.startDate).getTime() : NaN;
      const end = task.dueDate ? new Date(task.dueDate).getTime() : (isNaN(start) ? NaN : start);

      if (!isNaN(start) && start < min) min = start;
      if (!isNaN(end) && end > max) max = end;
    });

    const minDate = new Date(min);
    minDate.setDate(minDate.getDate() - 7);
    const maxDate = new Date(max);
    maxDate.setDate(maxDate.getDate() + 14);

    const minDateStr = minDate.toISOString().split("T")[0];
    const maxDateStr = maxDate.toISOString().split("T")[0];

    const dates = generateDateRange(minDateStr, maxDateStr);

    // Group by month
    const monthsMap = new Map<string, number>();
    dates.forEach(d => {
      const key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      monthsMap.set(key, (monthsMap.get(key) || 0) + 1);
    });

    const months = Array.from(monthsMap.entries()).map(([name, days]) => ({ name, days }));

    return { dates, minDateStr, months };
  }, [tasks]);
  const timelineWidth = dates.length * DAY_COLUMN_WIDTH;

  // Today line: pixel offset from the left of the timeline pane
  const todayOffset = useMemo(() => {
    if (!minDateStr) return null;
    const diff = differenceInDays(minDateStr, todayStr);
    if (diff < 0 || diff >= dates.length) return null;
    return diff * DAY_COLUMN_WIDTH + DAY_COLUMN_WIDTH / 2;
  }, [minDateStr, todayStr, dates.length]);

  const onLeftScroll = useCallback(() => {
    if (syncingScroll.current || !leftPaneRef.current || !rightPaneRef.current) return;
    syncingScroll.current = true;
    rightPaneRef.current.scrollTop = leftPaneRef.current.scrollTop;
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }, []);

  const onRightScroll = useCallback(() => {
    if (syncingScroll.current || !leftPaneRef.current || !rightPaneRef.current) return;
    syncingScroll.current = true;
    leftPaneRef.current.scrollTop = rightPaneRef.current.scrollTop;
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }, []);

  useEffect(() => {
    didInitTodayScroll.current = false;
  }, [minDateStr, todayStr, dates.length]);

  useEffect(() => {
    if (didInitTodayScroll.current || todayOffset == null) return;
    const frame = requestAnimationFrame(() => {
      if (!rightPaneRef.current) return;
      // Trừ đi 50px để đường "Hôm nay" không bị sát vào mép trái màn hình
      rightPaneRef.current.scrollLeft = Math.max(0, todayOffset - 50);
      didInitTodayScroll.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [todayOffset, timelineWidth]);

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

  const renderTree = (nodes: WbsNode[], pane: "left" | "right"): React.ReactNode => {
    return nodes.map((node) => {
      const isExpanded = expanded[node.task.id] !== false;
      const hasChildren = node.children.length > 0;
      const isRoot = node.level === 0;

      const effectiveDueDate = node.task.dueDate || node.task.startDate;
      const startCol = differenceInDays(minDateStr, node.task.startDate) + 1;
      const endCol = differenceInDays(minDateStr, effectiveDueDate) + 2;
      const priorityPresentation = getPriorityPresentation(node.task.priority);

      let circleClass = styles.circleYellow;
      const stateText = taskStatusLabel(node.task.status);
      if (node.task.status === "DONE") {
        circleClass = styles.circleGreen;
      } else if (node.task.status === "IN_PROGRESS") {
        circleClass = styles.circleBlue;
      }

      const isHovered = hoveredTaskId === node.task.id;
      const isHighlighted =
        Boolean(activeHighlightId) &&
        (String(node.task.id) === String(activeHighlightId) ||
          `task-${node.task.id}` === String(activeHighlightId) ||
          String(node.task.id).replace(/^task-/, "") === String(activeHighlightId).replace(/^task-/, ""));
      const highlightClass = isHighlighted
        ? activeHighlightColor === "red"
          ? styles.flashHighlightRed
          : activeHighlightColor === "yellow"
            ? styles.flashHighlightYellow
            : activeHighlightColor === "green"
              ? styles.flashHighlightGreen
              : styles.flashHighlightBlue
        : "";
      const rowClass = `${styles.ganttRow} ${isRoot ? styles.ganttRowRoot : ""} ${isHovered ? styles.ganttRowHovered : ""} ${highlightClass}`;

      // Triangle icon
      const ToggleIcon = isExpanded ? (
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
      );

      // Task icon by level
      const taskIcon = (() => {
        switch (node.level) {
          case 0:
            return (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" style={{ color: "#0047B3", flexShrink: 0 }}>
                <title>Epic</title>
                <polygon points="12 2 22 12 12 22 2 12 12 2" />
              </svg>
            );
          case 1:
            return (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2684FF", flexShrink: 0 }}>
                <title>Task</title>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            );
          case 2:
            return (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#36B37E", flexShrink: 0 }}>
                <title>Subtask</title>
                <polyline points="15 10 20 15 15 20" />
                <path d="M4 4v7a4 4 0 0 0 4 4h12" />
              </svg>
            );
          default:
            return (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8993A4", flexShrink: 0 }}>
                <title>Sub-subtask</title>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            );
        }
      })();

      return (
        <React.Fragment key={`${pane}-${node.task.id}`}>
          <div
            id={pane === "left" ? `gantt-row-${node.task.id}` : undefined}
            className={rowClass}
            style={{ position: "relative", width: pane === "right" ? timelineWidth : undefined }}
            onMouseEnter={() => setHoveredTaskId(node.task.id)}
            onMouseLeave={() => setHoveredTaskId((current) => (current === node.task.id ? null : current))}
          >
            {pane === "left" ? (
              <>
                <div className={`${styles.ganttLeftCol} ${styles.stickyCol}`} style={{ width: `${nameColWidth}px`, minWidth: `${nameColWidth}px`, maxWidth: `${nameColWidth}px` }} onClick={() => handleRowClick(node.task.id)}>
                  <div style={{ width: `${node.level * 28}px`, flexShrink: 0 }} />
                  {hasChildren ? (
                    <button className={styles.expandBtn} onClick={(e) => toggleExpand(node.task.id, e)}>
                      {ToggleIcon}
                    </button>
                  ) : (
                    <span className={styles.expandPlaceholder} />
                  )}
                  <span className={styles.taskIcon}>{taskIcon}</span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                <div className={styles.ganttLeftCol} style={{ width: `${STATUS_COL_WIDTH}px`, minWidth: `${STATUS_COL_WIDTH}px` }} onClick={() => handleRowClick(node.task.id)}>
                  <div className={styles.statusIndicator}>
                    <div className={`${styles.statusCircle} ${circleClass}`} />
                    <span className={styles.statusText}>{stateText}</span>
                  </div>
                </div>
                <div
                  className={`${styles.ganttLeftCol} ${styles.priorityCol}`}
                  style={{ width: `${PRIORITY_COL_WIDTH}px`, minWidth: `${PRIORITY_COL_WIDTH}px` }}
                  onClick={() => handleRowClick(node.task.id)}
                >
                  <div className={styles.priorityIndicatorWrapper}>
                    {priorityPresentation.icon}
                    <span className={priorityPresentation.textClass}>
                      {priorityPresentation.label}
                    </span>
                  </div>
                </div>
                <div className={styles.ganttLeftCol} style={{ width: `${assigneeColWidth}px`, minWidth: `${assigneeColWidth}px`, maxWidth: `${assigneeColWidth}px` }} onClick={() => handleRowClick(node.task.id)}>
                  <span className={styles.ganttMetaText} title={formatAssigneeNames(node.task)}>
                    {formatAssigneeNames(node.task)}
                  </span>
                </div>
                <div className={styles.ganttLeftCol} style={{ width: `${START_COL_WIDTH}px`, minWidth: `${START_COL_WIDTH}px`, flexDirection: "column", justifyContent: "center", alignItems: "flex-start", gap: "2px" }} onClick={() => handleRowClick(node.task.id)}>
                  <span className={styles.ganttMetaText}>
                    {new Date(node.task.startDate).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                  <span className={styles.ganttMetaText} style={{ fontSize: "0.85em", color: "var(--foreground-muted)" }}>
                    {new Date(effectiveDueDate).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                </div>
                <div className={styles.ganttLeftCol} style={{ width: `${ET_COL_WIDTH}px`, minWidth: `${ET_COL_WIDTH}px` }} onClick={() => handleRowClick(node.task.id)}>
                  <span className={styles.ganttMetaText} style={{ fontWeight: 500 }}>
                    {node.task.spentHours || 0}h / {node.task.estimateHours || 0}h
                  </span>
                </div>
              </>
            ) : (
              <div
                className={styles.ganttRightCell}
                style={{
                  width: `${timelineWidth}px`,
                  minWidth: `${timelineWidth}px`,
                  gridTemplateColumns: `repeat(${dates.length}, ${DAY_COLUMN_WIDTH}px)`,
                  cursor: "pointer",
                }}
                onClick={() => handleRowClick(node.task.id)}
              >
                {(() => {
                  const isLeaf = !hasChildren;
                  const isEpic = hasChildren && isRoot;
                  const isIntermediateParent = hasChildren && !isRoot;
                  const safeStartCol = Number.isFinite(startCol) ? Math.max(1, startCol) : 1;
                  const safeEndCol = Number.isFinite(endCol)
                    ? Math.max(safeStartCol + 1, endCol)
                    : safeStartCol + 1;

                  if (isEpic) {
                    return (
                      <div
                        style={{
                          gridColumnStart: safeStartCol,
                          gridColumnEnd: safeEndCol,
                          position: "relative",
                          marginTop: "12px",
                        }}
                        onMouseMove={(e) => handleMouseMoveTooltip(e, node.task, true)}
                        onMouseLeave={handleMouseLeaveTooltip}
                      >
                        <div style={{ height: "8px", background: "#1a365d", width: "100%", borderTopLeftRadius: "2px", borderTopRightRadius: "2px" }} />
                        <div style={{ position: "absolute", left: 0, top: "8px", width: 0, height: 0, borderTop: "8px solid #1a365d", borderRight: "6px solid transparent" }} />
                        <div style={{ position: "absolute", right: 0, top: "8px", width: 0, height: 0, borderTop: "8px solid #1a365d", borderLeft: "6px solid transparent" }} />
                      </div>
                    );
                  }

                  if (isIntermediateParent) {
                    return null;
                  }

                  if (isLeaf) {
                    const progressPct = Math.min(
                      100,
                      Math.round(((node.task.spentHours || 0) / (node.task.estimateHours || 1)) * 100),
                    );
                    const hasEstimate = (node.task.estimateHours || 0) > 0;

                    return (
                      <div
                        className={`${styles.ganttBar} ${priorityPresentation.barClass}`}
                        style={{
                          gridColumnStart: safeStartCol,
                          gridColumnEnd: safeEndCol,
                        }}
                        onMouseMove={(e) => handleMouseMoveTooltip(e, node.task, false)}
                        onMouseLeave={handleMouseLeaveTooltip}
                      >
                        <div className={styles.ganttBarInner}>
                          {hasEstimate && (
                            <div
                              className={`${styles.ganttBarProgress} ${progressPct >= 100
                                  ? styles.ganttBarProgressComplete
                                  : styles.ganttBarProgressPartial
                                }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          )}
                          <div className={styles.ganttBarLabel}>{node.task.title}</div>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            )}
          </div>
          {isExpanded && hasChildren && renderTree(node.children, pane)}
        </React.Fragment>
      );
    });
  };

  useEffect(() => {
    if (!activeHighlightId || tasks.length === 0) return;

    const normalizedHighlightId = activeHighlightId.startsWith("task-")
      ? activeHighlightId
      : `task-${activeHighlightId}`;
    const rawHighlightId = activeHighlightId.replace(/^task-/, "");

    // Find the target task to expand all its parent ancestors
    const targetTask = tasks.find(
      (t) =>
        String(t.id) === String(activeHighlightId) ||
        String(t.id) === normalizedHighlightId ||
        String(t.id) === rawHighlightId,
    );

    if (targetTask) {
      const toExpand: Record<string, boolean> = {};
      let currentParentId: string | null | undefined = targetTask.parentTaskId;

      while (currentParentId) {
        toExpand[currentParentId] = true;
        toExpand[`task-${currentParentId}`] = true;
        toExpand[String(currentParentId).replace(/^task-/, "")] = true;

        const parentTask = tasks.find(
          (t) =>
            String(t.id) === String(currentParentId) ||
            String(t.id) === `task-${currentParentId}` ||
            String(t.id) === String(currentParentId).replace(/^task-/, ""),
        );
        currentParentId = parentTask?.parentTaskId;
      }

      if (Object.keys(toExpand).length > 0) {
        setExpanded((prev) => ({ ...prev, ...toExpand }));
      }
    }
  }, [activeHighlightId, tasks]);

  useEffect(() => {
    if (activeHighlightId) {
      const normalizedHighlightId = activeHighlightId.startsWith("task-")
        ? activeHighlightId
        : `task-${activeHighlightId}`;
      const rawHighlightId = activeHighlightId.replace(/^task-/, "");

      const scrollTimer = setTimeout(() => {
        const el =
          document.getElementById(`gantt-row-${activeHighlightId}`) ||
          document.getElementById(`gantt-row-${normalizedHighlightId}`) ||
          document.getElementById(`gantt-row-${rawHighlightId}`);

        const leftPane = leftPaneRef.current;
        if (el && leftPane) {
          const elRect = el.getBoundingClientRect();
          const paneRect = leftPane.getBoundingClientRect();
          leftPane.scrollTop +=
            elRect.top - paneRect.top - paneRect.height / 2 + elRect.height / 2;
          if (rightPaneRef.current) {
            rightPaneRef.current.scrollTop = leftPane.scrollTop;
          }
        }
      }, 350);

      const timer = setTimeout(() => {
        setActiveHighlightId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("highlightTaskId");
        url.searchParams.delete("highlightColor");
        window.history.replaceState({}, "", url.pathname + url.search);
      }, 5000);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(timer);
      };
    }
  }, [activeHighlightId, expanded]);

  if (tasks.length === 0) {
    return (
      <div className={styles.ganttContainer} style={{ padding: "2rem", textAlign: "center" }}>
        Chưa có nhiệm vụ nào.
      </div>
    );
  }

  return (
    <div className={styles.ganttContainer} style={{ flex: 1, width: "100%", height: "100%" }}>
      <div
        ref={leftPaneRef}
        className={styles.ganttLeftPane}
        onScroll={onLeftScroll}
      >
        <div className={styles.ganttPaneInner} style={{ width: `${leftPaneWidth}px`, minWidth: `${leftPaneWidth}px` }}>
          <div className={styles.ganttHeaderRow}>
            <div className={`${styles.ganttLeftHeaderCell} ${styles.stickyCol}`} style={{ width: `${nameColWidth}px`, minWidth: `${nameColWidth}px`, maxWidth: `${nameColWidth}px` }}>
              Tên công việc
              <div
                className={styles.colResizeHandle}
                onMouseDown={onResizeMouseDown}
                onDoubleClick={onResizeDblClick}
                title="Kéo để thay đổi kích thước (140–400px). Double-click để đặt lại mặc định."
              />
            </div>
            <div className={styles.ganttLeftHeaderCell} style={{ width: `${STATUS_COL_WIDTH}px`, minWidth: `${STATUS_COL_WIDTH}px` }}>Trạng thái</div>
            <div className={styles.ganttLeftHeaderCell} style={{ width: `${PRIORITY_COL_WIDTH}px`, minWidth: `${PRIORITY_COL_WIDTH}px` }}>Cấp thiết</div>
            <div className={styles.ganttLeftHeaderCell} style={{ width: `${assigneeColWidth}px`, minWidth: `${assigneeColWidth}px`, maxWidth: `${assigneeColWidth}px` }}>Người thực hiện</div>
            <div className={styles.ganttLeftHeaderCell} style={{ width: `${START_COL_WIDTH}px`, minWidth: `${START_COL_WIDTH}px`, flexDirection: "column", justifyContent: "center", alignItems: "flex-start", lineHeight: 1.4 }}>
              <span>Bắt đầu</span>
              <span>Kết thúc</span>
            </div>
            <div className={styles.ganttLeftHeaderCell} style={{ width: `${ET_COL_WIDTH}px`, minWidth: `${ET_COL_WIDTH}px` }}>AT/ET</div>
          </div>
          {renderTree(rootNodes, "left")}
        </div>
      </div>

      <div
        ref={rightPaneRef}
        className={styles.ganttRightPane}
        onScroll={onRightScroll}
      >
        <div className={styles.ganttPaneInner} style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px`, position: "relative" }}>
          <div className={styles.ganttHeaderRow}>
            <div
              className={styles.ganttRightHeader}
              style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }}
            >
              <div className={styles.ganttRightHeaderTop}>
                {months.map((m, i) => (
                  <div key={i} className={styles.ganttMonthHeader} style={{ width: `${m.days * DAY_COLUMN_WIDTH}px` }}>
                    {m.name}
                  </div>
                ))}
              </div>
              <div className={styles.ganttRightHeaderBottom} style={{ gridTemplateColumns: `repeat(${dates.length}, ${DAY_COLUMN_WIDTH}px)` }}>
                {dates.map((date, i) => {
                  const dateKey = date.toISOString().split("T")[0];
                  const isMonday = date.getDay() === 1;
                  const isToday = dateKey === todayStr;
                  return (
                    <div
                      key={i}
                      className={`${styles.ganttDayHeader} ${isToday ? styles.ganttDayHeaderToday : ""}`}
                    >
                      {isMonday || isToday ? date.getDate() : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {todayOffset !== null && (
            <div
              className={styles.todayPin}
              style={{ marginLeft: `${todayOffset}px` }}
              title={`Hôm nay: ${new Date().toLocaleDateString("vi-VN")}`}
            >
              <span className={styles.todayLabel}>Hôm nay</span>
            </div>
          )}

          <div style={{ position: "relative" }}>
            <div
              className={styles.ganttGridLines}
              style={{
                width: `${timelineWidth}px`,
                gridTemplateColumns: `repeat(${dates.length}, ${DAY_COLUMN_WIDTH}px)`,
              }}
            >
              {dates.map((date, i) => (
                <div key={i} className={styles.ganttGridLine} />
              ))}
            </div>

            {todayOffset !== null && (
              <div
                className={styles.todayLine}
                style={{ left: `${todayOffset}px` }}
                title={`Hôm nay: ${new Date().toLocaleDateString("vi-VN")}`}
              />
            )}

            {renderTree(rootNodes, "right")}
          </div>
        </div>
      </div>

      {/* Global Fixed Tooltip */}
      {tooltipData && (
        <div
          className={styles.globalTooltip}
          style={{
            left: tooltipData.x,
            top: tooltipData.y,
          }}
        >
          {tooltipData.isEpic ? (
            <>
              <div><strong>[Epic] {tooltipData.task.title}</strong></div>
              <div style={{ marginTop: "4px" }}>Người thực hiện: {formatAssigneeNames(tooltipData.task)}</div>
              <div>Bắt đầu: {new Date(tooltipData.task.startDate).toLocaleDateString("vi-VN")}</div>
              <div>Kết thúc: {new Date(tooltipData.task.dueDate || tooltipData.task.startDate).toLocaleDateString("vi-VN")}</div>
              <div>Trạng thái: {taskStatusLabel(tooltipData.task.status)}</div>
            </>
          ) : (
            <>
              <div><strong>{tooltipData.task.title}</strong></div>
              <div style={{ marginTop: "4px" }}>Người thực hiện: {formatAssigneeNames(tooltipData.task)}</div>
              <div>Bắt đầu: {new Date(tooltipData.task.startDate).toLocaleDateString("vi-VN")}</div>
              <div>Kết thúc: {new Date(tooltipData.task.dueDate || tooltipData.task.startDate).toLocaleDateString("vi-VN")}</div>
              <div>Trạng thái: {taskStatusLabel(tooltipData.task.status)}</div>
              <div>Mức độ cấp thiết: {taskPriorityLabel(tooltipData.task.priority)}</div>
              <div>Tiến độ: {tooltipData.task.spentHours || 0}h / {tooltipData.task.estimateHours || 0}h</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
