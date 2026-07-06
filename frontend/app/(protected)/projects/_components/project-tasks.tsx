import { EmptyState, StatusPill, Surface } from "@/components/ui";
import { formatRange, taskStatusLabel } from "@/lib/utils/format";
import type { Task } from "@/types";

interface ProjectTasksProps {
  tasks: Task[];
  projectName: string;
}

export function ProjectTasks({ tasks, projectName }: ProjectTasksProps) {
  return (
    <Surface title="Tiến độ công việc cá nhân" kicker="Your tasks">
      {tasks.length ? (
        <div className="task-list">
          {tasks.map((task) => (
            <article key={task.id} className="task-card">
              <div className="task-card-head">
                <div>
                  <strong>{task.title}</strong>
                  <p>
                    {projectName} - {task.key}
                  </p>
                </div>
                <StatusPill
                  label={taskStatusLabel(task.status)}
                  tone={
                    task.status === "DONE"
                      ? "on-track"
                      : task.status === "IN_PROGRESS"
                        ? "watch"
                        : task.status === "BLOCKED"
                          ? "critical"
                          : "neutral"
                  }
                />
              </div>
              <div className="task-meta">
                <span className="priority-indicator" data-priority={task.priority}>
                  {task.priority} Priority
                </span>
                <span>Deadline: {task.dueDate}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Bạn đang trống việc"
          description="Không có task nào được giao cho bạn trong dự án này."
        />
      )}
    </Surface>
  );
}
