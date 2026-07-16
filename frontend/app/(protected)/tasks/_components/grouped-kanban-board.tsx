"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { taskApi } from "@/services/api";
import { EnrichedTask, Project } from "@/types";
import { EmptyState, Surface, StatusPill } from "@/components/ui";
import { formatDate, taskPriorityLabel, toWorkflowTaskStatus } from "@/lib/utils/format";

const getTaskBgColor = (status: EnrichedTask["status"]) => {
  switch (toWorkflowTaskStatus(status)) {
    case "TODO":
      return "#fef08a"; // Vàng (Yellow)
    case "IN_PROGRESS":
      return "#bfdbfe"; // Xanh dương (Blue)
    case "DONE":
      return "#bbf7d0"; // Xanh lá (Green)
    default:
      return "var(--surface)";
  }
};

interface GroupedKanbanBoardProps {
  projects: Project[];
  tasks: EnrichedTask[];
  onTaskUpdated: () => void;
  selectedProjectId: string;
  onTaskClick?: (taskId: string) => void;
}

const COLUMNS = [
  { id: "TODO", label: "Cần làm" },
  { id: "IN_PROGRESS", label: "Đang tiến hành" },
  { id: "DONE", label: "Đã hoàn thành" },
];

function projectTaskCount(projectTasks: EnrichedTask[], statusId: (typeof COLUMNS)[number]["id"]) {
  return projectTasks.filter((task) => toWorkflowTaskStatus(task.status) === statusId).length;
}

export function GroupedKanbanBoard({
  projects,
  tasks,
  onTaskUpdated,
  selectedProjectId,
  onTaskClick,
}: GroupedKanbanBoardProps) {
  const router = useRouter();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, statusId: string) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    const task = tasks.find((t) => t.id === draggedTaskId);
    if (task && toWorkflowTaskStatus(task.status) !== statusId) {
      try {
        await taskApi.updateStatus(draggedTaskId, statusId as EnrichedTask["status"]);
        onTaskUpdated();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Lỗi khi cập nhật trạng thái");
      }
    }
    setDraggedTaskId(null);
  };

  const selectedProject =
    selectedProjectId === "ALL"
      ? null
      : projects.find((project) => project.id === selectedProjectId);
  const boardTitle = selectedProject ? `Kanban - ${selectedProject.name}` : "Kanban theo dự án";
  const boardKicker = selectedProject?.code ?? "Task workflow";

  const projectBoards = useMemo(() => {
    if (selectedProject) {
      return [
        {
          project: selectedProject,
          tasks: tasks.filter((task) => task.projectId === selectedProject.id),
        },
      ];
    }

    return projects
      .map((project) => ({
        project,
        tasks: tasks.filter((task) => task.projectId === project.id),
      }))
      .filter((entry) => entry.tasks.length > 0)
      .sort((left, right) => right.tasks.length - left.tasks.length);
  }, [projects, selectedProject, tasks]);

  const renderTaskCard = (task: EnrichedTask) => (
    <article
      key={task.id}
      draggable
      onDragStart={(e) => handleDragStart(e, task.id)}
      onClick={() => (onTaskClick ? onTaskClick(task.id) : router.push(`/tasks?taskId=${task.id}`))}
      className="task-kanban-card"
      style={{
        background: getTaskBgColor(task.status),
        opacity: draggedTaskId === task.id ? 0.5 : 1,
      }}
    >
      <div className="task-kanban-card-head">
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

      <div className="task-kanban-card-body">
        <strong className="task-kanban-card-title">{task.title}</strong>
        {task.description ? (
          <p className="task-kanban-card-description">{task.description}</p>
        ) : (
          <p className="task-kanban-card-description">Chưa có mô tả chi tiết.</p>
        )}
      </div>

      <div className="task-kanban-card-meta">
        <span>
          <strong>Người phụ trách:</strong> {task.assignee?.name || "Chưa phân công"}
        </span>
        <span>
          <strong>Bắt đầu:</strong> {formatDate(task.startDate)}
        </span>
        <span>
          <strong>Hạn chót:</strong> {formatDate(task.dueDate)}
        </span>
      </div>
    </article>
  );

  const renderProjectBoard = (project: Project, projectTasks: EnrichedTask[]) => (
    <section key={project.id} className="project-task-section">
      <div className="project-task-section-head">
        <div className="project-task-section-copy">
          <span className="project-task-section-kicker">{project.code}</span>
          <h3>{project.name}</h3>
          <p>
            {project.managerName
              ? `Quản lý: ${project.managerName}. ${projectTasks.length} task đang hiển thị trong phạm vi của bạn.`
              : `${projectTasks.length} task đang hiển thị trong phạm vi của bạn.`}
          </p>
        </div>

        <div className="project-task-summary">
          {COLUMNS.map((column) => (
            <div key={column.id} className={`project-task-summary-item ${column.id.toLowerCase()}`}>
              <strong>{projectTaskCount(projectTasks, column.id)}</strong>
              <span>{column.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="project-task-section-board">
        {COLUMNS.map((col) => {
          const colTasks = projectTasks.filter((task) => toWorkflowTaskStatus(task.status) === col.id);

          return (
            <div
              key={`${project.id}-${col.id}`}
              className="kanban-column"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
              style={{ minWidth: 0 }}
            >
              <div className="kanban-column-header">
                <strong>{col.label}</strong>
                <span>{colTasks.length}</span>
              </div>

              <div className="task-kanban-stack">
                {colTasks.map((task) => renderTaskCard(task))}

                {colTasks.length === 0 ? (
                  <div className="task-kanban-empty">Chưa có task trong cột này</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <Surface title={boardTitle} kicker={boardKicker}>
      {projectBoards.length ? (
        <div className="project-task-board-list">
          {projectBoards.map(({ project, tasks: projectTasks }) =>
            renderProjectBoard(project, projectTasks),
          )}
        </div>
      ) : (
        <EmptyState
          title="Chưa có task trong phạm vi hiện tại"
          description="Khi có nhiệm vụ thuộc các dự án bạn tham gia, từng dự án sẽ được tách thành một khu riêng ở đây."
        />
      )}
    </Surface>
  );
}
