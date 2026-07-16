import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  differenceInDays,
  generateDateRange,
  taskPriorityLabel,
  taskStatusLabel,
} from "@/lib/utils/format";
import type { EnrichedTask } from "@/types";
import styles from "../styles/gantt.module.css";

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

const MIN_NAME_COL_WIDTH = 160;
const DEFAULT_NAME_COL_WIDTH = 340;
const STATUS_COL_WIDTH = 130;
const PRIORITY_COL_WIDTH = 140;
const ASSIGNEE_COL_WIDTH = 140;
const START_COL_WIDTH = 110;
const END_COL_WIDTH = 110;
const ET_COL_WIDTH = 100;
const DAY_COLUMN_WIDTH = 18;
const FIXED_PANE_WIDTH =
  STATUS_COL_WIDTH +
  PRIORITY_COL_WIDTH +
  ASSIGNEE_COL_WIDTH +
  START_COL_WIDTH +
  END_COL_WIDTH +
  ET_COL_WIDTH;

function getPriorityPresentation(priority: EnrichedTask["priority"]) {
  switch (priority) {
    case "LOW":
      return {
        label: taskPriorityLabel(priority),
        badgeClass: styles.priorityLow,
        barClass: styles.ganttBarLow,
      };
    case "HIGH":
      return {
        label: taskPriorityLabel(priority),
        badgeClass: styles.priorityHigh,
        barClass: styles.ganttBarHigh,
      };
    case "CRITICAL":
      return {
        label: taskPriorityLabel(priority),
        badgeClass: styles.priorityCritical,
        barClass: styles.ganttBarCritical,
      };
    case "MEDIUM":
    default:
      return {
        label: taskPriorityLabel(priority),
        badgeClass: styles.priorityMedium,
        barClass: styles.ganttBarMedium,
      };
  }
}

