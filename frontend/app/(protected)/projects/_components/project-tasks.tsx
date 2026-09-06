import { EmptyState, StatusPill, Surface } from "@/components/ui";
import { AsyncContent } from "@/components/loading-state";
import { taskStatusLabel, taskStatusTone } from "@/lib/utils/format";
import type { Task } from "@/types";

interface ProjectTasksProps {
  tasks: Task[];
  projectName: string;
  isLoading?: boolean;
}

export function ProjectTasks({ tasks, projectName, isLoading = false }: ProjectTasksProps) {
  return (
    <Surface title="Tiến độ công việc cá nhân">
      <AsyncContent
        isLoading={isLoading}
        isEmpty={tasks.length === 0}
        skeleton="cards"
        empty={
          <EmptyState
            title="Bạn đang trống việc"
            description="Không có task nào được giao cho bạn trong dự án này."
          />
        }
      >
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
                  tone={taskStatusTone(task.status)}
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
      </AsyncContent>
    </Surface>
  );
}
