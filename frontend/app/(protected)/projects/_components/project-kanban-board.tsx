import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { taskApi, sprintApi } from "@/services/api";
import { EnrichedTask, Sprint } from "@/types";
import { StatusPill } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { LoadingState } from "@/components/loading-state";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { taskPriorityLabel, toWorkflowTaskStatus, getTaskBgColor } from "@/lib/utils/format";
import styles from "./project-kanban-board.module.css";

interface ProjectKanbanBoardProps {
  tasks: EnrichedTask[];
  sprints?: Sprint[];
  selectedSprintId?: string | null;
  viewerId: string;
  onTaskUpdated: () => void;
  onTaskClick: (taskId: string) => void;
  onSelectedSprintIdChange?: (sprintId: string | null) => void;
  onSprintUpdated?: () => void;
  onEditSprint?: (sprintId: string) => void;
  isLoading?: boolean;
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

const PRIORITY_WEIGHT: Record<string, number> = {
  "CRITICAL": 4,
  "HIGH": 3,
  "MEDIUM": 2,
  "LOW": 1,
};

function normalizeSprintStatus(status?: string) {
  const normalized = status?.trim().toUpperCase();

  if (normalized === "PLANNED" || normalized === "PLANNING") {
    return "PLANNED";
  }

  if (normalized === "ACTIVE") {
    return "ACTIVE";
  }

  if (normalized === "CLOSED" || normalized === "DONE" || normalized === "COMPLETED") {
    return "CLOSED";
  }

  return normalized ?? "";
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

  // Sort root tasks by priority, then topic & title
  rootTasks.sort((a, b) => {
    const weightA = PRIORITY_WEIGHT[a.priority] || 0;
    const weightB = PRIORITY_WEIGHT[b.priority] || 0;
    if (weightA !== weightB) {
      return weightB - weightA; // Higher priority first
    }

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
    children.sort((a, b) => {
      const weightA = PRIORITY_WEIGHT[a.priority] || 0;
      const weightB = PRIORITY_WEIGHT[b.priority] || 0;
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      return a.title.localeCompare(b.title, "vi", { numeric: true, sensitivity: "base" });
    });
    children.forEach(addWithChildren);
  }

  rootTasks.forEach(addWithChildren);

  return result;
}

export function ProjectKanbanBoard({
  tasks,
  sprints,
  selectedSprintId: selectedSprintIdProp,
  viewerId,
  onTaskUpdated,
  onTaskClick,
  onSelectedSprintIdChange,
  onSprintUpdated,
  onEditSprint,
  isLoading = false,
}: ProjectKanbanBoardProps) {
  const { confirm } = useConfirmDialog();
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams.get("highlightTaskId");
  const highlightColor = searchParams.get("highlightColor") || "green";
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const [localTasks, setLocalTasks] = useState<EnrichedTask[]>(tasks);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const sortedTasks = [...tasks].sort((a, b) => {
      const weightA = PRIORITY_WEIGHT[a.priority] || 0;
      const weightB = PRIORITY_WEIGHT[b.priority] || 0;
      if (weightA !== weightB) {
        return weightB - weightA; // Higher priority first
      }
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(); // Newer activity first as secondary
    });
    setLocalTasks(sortedTasks);
  }, [tasks]);
  const selectedSprintId = selectedSprintIdProp ?? null;

