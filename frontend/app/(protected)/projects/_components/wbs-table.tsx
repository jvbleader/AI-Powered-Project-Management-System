import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/ui";
import { taskStatusLabel, taskStatusTone } from "@/lib/utils/format";
import type { EnrichedTask } from "@/types";
import styles from "../../team/styles/team.module.css";
import Image from "next/image";

interface WbsTableProps {
  tasks: EnrichedTask[];
}

interface WbsNode {
  task: EnrichedTask;
  children: WbsNode[];
  level: number;
}

export function WbsTable({ tasks }: WbsTableProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Build tree
  const taskMap = new Map<string, WbsNode>();
  const rootNodes: WbsNode[] = [];

  tasks.forEach((task) => {
    taskMap.set(task.id, { task, children: [], level: 0 });
  });

  tasks.forEach((task) => {
    const node = taskMap.get(task.id);
    if (node) {
      if (task.parentTaskId && taskMap.has(task.parentTaskId)) {
        taskMap.get(task.parentTaskId)!.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }
  });

  // Calculate levels
  function setLevels(nodes: WbsNode[], currentLevel: number) {
    nodes.forEach((node) => {
      node.level = currentLevel;
      setLevels(node.children, currentLevel + 1);
    });
  }
  setLevels(rootNodes, 0);

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

  function renderTree(nodes: WbsNode[]): React.ReactNode {
    return nodes.map((node) => {
      const isExpanded = expanded[node.task.id] !== false;
      const hasChildren = node.children.length > 0;

      return (
        <React.Fragment key={node.task.id}>
          <tr
            onClick={() => handleRowClick(node.task.id)}
            style={{ cursor: "pointer" }}
            className={styles.rowHover}
          >
            <td style={{ paddingLeft: `${node.level * 24 + 16}px` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => toggleExpand(node.task.id, e)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      width: "24px",
                      height: "24px",
                      marginRight: "6px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.1s",
                      }}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                ) : (
                  <span style={{ width: "24px", height: "24px", marginRight: "6px", display: "inline-block", flexShrink: 0 }} />
                )}
                {(() => {
                  switch (node.level) {
                    case 0:
                      return (
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" style={{ color: "#0047B3", flexShrink: 0 }} title="Epic">
                          <polygon points="12 2 22 12 12 22 2 12 12 2" />
                        </svg>
                      );
                    case 1:
                      return (
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2684FF", flexShrink: 0 }} title="Task">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                      );
                    case 2:
                      return (
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#36B37E", flexShrink: 0 }} title="Subtask">
                          <polyline points="15 10 20 15 15 20" />
                          <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                        </svg>
                      );
                    default:
                      return (
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8993A4", flexShrink: 0 }} title="Sub-subtask">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="16" />
                          <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                      );
                  }
                })()}
                <div className={styles.userCellCopy}>
                  <strong>{node.task.title}</strong>
                  <small>{node.task.key}</small>
                </div>
              </div>
            </td>
            <td>{node.task.estimateHours}h</td>
            <td>
              <StatusPill
                label={taskStatusLabel(node.task.status)}
                tone={taskStatusTone(node.task.status)}
              />
            </td>
            <td>{node.task.startDate}</td>
            <td>{node.task.dueDate}</td>
            <td>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  className={styles.avatarToken}
                  style={{ width: 24, height: 24, fontSize: 10 }}
                >
                  {node.task.assignee.avatarUrl ? (
                    <Image
                      src={node.task.assignee.avatarUrl}
                      alt={node.task.assignee.name}
                      width={24}
                      height={24}
                      className="avatar-image"
                      unoptimized
                    />
                  ) : (
                    node.task.assignee.initials
                  )}
                </span>
                <span className={styles.userCellCopy}>
                  <small style={{ margin: 0 }}>{node.task.assignee.name}</small>
                </span>
              </div>
            </td>
          </tr>
          {isExpanded && hasChildren && renderTree(node.children)}
        </React.Fragment>
      );
    });
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Nhiệm vụ</th>
            <th>ET (h)</th>
            <th>Trạng thái</th>
            <th>Ngày bắt đầu</th>
            <th>Ngày kết thúc</th>
            <th>Người làm</th>
          </tr>
        </thead>
        <tbody>
          {rootNodes.length > 0 ? (
            renderTree(rootNodes)
          ) : (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>
                Chưa có nhiệm vụ nào.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
