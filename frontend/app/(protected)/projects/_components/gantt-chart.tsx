import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { differenceInDays, generateDateRange } from "@/lib/utils/format";
import type { EnrichedTask } from "@/types";
import styles from "../styles/gantt.module.css";

interface GanttChartProps {
  tasks: EnrichedTask[];
}

interface WbsNode {
  task: EnrichedTask;
  children: WbsNode[];
  level: number;
}

export function GanttChart({ tasks }: GanttChartProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
      const key = d.toLocaleDateString("en-US", { month: "long" });
      monthsMap.set(key, (monthsMap.get(key) || 0) + 1);
    });
    
    const months = Array.from(monthsMap.entries()).map(([name, days]) => ({ name, days }));

    return { dates, minDateStr, months };
  }, [tasks]);

  const toggleExpand = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({
      ...prev,
      [taskId]: prev[taskId] === undefined ? false : !prev[taskId],
    }));
  };

  const handleRowClick = (taskId: string) => {
    router.push(`/tasks?taskId=${taskId}`);
  };

  const renderTree = (nodes: WbsNode[], indexCounter = { count: 1 }): React.ReactNode => {
    return nodes.map((node) => {
      const isExpanded = expanded[node.task.id] !== false;
      const hasChildren = node.children.length > 0;
      const isRoot = node.level === 0;

      const startCol = differenceInDays(minDateStr, node.task.startDate) + 1;
      const endCol = differenceInDays(minDateStr, node.task.dueDate) + 2;

      // Status mapping
      let circleClass = styles.circleGray;
      let stateText = "planned";
      if (node.task.status === "DONE") {
        circleClass = styles.circleGray;
        stateText = "completed";
      } else if (node.task.status === "IN_PROGRESS" || node.task.status === "REVIEW") {
        circleClass = styles.circleGreen;
        stateText = "in process";
      } else {
        circleClass = styles.circleRed;
        stateText = "planned";
      }

      // Root tasks get teal background
      const rowClass = `${styles.ganttRow} ${isRoot ? styles.ganttRowRoot : ""}`;

      // Triangle icon
      const ToggleIcon = isExpanded ? (
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
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
          <div className={rowClass}>
            {/* Left Cell */}
            <div className={styles.ganttLeftCell} onClick={() => handleRowClick(node.task.id)}>
              <div className={styles.ganttLeftCol} style={{ width: "300px", paddingLeft: `${node.level * 20 + 8}px` }}>
                {hasChildren ? (
                  <button className={styles.expandBtn} onClick={(e) => toggleExpand(node.task.id, e)}>
                    {ToggleIcon}
                  </button>
                ) : (
                  <span style={{ width: 22, display: "inline-block" }}></span>
                )}
                <span className={styles.taskIcon}>{TaskIcon}</span>
                <span>{node.task.title}</span>
              </div>
              <div className={styles.ganttLeftCol} style={{ width: "150px" }}>
                <div className={styles.statusIndicator}>
                  <div className={`${styles.statusCircle} ${circleClass}`} />
                  <span className={styles.statusText}>{stateText}</span>
                </div>
              </div>
              <div className={styles.ganttLeftCol} style={{ width: "150px" }}>
                <span style={{ color: "#555", fontSize: "12px" }}>
                  {node.task.assignee?.name || "Chưa giao"}
                </span>
              </div>
            </div>

            {/* Right Cell */}
            <div
              className={styles.ganttRightCell}
              style={{ gridTemplateColumns: `repeat(${dates.length}, 20px)` }}
            >
              <div
                className={hasChildren ? styles.ganttBarParent : styles.ganttBarChild}
                style={{
                  gridColumnStart: startCol,
                  gridColumnEnd: endCol,
                }}
              >
                {!hasChildren && <div className={styles.ganttBarProgress} />}
              </div>
            </div>
          </div>
          {isExpanded && hasChildren && renderTree(node.children, indexCounter)}
        </React.Fragment>
      );
    });
  };

  if (tasks.length === 0) {
    return (
      <div className={styles.ganttContainer} style={{ padding: "2rem", textAlign: "center" }}>
        Chưa có nhiệm vụ nào.
      </div>
    );
  }

  return (
    <div className={styles.ganttContainer} style={{ flex: 1, width: "100%", height: "100%" }}>
      <div className={styles.ganttLayout} style={{ height: "100%" }}>
        <div className={styles.ganttBody}>
          {/* Header */}
          <div className={styles.ganttHeaderRow}>
            <div className={styles.ganttLeftHeader}>
              <div className={styles.ganttLeftHeaderCell} style={{ width: "300px" }}>Name</div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: "150px" }}>State</div>
              <div className={styles.ganttLeftHeaderCell} style={{ width: "150px" }}>Assignee</div>
            </div>
            <div className={styles.ganttRightHeader}>
              <div className={styles.ganttRightHeaderTop}>
                {months.map((m, i) => (
                  <div key={i} className={styles.ganttMonthHeader} style={{ width: `${m.days * 20}px` }}>
                    {m.name}
                  </div>
                ))}
              </div>
              <div className={styles.ganttRightHeaderBottom} style={{ gridTemplateColumns: `repeat(${dates.length}, 20px)` }}>
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
                left: "600px", // Offset for left pane
                gridTemplateColumns: `repeat(${dates.length}, 20px)`,
              }}
            >
              {dates.map((date, i) => (
                <div key={i} className={styles.ganttGridLine} />
              ))}
            </div>

            {/* Task Rows */}
            {renderTree(rootNodes)}
          </div>
        </div>
      </div>
    </div>
  );
}
