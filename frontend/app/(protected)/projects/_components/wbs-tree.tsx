import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { differenceInDays, taskStatusLabel, toWorkflowTaskStatus } from "@/lib/utils/format";
import type { EnrichedTask } from "@/types";
import styles from "../styles/wbs-tree.module.css";

interface WbsTreeProps {
  tasks: EnrichedTask[];
}

interface WbsNode {
  task: EnrichedTask;
  children: WbsNode[];
}

export function WbsTree({ tasks }: WbsTreeProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const rootNodes = useMemo(() => {
    const taskMap = new Map<string, WbsNode>();
    const roots: WbsNode[] = [];

    tasks.forEach((task) => {
      taskMap.set(task.id, { task, children: [] });
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

    return roots;
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

  const renderTree = (nodes: WbsNode[], isRoot = false): React.ReactNode => {
    if (nodes.length === 0) return null;

    return (
      <ul className={`${styles.treeList} ${isRoot ? styles.treeListRoot : ""}`}>
        {nodes.map((node) => {
          const isExpanded = expanded[node.task.id] !== false;
          const hasChildren = node.children.length > 0;
          const duration = differenceInDays(node.task.startDate, node.task.dueDate) + 1;
          const workflowStatus = toWorkflowTaskStatus(node.task.status);
          const statusClass = styles[`status${workflowStatus}`] || styles.statusTODO;

          const fStart = new Date(node.task.startDate).toLocaleDateString("vi-VN");
          const fEnd = new Date(node.task.dueDate).toLocaleDateString("vi-VN");

          return (
            <li key={node.task.id} className={styles.treeNode}>
              <div className={styles.card} onClick={() => handleRowClick(node.task.id)}>
                <div className={styles.cardLeft}>
                  {hasChildren ? (
                    <button
                      className={styles.expandBtn}
                      onClick={(e) => toggleExpand(node.task.id, e)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {isExpanded ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        )}
                      </svg>
                    </button>
                  ) : (
                    <div className={styles.emptySpacer} />
                  )}
                  <span className={styles.taskTitle}>{node.task.title}</span>
                </div>

                <div className={styles.cardRight}>
                  <div className={styles.metaItem}>
                    <strong>Thời lượng:</strong> {duration} ngày
                  </div>
                  <div className={styles.metaItem}>
                    <strong>Bắt đầu:</strong> {fStart}
                  </div>
                  <div className={styles.metaItem}>
                    <strong>Kết thúc:</strong> {fEnd}
                  </div>
                  <div className={`${styles.statusBadge} ${statusClass}`}>
                    {taskStatusLabel(workflowStatus)}
                  </div>
                </div>
              </div>

              {isExpanded && hasChildren && renderTree(node.children)}
            </li>
          );
        })}
      </ul>
    );
  };

  if (tasks.length === 0) {
    return (
      <div className={styles.treeContainer} style={{ padding: "2rem", textAlign: "center" }}>
        Chưa có nhiệm vụ nào.
      </div>
    );
  }

  return <div className={styles.treeContainer}>{renderTree(rootNodes, true)}</div>;
}