export function GanttChart({ tasks, onTaskClick, onAddSubtask }: GanttChartProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams.get("highlightTaskId");
  const highlightColor = searchParams.get("highlightColor") || "blue";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [nameColWidth, setNameColWidth] = useState(DEFAULT_NAME_COL_WIDTH);
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const leftPaneWidth = nameColWidth + FIXED_PANE_WIDTH;

  // ── Resize handlers ────────────────────────────────────────────────────────
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

  // ── Double-click auto-fit: measure longest task title ──────────────────────
  const onResizeDblClick = useCallback(() => {
    if (tasks.length === 0) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "13px Inter, system-ui, sans-serif";
    let maxWidth = MIN_NAME_COL_WIDTH;
    tasks.forEach((task) => {
      // account for indent (approx 18px per level) + icon + padding
      const measured = ctx.measureText(task.title).width + 72;
      if (measured > maxWidth) maxWidth = measured;
    });
    setNameColWidth(Math.ceil(maxWidth));
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

  const { dates, minDateStr, months } = useMemo(() => {
    if (tasks.length === 0) {
      return { dates: [], minDateStr: "", months: [] };
    }

    let min = new Date(tasks[0].startDate).getTime();
    let max = new Date(tasks[0].dueDate).getTime();

    tasks.forEach((task) => {
      const start = new Date(task.startDate).getTime();
      const end = new Date(task.dueDate).getTime();
      if (start < min) min = start;
      if (end > max) max = end;
    });

    const minDate = new Date(min);
    minDate.setDate(minDate.getDate() - 15); // Add padding before
    const maxDate = new Date(max);
    maxDate.setDate(maxDate.getDate() + 180); // Add 180 days to ensure grid fills screen

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

  const renderTree = (nodes: WbsNode[]): React.ReactNode => {
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

      const rowClass = `${styles.ganttRow} ${isRoot ? styles.ganttRowRoot : ""}`;

      // Triangle icon
      const ToggleIcon = isExpanded ? (
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
      );

      // Task icon (generic box)
      const TaskIcon = (
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
        </svg>
      );

      return (
        <React.Fragment key={node.task.id}>
          <div 
            id={`gantt-row-${node.task.id}`}
            className={`${rowClass} ${node.task.id === highlightTaskId ? (highlightColor === "red" ? styles.flashHighlightRed : highlightColor === "green" ? styles.flashHighlightGreen : styles.flashHighlightBlue) : ""}`}
          >
            {/* Left Cell */}
            <div className={styles.ganttLeftCell} style={{ width: `${leftPaneWidth}px` }} onClick={() => handleRowClick(node.task.id)}>
              <div className={styles.ganttLeftCol} style={{ width: `${nameColWidth}px` }}>
                <div style={{ width: `${node.level * 28}px`, flexShrink: 0 }} />
                {hasChildren ? (
                  <button className={styles.expandBtn} onClick={(e) => toggleExpand(node.task.id, e)}>
                    {ToggleIcon}
                  </button>
                ) : (
                  <span style={{ width: 22, display: "inline-block" }}></span>
                )}
                <span className={styles.taskIcon}>{TaskIcon}</span>
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
              <div className={styles.ganttLeftCol} style={{ width: `${STATUS_COL_WIDTH}px` }}>
                <div className={styles.statusIndicator}>
                  <div className={`${styles.statusCircle} ${circleClass}`} />
                  <span className={styles.statusText}>{stateText}</span>
                </div>
              </div>
              <div
                className={`${styles.ganttLeftCol} ${styles.priorityCol}`}
                style={{ width: `${PRIORITY_COL_WIDTH}px` }}
              >
                <span className={`${styles.priorityBadge} ${priorityPresentation.badgeClass}`}>
                  {priorityPresentation.label}
                </span>
              </div>
              <div className={styles.ganttLeftCol} style={{ width: `${ASSIGNEE_COL_WIDTH}px` }}>
                <span className={styles.ganttMetaText}>
                  {node.task.assignee?.name || "Chưa giao"}
                </span>
              </div>
              <div className={styles.ganttLeftCol} style={{ width: `${START_COL_WIDTH}px` }}>
                <span className={styles.ganttMetaText}>
                  {new Date(node.task.startDate).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
              </div>
              <div className={styles.ganttLeftCol} style={{ width: `${END_COL_WIDTH}px` }}>
                <span className={styles.ganttMetaText}>
                  {new Date(effectiveDueDate).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
              </div>
              <div className={styles.ganttLeftCol} style={{ width: `${ET_COL_WIDTH}px` }}>
                <span className={styles.ganttMetaText} style={{ fontWeight: 500 }}>
                  {node.task.spentHours || 0}h / {node.task.estimateHours || 0}h
                </span>
              </div>
            </div>

            {/* Right Cell */}
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
              {hasChildren ? (
                /* Summary Task (Parent) */
                <div
                  style={{
                    gridColumnStart: startCol,
                    gridColumnEnd: endCol,
                    position: "relative",
                    marginTop: "8px",
                    height: "8px",
                    backgroundColor: "#1a365d", /* Màu xanh đen đậm */
                    zIndex: 2
                  }}
                  title={`[Hạng mục] ${node.task.title}`}
                >
                  <div style={{ position: "absolute", left: 0, top: "8px", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid #1a365d" }} />
                  <div style={{ position: "absolute", right: 0, top: "8px", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid #1a365d" }} />
                </div>
              ) : (
                /* Leaf Task (Child) */
                <div
                  className={`${styles.ganttBar} ${priorityPresentation.barClass}`}
                  style={{
                    gridColumnStart: startCol,
                    gridColumnEnd: endCol,
                    position: "relative",
                    overflow: "hidden"
                  }}
                  title={`Mức độ cấp thiết: ${priorityPresentation.label}\nTiến độ: ${node.task.spentHours || 0}h / ${node.task.estimateHours || 0}h`}
                >
                  {(node.task.estimateHours || 0) > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "25%",
                        left: 0,
                        height: "50%",
                        width: `${Math.min(100, Math.round(((node.task.spentHours || 0) / node.task.estimateHours) * 100))}%`,
                        background: "#1c4a7e",
                        borderRight: "1px solid #102a47"
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          {isExpanded && hasChildren && renderTree(node.children)}
        </React.Fragment>
      );
    });
  };

  useEffect(() => {
    if (highlightTaskId) {
      setTimeout(() => {
        const el = document.getElementById(`gantt-row-${highlightTaskId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500); // Wait a bit for layout to settle
    }
  }, [highlightTaskId, expanded]); // Also trigger if expanded state changes and task becomes visible

  if (tasks.length === 0) {
    return (
      <div className={styles.ganttContainer} style={{ padding: "2rem", textAlign: "center" }}>
        Chưa có nhiệm vụ nào.
      </div>
    );
  }

  return (
    <div className={styles.ganttContainer} style={{ flex: 1, width: "100%", height: "100%" }}>
      <div className={styles.ganttLayout} style={{ height: "100%", minWidth: `${leftPaneWidth + timelineWidth}px` }}>
        <div className={styles.ganttBody} style={{ minWidth: `${leftPaneWidth + timelineWidth}px` }}>
          {/* Header */}
          <div className={styles.ganttHeaderRow}>
            <div className={styles.ganttLeftHeader} style={{ width: `${leftPaneWidth}px` }}>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${nameColWidth}px`, position: "relative" }}>
                Tên công việc
                <div
                  className={styles.colResizeHandle}
                  onMouseDown={onResizeMouseDown}
                  onDoubleClick={onResizeDblClick}
                  title="Kéo để thay đổi kích thước. Double-click để tự khớp."
                />
              </div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${STATUS_COL_WIDTH}px` }}>Trạng thái</div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${PRIORITY_COL_WIDTH}px` }}>Cấp thiết</div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${ASSIGNEE_COL_WIDTH}px` }}>Người thực hiện</div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${START_COL_WIDTH}px` }}>Bắt đầu</div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${END_COL_WIDTH}px` }}>Kết thúc</div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${ET_COL_WIDTH}px` }}>Tiến độ (ET)</div>
            </div>
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
                  // Show date only every 7 days (e.g. if it's Monday) to match the spaced out dates in screenshot
                  const isMonday = date.getDay() === 1;
                  return (
                    <div key={i} className={styles.ganttDayHeader}>
                      {isMonday ? date.getDate() : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Body Rows */}
          <div style={{ position: "relative" }}>
            {/* Background Grid Lines */}
            <div
              className={styles.ganttGridLines}
              style={{
                left: `${leftPaneWidth}px`,
                width: `${timelineWidth}px`,
                gridTemplateColumns: `repeat(${dates.length}, ${DAY_COLUMN_WIDTH}px)`,
              }}
            >
              {dates.map((date, i) => (
                <div key={i} className={styles.ganttGridLine} />
              ))}
            </div>

            {/* Today Line */}
            {todayOffset !== null && (
              <div
                className={styles.todayLine}
                style={{ left: `${leftPaneWidth + todayOffset}px` }}
                title={`Hôm nay: ${new Date().toLocaleDateString("vi-VN")}`}
              >
                <span className={styles.todayLabel}>Hôm nay</span>
              </div>
            )}

            {/* Task Rows */}
            {renderTree(rootNodes)}
          </div>
        </div>
      </div>
    </div>
  );
}
