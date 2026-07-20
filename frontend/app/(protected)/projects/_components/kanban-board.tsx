import { useState, useEffect } from "react";
import { taskApi } from "@/services/api";
import { EnrichedTask } from "@/types";
import { StatusPill } from "@/components/ui";
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
    e.dataTransfer.effectAllowed = "move";
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
              background: "var(--surface-sunken)",
              borderRadius: "8px",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {col.label}
              <span
                style={{
                  fontSize: "0.875rem",
                  color: "var(--foreground-muted)",
                  background: "var(--surface)",
                  padding: "0.125rem 0.5rem",
                  borderRadius: "12px",
                }}
              >
                {colTasks.length}
              </span>
            </h3>

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
                    {task.assignee ? (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "var(--primary-subtle)",
                          color: "var(--primary-base)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                        }}
                        title={task.assignee.name}
                      >
                        {task.assignee.name.charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "1px dashed var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          color: "var(--foreground-muted)",
                        }}
                        title="Chưa phân công"
                      >
                        ?
                      </div>
                    )}
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
                  padding: "2rem 1rem",
                  textAlign: "center",
                  color: "var(--foreground-muted)",
                  border: "1px dashed var(--border)",
                  borderRadius: "6px",
                }}
              >
                Kéo thả công việc vào đây
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
