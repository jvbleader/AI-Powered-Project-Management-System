import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { taskApi } from "@/services/api";
import Link from "next/link";
import { EnrichedTask, Sprint } from "@/types";
import { StatusPill } from "@/components/ui";
import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { taskPriorityLabel, toWorkflowTaskStatus, getTaskBgColor } from "@/lib/utils/format";
import styles from "./project-kanban-board.module.css";

interface ProjectKanbanBoardProps {
  tasks: EnrichedTask[];
  sprints?: Sprint[];
  viewerId: string;
  onTaskUpdated: () => void;
  onTaskClick: (taskId: string) => void;
}

const KANBAN_COLUMNS = [
  { id: "TODO", label: "Cần làm" },
  { id: "IN_PROGRESS", label: "Đang tiến hành" },
  { id: "DONE", label: "Đã hoàn thành" },
];

// Helper to extract clean base topic from task title for grouping related tasks
function getTaskTopic(title: string): string {
  let clean = title.replace(/^\[(Epic|Feature|Bug|Task)\]\s*/i, "");
  clean = clean.replace(/^(US|Task|Feature|Bug|Technical debt):\s*/i, "");
  clean = clean.replace(/(\s*-\s*Part\s*\d+|\s*Part\s*\d+|\s*Phần\s*\d+|\s*#\d+)/i, "");
  return clean.trim().toLowerCase();
}

function sortBacklogTasks(tasks: EnrichedTask[]): EnrichedTask[] {
  const taskMap = new Map<string, EnrichedTask>(tasks.map((t) => [t.id, t]));
  const childrenByParent = new Map<string, EnrichedTask[]>();
  const rootTasks: EnrichedTask[] = [];

  tasks.forEach((t) => {
    if (t.parentTaskId && taskMap.has(t.parentTaskId)) {
      const list = childrenByParent.get(t.parentTaskId) || [];
      list.push(t);
      childrenByParent.set(t.parentTaskId, list);
    } else {
      rootTasks.push(t);
    }
  });

  // Sort root tasks by topic & title
  rootTasks.sort((a, b) => {
    const topicA = getTaskTopic(a.title);
    const topicB = getTaskTopic(b.title);
    if (topicA !== topicB) {
      return topicA.localeCompare(topicB, "vi", { sensitivity: "base" });
    }
    return a.title.localeCompare(b.title, "vi", { numeric: true, sensitivity: "base" });
  });

  // Flatten tree recursively
  const result: EnrichedTask[] = [];

  function addWithChildren(task: EnrichedTask) {
    result.push(task);
    const children = childrenByParent.get(task.id) || [];
    children.sort((a, b) => a.title.localeCompare(b.title, "vi", { numeric: true, sensitivity: "base" }));
    children.forEach(addWithChildren);
  }

  rootTasks.forEach(addWithChildren);

  return result;
}

export function ProjectKanbanBoard({ tasks, sprints, viewerId, onTaskUpdated, onTaskClick }: ProjectKanbanBoardProps) {
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams.get("highlightTaskId");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const [localTasks, setLocalTasks] = useState<EnrichedTask[]>(tasks);

  useEffect(() => {
    const sortedTasks = [...tasks].sort((a, b) => {
      return new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime();
    });
    setLocalTasks(sortedTasks);
  }, [tasks]);

  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightTaskId) {
      setTimeout(() => {
        const el = document.getElementById(`kanban-task-${highlightTaskId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);

      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("highlightTaskId");
        url.searchParams.delete("highlightColor");
        window.history.replaceState({}, '', url.pathname + url.search);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [highlightTaskId, localTasks]);

  useEffect(() => {
    if (!selectedSprintId && sprints && sprints.length > 0) {
      const active = sprints.find((s) => s.status?.toUpperCase() === "ACTIVE");
      if (active) {
        setSelectedSprintId(String(active.id));
      } else {
        setSelectedSprintId(String(sprints[0].id));
      }
    }
  }, [sprints, selectedSprintId]);

  const selectedSprint = sprints?.find((s) => String(s.id) === selectedSprintId);
  
  // Kanban tasks: belong to selected sprint
  const kanbanTasks = selectedSprint ? localTasks.filter((t) => String(t.sprintId) === String(selectedSprint.id)) : [];
  


  // Backlog tasks: don't belong to ANY sprint (strict backlog)
  const rawBacklogTasks = useMemo(() => localTasks.filter((t) => !t.sprintId), [localTasks]);
  const backlogTasks = useMemo(() => sortBacklogTasks(rawBacklogTasks), [rawBacklogTasks]);

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
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTaskId) return;

    const task = localTasks.find((t) => t.id === draggedTaskId);
    setDraggedTaskId(null);
    if (!task) return;

    try {
      if (targetId === "BACKLOG") {
        // Move to backlog
        if (task.sprintId) {
          setLocalTasks(prev => {
            const filtered = prev.filter(t => t.id !== task.id);
            return [...filtered, { ...task, sprintId: null, status: "TODO", assigneeId: "", assignee: undefined as any }];
          });
          await taskApi.update(task.id, { sprintId: null, status: "TODO" });
          await taskApi.updateAssignee(task.id, "");
          onTaskUpdated();
        }
      } else {
        // Move to kanban column
        if (!selectedSprint) {
          alert("Vui lòng chọn một Sprint trước khi kéo task vào Kanban board!");
          return;
        }
        
        const newStatus = targetId as EnrichedTask["status"];
        if (String(task.sprintId) !== String(selectedSprint.id) || toWorkflowTaskStatus(task.status) !== targetId) {
          setLocalTasks(prev => {
            const filtered = prev.filter(t => t.id !== task.id);
            const updatedTask = { ...task, sprintId: String(selectedSprint.id), status: newStatus };
            if (viewerId) {
              updatedTask.assigneeId = viewerId;
              updatedTask.assignee = { 
                ...(task.assignee || {}),
                id: viewerId, 
                name: task.assignee?.name || "Bạn",
                email: task.assignee?.email || "",
                role: task.assignee?.role || "MEMBER",
                roles: task.assignee?.roles || ["MEMBER"],
                title: task.assignee?.title || "",
                initials: task.assignee?.initials || "B",
                presence: task.assignee?.presence || "online",
                capacityHours: task.assignee?.capacityHours || 40,
                workloadHours: task.assignee?.workloadHours || 0,
                focusScore: task.assignee?.focusScore || 100,
                isActive: task.assignee?.isActive ?? true,
                status: task.assignee?.status || "ACTIVE",
              };
            }
            return [...filtered, updatedTask];
          });
          
          await taskApi.update(task.id, { sprintId: String(selectedSprint.id), status: newStatus });
          if (viewerId) {
            await taskApi.updateAssignee(task.id, viewerId);
          }
          onTaskUpdated();
        }
      }
    } catch (err: unknown) {
      setLocalTasks(tasks); // Revert on error
      alert(err instanceof Error ? err.message : "Lỗi khi di chuyển task");
    }
  };

  const renderTaskCard = (task: EnrichedTask, isBacklog = false) => (
    <div
      key={task.id}
      id={`kanban-task-${task.id}`}
      draggable
      onDragStart={(e) => handleDragStart(e, task.id)}
      onDragEnd={handleDragEnd}
      onClick={() => onTaskClick(task.id)}
      className={`${styles.kanbanCard} ${draggedTaskId === task.id ? styles.dragging : ""} ${highlightTaskId === String(task.id) ? styles.highlightFlash : ""}`}
      style={{ backgroundColor: isBacklog ? "var(--surface-strong)" : getTaskBgColor(task.status) }}
    >
      <div className={styles.cardHeader}>
        <span className={styles.taskKey}>{task.key}</span>
        <StatusPill
          label={taskPriorityLabel(task.priority)}
          tone={task.priority === "CRITICAL" ? "critical" : task.priority === "HIGH" ? "watch" : "neutral"}
        />
      </div>
      
      <div className={styles.taskTitle}>{task.title}</div>
      
      <div className={styles.cardFooter}>
        <div>
          {!isBacklog && (task.assignee ? (
            <div 
              className={styles.assigneeAvatar} 
              title={task.assignee.name}
              style={{
                background: task.assignee.avatarUrl ? "transparent" : "var(--accent)",
                overflow: "hidden"
              }}
            >
              {task.assignee.avatarUrl ? (
                <img src={task.assignee.avatarUrl} alt={task.assignee.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                task.assignee.name.charAt(0).toUpperCase()
              )}
            </div>
          ) : (
            <div className={styles.unassignedAvatar} title="Chưa phân công">?</div>
          ))}
        </div>
        {task.dueDate && (
          <div className={`${styles.dueDate} ${new Date(task.dueDate) < new Date() && task.status !== "DONE" ? styles.overdue : ""}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {new Date(task.dueDate).toLocaleDateString("vi-VN")}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.splitViewContainer}>
      {/* Left Panel: Kanban */}
      <div className={styles.kanbanPanel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>
            Kanban Board
          </h2>
          {sprints && sprints.length > 0 && (
            <div style={{ width: "220px" }}>
              <FilterSelect
                value={selectedSprintId || ""}
                onChange={(val) => setSelectedSprintId(val)}
                options={sprints.map((s): FilterOption => {
                  const status = s.status?.toUpperCase() || "";
                  return {
                    value: String(s.id),
                    label: `${s.name} ${status === "ACTIVE" ? "(Active)" : status === "PLANNING" ? "(Planning)" : "(Closed)"}`
                  };
                })}
                placeholder="-- Chọn Sprint --"
              />
            </div>
          )}
        </div>

        {!selectedSprint && sprints !== undefined && sprints.length === 0 && (
          <div className={styles.noSprintWarning}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>Dự án chưa có Sprint nào. Bạn có thể sử dụng nút Tạo Sprint mới ở góc phải để bắt đầu.</span>
            </div>
          </div>
        )}

        <div className={`${styles.kanbanWrapper} ${draggedTaskId ? styles.isDragging : ""}`}>
          {KANBAN_COLUMNS.map((col) => {
            const columnTasks = kanbanTasks.filter((t) => toWorkflowTaskStatus(t.status) === col.id);
            return (
                <div
                  key={col.id}
                  className={`${styles.kanbanColumn} ${dragOverColumn === col.id ? styles.dragOver : ""}`}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                >
                  <div className={styles.columnHeader}>
                    <h3 className={styles.columnTitle}>{col.label}</h3>
                    <span className={styles.columnCount}>{columnTasks.length}</span>
                  </div>

                  {columnTasks.map((task) => renderTaskCard(task, false))}
                  
                  {columnTasks.length === 0 && (
                    <div className={styles.emptyState}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>Kéo thả công việc vào đây</span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Right Panel: Backlog Sidebar */}
      <div className={styles.backlogSidebar}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Backlog</h2>
          <span className={styles.columnCount}>{backlogTasks.length}</span>
        </div>
        
        <div 
          className={`${styles.backlogContainer} ${dragOverColumn === "BACKLOG" ? styles.dragOver : ""} ${draggedTaskId ? styles.isDragging : ""}`}
          onDragOver={(e) => handleDragOver(e, "BACKLOG")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "BACKLOG")}
        >
          {backlogTasks.map((task) => renderTaskCard(task, true))}
          
          {backlogTasks.length === 0 && (
            <div className={styles.emptyState}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              <span>Backlog trống</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