  useEffect(() => {
    if (!highlightTaskId || localTasks.length === 0) return;

    const highlighted = localTasks.find((task) => String(task.id) === String(highlightTaskId));
    if (highlighted?.sprintId && selectedSprintId !== String(highlighted.sprintId)) {
      onSelectedSprintIdChange?.(String(highlighted.sprintId));
    }

    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`kanban-task-${highlightTaskId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 500);

    const clearTimer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("highlightTaskId");
      url.searchParams.delete("highlightColor");
      window.history.replaceState({}, "", url.pathname + url.search);
    }, 5000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightTaskId, localTasks, onSelectedSprintIdChange, selectedSprintId]);

  useEffect(() => {
    if (!selectedSprintId && sprints && sprints.length > 0) {
      const active = sprints.find((s) => normalizeSprintStatus(s.status) === "ACTIVE");
      const nextSprintId = active ? String(active.id) : String(sprints[0].id);
      onSelectedSprintIdChange?.(nextSprintId);
    }
  }, [onSelectedSprintIdChange, selectedSprintId, sprints]);

  const selectedSprint = sprints?.find((s) => String(s.id) === selectedSprintId);
  const selectedSprintStatus = normalizeSprintStatus(selectedSprint?.status);
  
  const handleUpdateSprintStatus = async (status: "ACTIVE" | "CLOSED") => {
    if (!selectedSprint) return;
    try {
      await sprintApi.update(String(selectedSprint.id), { status });
      if (onSprintUpdated) {
        onSprintUpdated();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Lỗi cập nhật Sprint");
    }
  };
  
  // Kanban tasks: belong to selected sprint
  const kanbanTasks = selectedSprint ? localTasks.filter((t) => String(t.sprintId) === String(selectedSprint.id)) : [];
  


  // Backlog tasks: don't belong to ANY sprint (strict backlog)
  const rawBacklogTasks = useMemo(() => localTasks.filter((t) => !t.sprintId), [localTasks]);
  const backlogTasks = useMemo(() => sortBacklogTasks(rawBacklogTasks), [rawBacklogTasks]);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    
    // Force the browser to use only this specific card as the ghost image
    if (e.currentTarget instanceof Element) {
      e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
    }
    
    // Defer state update to allow browser to capture drag ghost
    setTimeout(() => {
      setDraggedTaskId(taskId);
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (colId !== "BACKLOG" && selectedSprintStatus !== "ACTIVE") {
      e.dataTransfer.dropEffect = "none";
      if (dragOverColumn === colId) setDragOverColumn(null);
      return;
    }
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
            return [...filtered, { ...task, sprintId: null, status: "TODO", assigneeId: "" }];
          });
          await taskApi.update(task.id, { sprintId: null, status: "TODO" });
          await taskApi.updateAssignee(task.id, "");
          onTaskUpdated();
        }
      } else {
        // Move to kanban column
        if (!selectedSprint) {
          setErrorMessage("Vui lòng chọn một Sprint trước khi kéo task vào Kanban board!");
          return;
        }
        if (selectedSprintStatus !== "ACTIVE") {
          setErrorMessage("Chỉ có thể kéo task vào Kanban board khi Sprint đang ở trạng thái Active!");
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
      setErrorMessage(err instanceof Error ? err.message : "Lỗi khi di chuyển task");
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
      className={`${styles.kanbanCard} ${draggedTaskId === task.id ? styles.dragging : ""} ${highlightTaskId === String(task.id) ? (highlightColor === "red" ? styles.highlightFlashRed : styles.highlightFlash) : ""}`}
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
            <UserAvatar
              userId={task.assignee.id}
              email={task.assignee.email}
              name={task.assignee.name}
              avatarUrl={task.assignee.avatarUrl}
              size={28}
              className={styles.assigneeAvatar}
            />
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

  if (isLoading) {
    return (
      <div className={styles.splitViewContainer}>
        <div className={styles.kanbanPanel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Kanban Board</h2>
          </div>
          <LoadingState variant="cards" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.splitViewContainer}>
      {/* Left Panel: Kanban */}
      <div className={styles.kanbanPanel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>
            Kanban Board
          </h2>
          {sprints && sprints.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: "220px" }}>
                <FilterSelect
                  value={selectedSprintId || ""}
                  onChange={(val) => onSelectedSprintIdChange?.(val)}
                  options={sprints.map((s): FilterOption => {
                    const status = normalizeSprintStatus(s.status);
                    return {
                      value: String(s.id),
                      label: `${s.name} ${status === "ACTIVE" ? "(Active)" : status === "PLANNED" ? "(Planned)" : "(Closed)"}`
                    };
                  })}
                  placeholder="-- Chọn Sprint --"
                  onEditClick={(val) => {
                    if (onEditSprint) onEditSprint(val);
                  }}
                />
              </div>
              {selectedSprint && (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {selectedSprintStatus === "PLANNED" && (
                    <button 
                      type="button" 
                      className="primary-button" 
                      style={{ padding: "0.6rem 1.25rem", fontSize: "0.875rem" }}
                      onClick={() => handleUpdateSprintStatus("ACTIVE")}
                    >
                      Bắt đầu Sprint
                    </button>
                  )}
                  {selectedSprintStatus === "ACTIVE" && (
                    <button 
                      type="button" 
                      className="secondary-button" 
                      style={{ padding: "0.6rem 1.25rem", fontSize: "0.875rem", borderColor: "var(--critical)", color: "var(--critical)" }}
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: "Kết thúc Sprint",
                          message: "Bạn có chắc muốn hoàn thành Sprint này?",
                          confirmLabel: "Kết thúc",
                          tone: "danger",
                        });
                        if (confirmed) {
                          handleUpdateSprintStatus("CLOSED");
                        }
                      }}
                    >
                      Kết thúc Sprint
                    </button>
                  )}
                </div>
              )}
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

        {selectedSprint && selectedSprintStatus !== "ACTIVE" && (
          <div 
            className={styles.noSprintWarning} 
            style={{ 
              background: "#fef2f2", 
              color: "#991b1b", 
              borderColor: "#fecaca",
              opacity: draggedTaskId ? 1 : 0,
              maxHeight: draggedTaskId ? "100px" : "0",
              paddingTop: draggedTaskId ? "1rem" : "0",
              paddingBottom: draggedTaskId ? "1rem" : "0",
              marginTop: draggedTaskId ? "1rem" : "0",
              marginBottom: draggedTaskId ? "1rem" : "0",
              borderWidth: draggedTaskId ? "1px" : "0",
              overflow: "hidden",
              transition: "all 0.5s ease",
              transitionDelay: draggedTaskId ? "0s" : "0.75s"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>
                {selectedSprintStatus === "CLOSED"
                  ? "Sprint này đã đóng. Chỉ backlog mới có thể tiếp tục nhận task chưa hoàn thành."
                  : "Sprint này chưa được bắt đầu. Bạn không thể kéo thả task vào bảng Kanban."}
              </span>
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
                      <span>
                        {(draggedTaskId && selectedSprintStatus !== "ACTIVE")
                          ? (selectedSprintStatus === "CLOSED" ? "Sprint đã đóng" : "Sprint chưa bắt đầu")
                          : "Kéo thả công việc vào đây"}
                      </span>
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
      
      {errorMessage && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(2px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "1.5rem"
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "500px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            padding: "2rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--critical)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "var(--ink)" }}>Thông báo</h3>
            </div>
            <p style={{ margin: 0, fontSize: "1.05rem", color: "var(--foreground)", lineHeight: 1.5 }}>
              {errorMessage}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button 
                onClick={() => setErrorMessage(null)}
                style={{
                  padding: "0.6rem 1.5rem",
                  backgroundColor: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background-color 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--accent-strong)"}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = "var(--accent)"}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
