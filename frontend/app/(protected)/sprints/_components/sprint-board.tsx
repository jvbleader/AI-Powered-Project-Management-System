import { EnrichedTask, TaskStatus } from "@/types";
import { Surface } from "@/components/ui";
import { TaskCard } from "./task-card";

type SprintBoardProps = {
  tasks: EnrichedTask[];
  onTaskClick: (taskId: string) => void;
  onStatusDrop: (status: TaskStatus, taskId: string) => Promise<void>;
};

const boardColumns: Array<{
  label: string;
  key: "TODO" | "IN_PROGRESS" | "DONE";
  status: TaskStatus;
}> = [
  { label: "Cần làm", key: "TODO", status: "TODO" },
  { label: "Đang tiến hành", key: "IN_PROGRESS", status: "IN_PROGRESS" },
  { label: "Đã hoàn thành", key: "DONE", status: "DONE" },
];

function boardStatus(task: EnrichedTask) {
  if (task.status === "DONE") {
    return "DONE";
  }

  if (task.status === "TODO") {
    return "TODO";
  }

  return "IN_PROGRESS";
}

export function SprintBoard({ tasks, onTaskClick, onStatusDrop }: SprintBoardProps) {
  // We need local state for drag and drop
  return (
    <Surface title="Bảng Kanban" kicker="Drag and drop">
      <div className="kanban-board sprint-kanban-board">
        {boardColumns.map((column) => (
          <div
            key={column.key}
            className="kanban-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const taskId = event.dataTransfer.getData("text/plain");
              if (taskId) {
                void onStatusDrop(column.status, taskId);
              }
            }}
          >
            <div className="kanban-column-header">
              <strong>{column.label}</strong>
              <span>{tasks.filter((task) => boardStatus(task) === column.key).length}</span>
            </div>
            {tasks
              .filter((task) => boardStatus(task) === column.key)
              .map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => onTaskClick(task.id)}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.setData("text/plain", task.id);
                  }}
                />
              ))}
          </div>
        ))}
      </div>
    </Surface>
  );
}
