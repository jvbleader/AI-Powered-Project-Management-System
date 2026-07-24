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
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
      <div style={{ width: '3px', height: '6px', borderRadius: '1px', backgroundColor: activeBars[0] ? color : '#e2e8f0' }} />
      <div style={{ width: '3px', height: '10px', borderRadius: '1px', backgroundColor: activeBars[1] ? color : '#e2e8f0' }} />
      <div style={{ width: '3px', height: '14px', borderRadius: '1px', backgroundColor: activeBars[2] ? color : '#e2e8f0' }} />
      {level === "critical" && (
        <svg style={{ marginLeft: '2px', color: '#e11d48' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
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

const MIN_NAME_COL_WIDTH = 160;
const DEFAULT_NAME_COL_WIDTH = 420;
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
  const highlightColor = searchParams.get("highlightColor") || "blue";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [nameColWidth, setNameColWidth] = useState(DEFAULT_NAME_COL_WIDTH);
  const [assigneeColWidth, setAssigneeColWidth] = useState(DEFAULT_ASSIGNEE_COL_WIDTH);
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const fixedPaneWidth = STATUS_COL_WIDTH + PRIORITY_COL_WIDTH + assigneeColWidth + START_COL_WIDTH + END_COL_WIDTH + ET_COL_WIDTH;
  const leftPaneWidth = nameColWidth + fixedPaneWidth;

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

  // ── Auto-fit: measure longest task title and assignee ──────────────────────
  const measureColumns = useCallback((currentTasks: EnrichedTask[]) => {
    if (currentTasks.length === 0) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "13px Inter, system-ui, sans-serif";
    
    let maxNameWidth = DEFAULT_NAME_COL_WIDTH;
    let maxAssigneeWidth = DEFAULT_ASSIGNEE_COL_WIDTH;
    
    // We compute simple level indentation heuristically by finding parents
    const getLevel = (taskId: string, tasksMap: Map<string, EnrichedTask>): number => {
      let level = 0;
      let curr = tasksMap.get(taskId);
      while (curr && curr.parentTaskId) {
        level++;
        curr = tasksMap.get(curr.parentTaskId);
      }
      return level;
    };
    
    const map = new Map(currentTasks.map(t => [t.id, t]));

    currentTasks.forEach((task) => {
      const level = getLevel(task.id, map);
      const indent = level * 24;
      const iconWidth = 30; // expand btn + icon
      const measuredName = ctx.measureText(task.title).width + indent + iconWidth + 40;
      if (measuredName > maxNameWidth) maxNameWidth = measuredName;
      
      const assigneeName = task.assignee?.name || "Chưa giao";
      const measuredAssignee = ctx.measureText(assigneeName).width + 32;
      if (measuredAssignee > maxAssigneeWidth) maxAssigneeWidth = measuredAssignee;
    });
    
    setNameColWidth(Math.ceil(maxNameWidth));
    setAssigneeColWidth(Math.ceil(maxAssigneeWidth));
  }, []);

  // Run auto-fit once when tasks load
  useEffect(() => {
    measureColumns(tasks);
  }, [tasks, measureColumns]);
  
  const onResizeDblClick = useCallback(() => {
    measureColumns(tasks);
  }, [tasks, measureColumns]);

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
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
      );

      // Task icon by level
      const taskIcon = (() => {
        switch (node.level) {
          case 0:
            // Cấp 0 (Epic / Task chính): Icon Folder / Layer - tím nhạt
            return (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.8" style={{ color: "#6366f1" }}>
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
              </svg>
            );
          case 1:
            // Cấp 1 (Task con cấp 1): Icon Card / Task - xanh dương
            return (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.8" style={{ color: "#0284c7" }}>
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M3 9h18" />
                <path d="M9 15h6" />
              </svg>
            );
          case 2:
            // Cấp 2 (Sub-task cấp 2): Icon File / Document - xanh lá
            return (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.8" style={{ color: "#10b981" }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            );
          default:
            // Cấp 3+ (Micro-task): Icon Clock / Circle - cam
            return (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.8" style={{ color: "#f59e0b" }}>
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 8 12 12 15 15" />
              </svg>
            );
        }
      })();

      return (
        <React.Fragment key={node.task.id}>
          <div 
            id={`gantt-row-${node.task.id}`}
            className={`${rowClass} ${String(node.task.id) === String(highlightTaskId) ? (highlightColor === "red" ? styles.flashHighlightRed : highlightColor === "green" ? styles.flashHighlightGreen : styles.flashHighlightBlue) : ""}`}
            style={{ position: "relative" }}
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
                <div className={styles.priorityIndicatorWrapper}>
                  {priorityPresentation.icon}
                  <span className={priorityPresentation.textClass}>
                    {priorityPresentation.label}
                  </span>
                </div>
              </div>
              <div className={styles.ganttLeftCol} style={{ width: `${assigneeColWidth}px` }}>
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
              {hasChildren && isRoot ? (
                /* Summary Task (Parent) */
                <div
                  style={{
                    gridColumnStart: startCol,
                    gridColumnEnd: endCol,
                    position: "relative",
                    marginTop: "8px",
                    height: "10px",
                    backgroundColor: "#1a365d", /* Màu xanh đen đậm */
                    zIndex: 2,
                    borderTopLeftRadius: "2px",
                    borderTopRightRadius: "2px"
                  }}
                  title={`[Hạng mục] ${node.task.title}`}
                >
                  {/* Left Hook */}
                  <div style={{ position: "absolute", left: 0, top: "10px", width: 0, height: 0, borderTop: "8px solid #1a365d", borderRight: "6px solid transparent" }} />
                  {/* Right Hook */}
                  <div style={{ position: "absolute", right: 0, top: "10px", width: 0, height: 0, borderTop: "8px solid #1a365d", borderLeft: "6px solid transparent" }} />
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

      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("highlightTaskId");
        url.searchParams.delete("highlightColor");
        window.history.replaceState({}, '', url.pathname + url.search);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [highlightTaskId, expanded]);

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
              <div className={styles.ganttLeftHeaderCell} style={{ width: `${assigneeColWidth}px` }}>Người thực hiện</div>
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
