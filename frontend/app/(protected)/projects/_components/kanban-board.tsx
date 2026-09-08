import { useState, useEffect } from "react";
import { taskApi } from "@/services/api";
import { EnrichedTask } from "@/types";
import { StatusPill } from "@/components/ui";
import { AssigneeAvatars } from "@/components/assignee-avatars";
import { formatDate, taskPriorityLabel, toWorkflowTaskStatus, getTaskBgColor } from "@/lib/utils/format";

interface KanbanBoardProps {
  tasks: EnrichedTask[];
  onTaskUpdated: () => void;
  onTaskClick: (taskId: string) => void;
}

const COLUMNS = [
  { id: "TODO", label: "Cần làm" },
  { id: "IN_PROGRESS", label: "Đang tiến hành" },
  { id: "DONE", label: "Đã hoàn thành" },
];

export function KanbanBoard({ tasks, onTaskUpdated, onTaskClick }: KanbanBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState<EnrichedTask[]>(tasks);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    // Defer state update to allow browser to capture drag ghost
    setTimeout(() => {
      setDraggedTaskId(taskId);
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedTaskId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, statusId: string) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    const task = localTasks.find((t) => t.id === draggedTaskId);
    setDraggedTaskId(null);
    if (task && toWorkflowTaskStatus(task.status) !== statusId) {
      try {
        setLocalTasks(prev => prev.map(t => t.id === draggedTaskId ? { ...t, status: statusId as EnrichedTask["status"] } : t));
        await taskApi.updateStatus(draggedTaskId, statusId as EnrichedTask["status"]);
        onTaskUpdated();
      } catch (err: unknown) {
        setLocalTasks(tasks); // Revert on error
        alert(err instanceof Error ? err.message : "Lỗi khi cập nhật trạng thái");
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "1.5rem",
        overflowX: "auto",
        paddingBottom: "1rem",
        minHeight: "60vh",
      }}
    >
      {COLUMNS.map((col) => {
        const colTasks = localTasks.filter((t) => toWorkflowTaskStatus(t.status) === col.id);
        return (
          <div
            key={col.id}
            style={{
              flex: "1",
              minWidth: "320px",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0 0.5rem",
              }}
            >
              {col.label}
              <span
                style={{
                  fontSize: "0.875rem",
                  color: "var(--foreground-muted)",
                  background: "#ffffff",
                  padding: "0.125rem 0.5rem",
                  borderRadius: "12px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                {colTasks.length}
              </span>
            </h3>

            <div
              style={{
                flex: "1",
                background: "#ffffff",
                borderRadius: "12px",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)",
                minHeight: "200px",
              }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
            >

            {colTasks.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onDragEnd={handleDragEnd}
                onClick={() => onTaskClick(task.id)}
                style={{
                  opacity: draggedTaskId === task.id ? 0.5 : 1,
                  backgroundColor: getTaskBgColor(task.status),
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "1rem",
                  cursor: "grab",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <strong style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>
                    {task.key}
                  </strong>
                  <StatusPill
                    label={taskPriorityLabel(task.priority)}
                    tone={
                      task.priority === "CRITICAL"
                        ? "critical"
                        : task.priority === "HIGH"
                          ? "watch"
                          : "neutral"
                    }
                  />
                </div>
                <div style={{ fontWeight: 500, lineHeight: 1.4 }}>{task.title}</div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <AssigneeAvatars
                      assignees={task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : []}
                      size={24}
                    />
                  </div>
                  {task.dueDate && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color:
                          new Date(task.dueDate) < new Date() && task.status !== "DONE"
                            ? "var(--status-critical)"
                            : "var(--foreground-muted)",
                      }}
                    >
                      {new Date(task.dueDate).toLocaleDateString("vi-VN")}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {colTasks.length === 0 && (
              <div
                style={{
                  padding: "3rem 1rem",
                  textAlign: "center",
                  color: "var(--foreground-muted)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "0.75rem",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span style={{ fontSize: "0.875rem" }}>Kéo thả công việc vào đây</span>
              </div>
            )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
