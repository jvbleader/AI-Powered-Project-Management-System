import { EnrichedTask } from "@/types";
import { StatusPill } from "@/components/ui";
import { formatDate, taskPriorityLabel } from "@/lib/utils/format";
import { isTaskOverdue } from "@/lib/mock/permissions";

type TaskCardProps = {
  task: EnrichedTask;
  onClick: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLElement>) => void;
};

export function TaskCard({ task, onClick, onDragStart, onDragEnd }: TaskCardProps) {
  return (
    <article className="task-card" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}>
      <div className="task-topline">
        <strong>{task.key}</strong>
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
      <h3>{task.title}</h3>
      <p>{task.description}</p>
      <div className="task-card-footer">
        <span>{task.assignee?.name || "Chưa giao"}</span>
        <span>{formatDate(task.dueDate)}</span>
      </div>
      {isTaskOverdue(task) ? <span className="deadline-flag">Quá hạn</span> : null}
    </article>
  );
}
