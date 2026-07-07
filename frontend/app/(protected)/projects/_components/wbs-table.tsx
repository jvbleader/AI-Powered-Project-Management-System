import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/ui";
import { taskStatusLabel } from "@/lib/utils/format";
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
                      width: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
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
                  <span style={{ width: "16px" }} />
                )}
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
                tone={
                  node.task.status === "DONE"
                    ? "on-track"
                    : node.task.status === "BLOCKED"
                      ? "critical"
                      : "neutral"
                }
              />
            </td>
            <td>{node.task.dueDate}</td>
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
