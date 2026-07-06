"use client";

import { useEffect, useState, type FormEvent } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import {
  EmptyState,
  ProgressBar,
  SegmentBar,
  StatusPill,
  Surface,
} from "@/components/ui";
import { logworkApi, projectApi, sprintApi, taskApi, userApi, workspaceApi } from "@/services/api";
import {
  categorizeTask,
  DEMO_TODAY,
  getProjectManager,
  isPrivilegedUser,
  isTaskOverdue,
  normalizeViewer,
} from "@/lib/mock/permissions";
import {
  formatDate,
  formatDateTime,
  formatHours,
  formatRange,
  healthToneLabel,
  roleLabel,
  sprintStatusLabel,
  taskPriorityLabel,
  taskStatusLabel,
} from "@/lib/utils/format";
import { useAuthSession } from "@/hooks/use-session";
import type {
  EnrichedTask,
  LogworkEntry,
  Project,
  Sprint,
  TaskAttachment,
  TaskComment,
  TaskStatus,
  UserProfile,
  WorkspaceShellData,
} from "@/types";

type SprintPageState = {
  shellData: WorkspaceShellData;
  projects: Project[];
  sprints: Sprint[];
  tasks: EnrichedTask[];
  users: UserProfile[];
  entries: LogworkEntry[];
};

function buildTaskKey(projectCode: string, totalTasks: number) {
  const suffix = String(totalTasks + 101).padStart(3, "0");
  return `${projectCode.replace("FP-", "FP-")}-${suffix}`;
}

function boardStatus(task: EnrichedTask) {
  if (task.status === "DONE") {
    return "DONE";
  }

  if (task.status === "TODO") {
    return "TODO";
  }

  return "IN_PROGRESS";
}

function canEditLogwork(viewer: UserProfile, entry: LogworkEntry) {
  return viewer.role !== "MEMBER" || entry.userId === viewer.id;
}

export default function SprintsPage() {
  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);
  const canManage = isPrivilegedUser(viewer);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");
  const [sprintFormError, setSprintFormError] = useState<string | null>(null);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [editingLogworkId, setEditingLogworkId] = useState<string | null>(null);
  const [logworkDate, setLogworkDate] = useState(DEMO_TODAY);
  const [logworkHours, setLogworkHours] = useState("2");
  const [logworkNote, setLogworkNote] = useState("");
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [sprintName, setSprintName] = useState("");
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintStart, setSprintStart] = useState("2026-07-01");
  const [sprintEnd, setSprintEnd] = useState("2026-07-14");
  const [sprintProjectId, setSprintProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("2026-07-04");
  const [taskEstimateHours, setTaskEstimateHours] = useState("6");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskPriority, setTaskPriority] = useState<EnrichedTask["priority"]>("HIGH");
  const [pageState, setPageState] = useState<SprintPageState | null>(null);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);

  useEffect(() => {
    let isCancelled = false;

    async function loadBaseData() {
      const [{ data: shellData }, { data: projects }, { data: sprints }, { data: tasks }, { data: users }, { data: entries }] =
        await Promise.all([
          workspaceApi.getShellData(viewer),
          projectApi.list(undefined, viewer),
          sprintApi.list(undefined, viewer),
          taskApi.getEnrichedBoard(undefined, viewer),
          userApi.list(viewer),
          logworkApi.list(undefined, viewer),
        ]);

      if (isCancelled) {
        return;
      }

      setPageState({ shellData, projects, sprints, tasks, users, entries });
      setSelectedSprintId((current) => current ?? sprints[0]?.id ?? null);
      setSprintProjectId((current) => current || projects[0]?.id || "");
      setTaskAssigneeId((current) => current || users[0]?.id || viewer.id);
    }

    void loadBaseData();

    return () => {
      isCancelled = true;
    };
  }, [viewer]);

  const shellData =
    pageState?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  const projectList = pageState?.projects ?? [];
  const sprintList = pageState?.sprints ?? [];
  const taskList = pageState?.tasks ?? [];
  const users = pageState?.users ?? [];
  const entries = pageState?.entries ?? [];

  const selectedSprint = sprintList.find((sprint) => sprint.id === selectedSprintId) ?? sprintList[0] ?? null;
  const selectedProject = projectList.find((project) => project.id === selectedSprint?.projectId) ?? null;

  const sprintTasks = selectedSprint ? taskList.filter((task) => task.sprintId === selectedSprint.id) : [];
  const filteredTasks = sprintTasks.filter((task) => {
    if (statusFilter !== "ALL" && task.status !== statusFilter) {
      return false;
    }

    if (assigneeFilter !== "ALL" && task.assigneeId !== assigneeFilter) {
      return false;
    }

    return true;
  });
  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId) ?? sprintTasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? sprintTasks[0] ?? null;
  const selectedTaskLogwork = selectedTask ? entries.filter((entry) => entry.taskId === selectedTask.id) : [];
  const activeTaskId = selectedTask?.id ?? null;

  useEffect(() => {
    if (!activeTaskId) {
      return;
    }

    let isCancelled = false;

    async function loadTaskContext() {
      const [{ data: comments }, { data: attachments }] = await Promise.all([
        taskApi.listComments(activeTaskId, viewer),
        taskApi.getAttachments(activeTaskId, viewer),
      ]);

      if (isCancelled) {
        return;
      }

      setTaskComments(comments);
      setTaskAttachments(attachments);
    }

    void loadTaskContext();

    return () => {
      isCancelled = true;
    };
  }, [activeTaskId, viewer]);

  async function refreshPage(nextSprintId?: string | null, nextTaskId?: string | null) {
    const [{ data: shellData }, { data: projects }, { data: sprints }, { data: tasks }, { data: users }, { data: entries }] =
      await Promise.all([
        workspaceApi.getShellData(viewer),
        projectApi.list(undefined, viewer),
        sprintApi.list(undefined, viewer),
        taskApi.getEnrichedBoard(undefined, viewer),
        userApi.list(viewer),
        logworkApi.list(undefined, viewer),
      ]);

    setPageState({ shellData, projects, sprints, tasks, users, entries });
    setSelectedSprintId(nextSprintId ?? selectedSprintId ?? sprints[0]?.id ?? null);
    setSelectedTaskId(nextTaskId ?? selectedTaskId ?? null);
  }

  async function handleCreateSprint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSprintFormError(null);

    if (!sprintName.trim() || !sprintGoal.trim() || !sprintProjectId || !sprintStart || !sprintEnd) {
      setSprintFormError("Tên sprint, mục tiêu, dự án, ngày bắt đầu và ngày kết thúc là bắt buộc.");
      return;
    }

    if (sprintEnd < sprintStart) {
      setSprintFormError("Ngày kết thúc sprint phải sau ngày bắt đầu.");
      return;
    }

    const created = await sprintApi.create({
      projectId: sprintProjectId,
      name: sprintName.trim(),
      goal: sprintGoal.trim(),
      status: "PLANNED",
      progress: 0,
      committedPoints: 0,
      completedPoints: 0,
      plannedStart: sprintStart,
      plannedEnd: sprintEnd,
      health: "on-track",
      focusAreas: ["Goal alignment", "Task readiness", "Resource allocation"],
    });

    setSprintName("");
    setSprintGoal("");
    await refreshPage(created.data.id);
    setNotice(`Đã tạo sprint ${created.data.name}.`);
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskFormError(null);

    if (!selectedSprint || !selectedProject) {
      setTaskFormError("Cần chọn một sprint trước khi tạo task.");
      return;
    }

    if (!taskTitle.trim() || !taskDescription.trim() || !taskDueDate || !taskAssigneeId || !taskEstimateHours) {
      setTaskFormError("Mã sprint, tiêu đề, mô tả, hạn chót và thời gian ước tính là bắt buộc.");
      return;
    }

    if (taskDueDate < selectedSprint.plannedStart || taskDueDate > selectedSprint.plannedEnd) {
      setTaskFormError("Hạn chót task nên nằm trong khoảng thời gian của sprint.");
      return;
    }

    const created = await taskApi.create({
      key: buildTaskKey(selectedProject.code, taskList.length),
      projectId: selectedProject.id,
      sprintId: selectedSprint.id,
      parentTaskId: null,
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      status: "TODO",
      priority: taskPriority,
      assigneeId: taskAssigneeId,
      reporterId: viewer.id,
      dueDate: taskDueDate,
      estimateHours: Number(taskEstimateHours),
      spentHours: 0,
      tags: ["sprint"],
      blockers: [],
      commentsCount: 0,
      lastActivity: `${DEMO_TODAY}T12:00:00Z`,
    });

    setTaskTitle("");
    setTaskDescription("");
    setTaskEstimateHours("6");
    await refreshPage(selectedSprint.id, created.data.id);
    setNotice(`Đã tạo task ${created.data.key} và gán cho thành viên.`);
  }

  async function handleUpdateAssignee(taskId: string, assigneeId: string) {
    await taskApi.updateAssignee(taskId, assigneeId);
    await refreshPage(selectedSprint?.id, taskId);
    setNotice("Đã cập nhật người phụ trách task.");
  }

  async function handleStatusDrop(nextStatus: TaskStatus) {
    if (!dragTaskId) {
      return;
    }

    await taskApi.updateStatus(dragTaskId, nextStatus);
    await refreshPage(selectedSprint?.id, dragTaskId);
    setDragTaskId(null);
  }

  async function handleAddComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTask || !commentDraft.trim()) {
      return;
    }

    await taskApi.addComment({
      taskId: selectedTask.id,
      userId: viewer.id,
      content: commentDraft.trim(),
    });

    setCommentDraft("");
    const { data: comments } = await taskApi.listComments(selectedTask.id, viewer);
    setTaskComments(comments);
  }

  async function handleSaveComment(commentId: string) {
    if (!editingCommentText.trim()) {
      return;
    }

    await taskApi.updateComment(commentId, editingCommentText.trim());

    if (selectedTask) {
      const { data: comments } = await taskApi.listComments(selectedTask.id, viewer);
      setTaskComments(comments);
    }

    setEditingCommentId(null);
    setEditingCommentText("");
  }

  async function handleSubmitLogwork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTask || !logworkDate || !logworkHours || !logworkNote.trim()) {
      return;
    }

    if (logworkDate > DEMO_TODAY) {
      setNotice("Ngày logwork không được lớn hơn ngày hiện tại của demo.");
      return;
    }

    if (editingLogworkId) {
      await logworkApi.update(editingLogworkId, {
        date: logworkDate,
        hours: Number(logworkHours),
        note: logworkNote.trim(),
      });
      setNotice("Đã cập nhật logwork.");
    } else {
      await logworkApi.create({
        taskId: selectedTask.id,
        userId: viewer.id,
        date: logworkDate,
        hours: Number(logworkHours),
        note: logworkNote.trim(),
        mood: "smooth",
      });
      setNotice("Đã ghi nhận logwork mới.");
    }

    setEditingLogworkId(null);
    setLogworkDate(DEMO_TODAY);
    setLogworkHours("2");
    setLogworkNote("");
    await refreshPage(selectedSprint?.id, selectedTask.id);
  }

  async function handleDeleteLogwork(entryId: string) {
    await logworkApi.remove(entryId);
    await refreshPage(selectedSprint?.id, selectedTask?.id);
    setNotice("Đã xóa logwork.");
  }

  const sprintTaskSegments = [
    {
      label: "To do",
      value: sprintTasks.filter((task) => categorizeTask(task) === "TODO").length,
      tone: "todo" as const,
    },
    {
      label: "In Progress",
      value: sprintTasks.filter((task) => categorizeTask(task) === "IN_PROGRESS").length,
      tone: "progress" as const,
    },
    {
      label: "Done",
      value: sprintTasks.filter((task) => categorizeTask(task) === "DONE").length,
      tone: "done" as const,
    },
    {
      label: "Outdate",
      value: sprintTasks.filter((task) => categorizeTask(task) === "OUTDATE").length,
      tone: "outdate" as const,
    },
  ];

  const sprintCompletion = sprintTasks.length
    ? Math.round((sprintTasks.filter((task) => task.status === "DONE").length / sprintTasks.length) * 100)
    : selectedSprint?.progress ?? 0;

  const boardColumns: Array<{ label: string; key: "TODO" | "IN_PROGRESS" | "DONE"; status: TaskStatus }> = [
    { label: "Cần làm", key: "TODO", status: "TODO" },
    { label: "Đang tiến hành", key: "IN_PROGRESS", status: "IN_PROGRESS" },
    { label: "Đã hoàn thành", key: "DONE", status: "DONE" },
  ];

  return (
    <WorkspaceShell
      shellData={shellData}
      heading={canManage ? "Điều hành sprint" : "Sprint của tôi"}
      subheading={
        canManage
          ? "Thiết lập sprint, quản lí task, theo dõi Kanban, thảo luận và logwork ngay trong cùng một luồng."
          : "Chỉ hiển thị những sprint và task bạn trực tiếp tham gia."
      }
      highlightLabel="Sprint active"
      highlightValue={`${sprintList.filter((sprint) => sprint.status === "ACTIVE").length}`}
    >
      {notice ? (
        <div className="scope-banner">
          <div>
            <strong>Thông báo thao tác</strong>
            <p>{notice}</p>
          </div>
          <button type="button" className="text-button" onClick={() => setNotice(null)}>
            Ẩn
          </button>
        </div>
      ) : null}

      <section className="two-up">
        <Surface title="Danh sách sprint" kicker="Sprint list">
          {sprintList.length ? (
            <div className="stack-list">
              {sprintList.map((sprint) => (
                <button
                  key={sprint.id}
                  type="button"
                  className={`selection-card ${selectedSprint?.id === sprint.id ? "selection-card-active" : ""}`}
                  onClick={() => {
                    setSelectedSprintId(sprint.id);
                    setSelectedTaskId(null);
                  }}
                >
                  <div className="selection-card-head">
                    <div>
                      <strong>{sprint.name}</strong>
                      <p>{sprintStatusLabel(sprint.status)}</p>
                    </div>
                    <StatusPill label={healthToneLabel(sprint.health)} tone={sprint.health} />
                  </div>
                  <ProgressBar value={sprint.progress} label={formatRange(sprint.plannedStart, sprint.plannedEnd)} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="Chưa có sprint" description="Hãy tạo sprint mới để bắt đầu phân rã task và logwork." />
          )}
        </Surface>

        {canManage ? (
          <Surface title="Thiết lập sprint mới" kicker="Sprint setup">
            <form className="surface-form" onSubmit={handleCreateSprint}>
              <div className="form-grid">
                <label>
                  <span>Tên sprint</span>
                  <input value={sprintName} onChange={(event) => setSprintName(event.target.value)} required />
                </label>
                <label>
                  <span>Dự án</span>
                  <select value={sprintProjectId} onChange={(event) => setSprintProjectId(event.target.value)} required>
                    <option value="">Chọn dự án</option>
                    {projectList.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-grid-span">
                  <span>Mục tiêu trọng tâm</span>
                  <textarea value={sprintGoal} onChange={(event) => setSprintGoal(event.target.value)} rows={3} required />
                </label>
                <label>
                  <span>Ngày bắt đầu</span>
                  <input type="date" value={sprintStart} onChange={(event) => setSprintStart(event.target.value)} required />
                </label>
                <label>
                  <span>Ngày kết thúc</span>
                  <input type="date" value={sprintEnd} onChange={(event) => setSprintEnd(event.target.value)} required />
                </label>
              </div>
              {sprintFormError ? <p className="form-error">{sprintFormError}</p> : null}
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  Tạo sprint
                </button>
              </div>
            </form>
          </Surface>
        ) : (
          <Surface title="Phạm vi thành viên" kicker="Member scope">
            <div className="privacy-panel">
              <strong>Bạn chỉ thấy sprint mình tham gia.</strong>
              <p>Danh sách thành viên, cấu hình sprint và task của người khác đang được ẩn để đúng phạm vi vai trò.</p>
            </div>
          </Surface>
        )}
      </section>

      {selectedSprint ? (
        <>
          <section className="two-up">
            <Surface
              title={`Chi tiết ${selectedSprint.name}`}
              kicker={selectedProject?.code ?? "Sprint detail"}
              aside={<StatusPill label={healthToneLabel(selectedSprint.health)} tone={selectedSprint.health} />}
            >
              <p>{selectedSprint.goal}</p>
              <ProgressBar value={selectedSprint.progress} label="Tiến độ sprint" />
              <div className="token-row">
                {selectedSprint.focusAreas.map((area) => (
                  <span key={area} className="soft-token">
                    {area}
                  </span>
                ))}
              </div>
              <div className="summary-grid">
                <div className="summary-card">
                  <span>Thời gian</span>
                  <strong>{formatRange(selectedSprint.plannedStart, selectedSprint.plannedEnd)}</strong>
                </div>
                <div className="summary-card">
                  <span>Điểm công việc</span>
                  <strong>{selectedSprint.completedPoints}/{selectedSprint.committedPoints}</strong>
                </div>
                <div className="summary-card">
                  <span>Quản lý dự án</span>
                  <strong>{selectedProject ? getProjectManager(selectedProject).name : "-"}</strong>
                </div>
              </div>
            </Surface>

            <Surface title="Đánh giá & nghiệm thu sprint" kicker="Acceptance">
              <ProgressBar value={sprintCompletion} label="Tỷ lệ task hoàn thành thực tế" />
              <SegmentBar segments={sprintTaskSegments} />
              <div className="stack-list compact">
                <div className="line-item compact-line">
                  <span>Task tồn đọng</span>
                  <strong>{sprintTasks.filter((task) => task.status !== "DONE").length}</strong>
                </div>
                <div className="line-item compact-line">
                  <span>Task quá hạn</span>
                  <strong>{sprintTasks.filter((task) => isTaskOverdue(task)).length}</strong>
                </div>
                <div className="line-item compact-line">
                  <span>Cảnh báo hạn chót</span>
                  <strong>{sprintTasks.some((task) => isTaskOverdue(task)) ? "Cần xử lý ngay" : "Đang ổn định"}</strong>
                </div>
              </div>
            </Surface>
          </section>

          {canManage ? (
            <Surface title="Tạo task mới" kicker="Task setup">
              <form className="surface-form" onSubmit={handleCreateTask}>
                <div className="form-grid">
                  <label>
                    <span>Tiêu đề</span>
                    <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required />
                  </label>
                  <label>
                    <span>Người phụ trách</span>
                    <select value={taskAssigneeId} onChange={(event) => setTaskAssigneeId(event.target.value)} required>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} - {roleLabel(user.role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-grid-span">
                    <span>Mô tả</span>
                    <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} rows={4} required />
                  </label>
                  <label>
                    <span>Hạn chót</span>
                    <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} required />
                  </label>
                  <label>
                    <span>Ước tính (giờ)</span>
                    <input type="number" min="1" value={taskEstimateHours} onChange={(event) => setTaskEstimateHours(event.target.value)} required />
                  </label>
                  <label>
                    <span>Mức ưu tiên</span>
                    <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as EnrichedTask["priority"])}>
                      <option value="MEDIUM">Trung bình</option>
                      <option value="HIGH">Cao</option>
                      <option value="CRITICAL">Khẩn cấp</option>
                    </select>
                  </label>
                </div>
                {taskFormError ? <p className="form-error">{taskFormError}</p> : null}
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    Tạo task
                  </button>
                </div>
              </form>
            </Surface>
          ) : null}

          <Surface title="Danh sách công việc & bộ lọc" kicker="Task list">
            <div className="filter-row">
              <label>
                <span>Trạng thái</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "ALL")}>
                  <option value="ALL">Tất cả</option>
                  <option value="TODO">Cần thực hiện</option>
                  <option value="IN_PROGRESS">Đang xử lý</option>
                  <option value="REVIEW">Chờ rà soát</option>
                  <option value="BLOCKED">Đang vướng</option>
                  <option value="DONE">Hoàn thành</option>
                </select>
              </label>
              <label>
                <span>Người phụ trách</span>
                <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                  <option value="ALL">Tất cả</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filteredTasks.length ? (
              <div className="table-like">
                {filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className={`table-row table-row-button ${selectedTask?.id === task.id ? "table-row-button-active" : ""}`}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <span>{task.key}</span>
                    <strong>{task.title}</strong>
                    <p>{taskStatusLabel(task.status)}</p>
                    {canManage ? (
                      <select
                        value={task.assigneeId}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => void handleUpdateAssignee(task.id, event.target.value)}
                      >
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{task.assignee.name}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="Không có task phù hợp bộ lọc" description="Thử đổi sprint, trạng thái hoặc người phụ trách để xem danh sách khác." />
            )}
          </Surface>

          <Surface title="Bảng Kanban" kicker="Drag and drop">
            <div className="kanban-board sprint-kanban-board">
              {boardColumns.map((column) => (
                <div
                  key={column.key}
                  className="kanban-column"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void handleStatusDrop(column.status)}
                >
                  <div className="kanban-column-header">
                    <strong>{column.label}</strong>
                    <span>{filteredTasks.filter((task) => boardStatus(task) === column.key).length}</span>
                  </div>
                  {filteredTasks
                    .filter((task) => boardStatus(task) === column.key)
                    .map((task) => (
                      <article
                        key={task.id}
                        className="task-card"
                        draggable
                        onDragStart={() => setDragTaskId(task.id)}
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        <div className="task-topline">
                          <strong>{task.key}</strong>
                          <StatusPill
                            label={taskPriorityLabel(task.priority)}
                            tone={task.priority === "CRITICAL" ? "critical" : task.priority === "HIGH" ? "watch" : "neutral"}
                          />
                        </div>
                        <h3>{task.title}</h3>
                        <p>{task.description}</p>
                        <div className="task-meta">
                          <span>{task.assignee.name}</span>
                          <span>{formatDate(task.dueDate)}</span>
                        </div>
                        {isTaskOverdue(task) ? <span className="deadline-flag">Quá hạn</span> : null}
                      </article>
                    ))}
                </div>
              ))}
            </div>
          </Surface>

          {selectedTask ? (
            <section className="two-up">
              <Surface title={`Chi tiết ${selectedTask.key}`} kicker="Task detail">
                <div className="detail-panel detail-panel-spaced">
                  <div>
                    <strong>{selectedTask.title}</strong>
                    <p>{selectedTask.description}</p>
                  </div>
                  <div className="summary-grid">
                    <div className="summary-card">
                      <span>Người phụ trách</span>
                      <strong>{selectedTask.assignee.name}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Trạng thái</span>
                      <strong>{taskStatusLabel(selectedTask.status)}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Hạn chót</span>
                      <strong>{formatDate(selectedTask.dueDate)}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Ước tính</span>
                      <strong>{formatHours(selectedTask.estimateHours)}</strong>
                    </div>
                  </div>

                  <div className="attachment-list">
                    <strong>Đính kèm</strong>
                    {taskAttachments.length ? (
                      taskAttachments.map((attachment) => (
                        <div key={attachment.id} className="line-item compact-line">
                          <span>{attachment.fileName}</span>
                          <strong>{attachment.sizeLabel}</strong>
                        </div>
                      ))
                    ) : (
                      <p>Chưa có tệp đính kèm cho task này.</p>
                    )}
                  </div>

                  <div className="attachment-list">
                    <strong>Lịch sử trạng thái</strong>
                    <div className="line-item compact-line">
                      <span>Tạo task</span>
                      <strong>{formatDateTime(selectedTask.lastActivity)}</strong>
                    </div>
                    <div className="line-item compact-line">
                      <span>Trạng thái hiện tại</span>
                      <strong>{taskStatusLabel(selectedTask.status)}</strong>
                    </div>
                  </div>
                </div>
              </Surface>

              <Surface title="Thảo luận task" kicker="Comments">
                <form className="surface-form" onSubmit={handleAddComment}>
                  <label>
                    <span>Nội dung bình luận</span>
                    <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} rows={3} />
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="secondary-button">
                      Gửi bình luận
                    </button>
                  </div>
                </form>
                <div className="stack-list">
                  {taskComments.map((comment) => {
                    const author = users.find((user) => user.id === comment.userId) ?? viewer;

                    return (
                      <article key={comment.id} className="comment-card">
                        <div className="comment-card-head">
                          <div>
                            <strong>{author.name}</strong>
                            <p>{formatDateTime(comment.updatedAt ?? comment.createdAt)}</p>
                          </div>
                          {comment.userId === viewer.id ? (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                setEditingCommentId(comment.id);
                                setEditingCommentText(comment.content);
                              }}
                            >
                              Sửa
                            </button>
                          ) : null}
                        </div>

                        {editingCommentId === comment.id ? (
                          <div className="inline-editor">
                            <textarea value={editingCommentText} onChange={(event) => setEditingCommentText(event.target.value)} rows={3} />
                            <div className="form-actions">
                              <button type="button" className="secondary-button" onClick={() => void handleSaveComment(comment.id)}>
                                Lưu
                              </button>
                              <button type="button" className="text-button" onClick={() => setEditingCommentId(null)}>
                                Hủy
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p>{comment.content}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </Surface>
            </section>
          ) : null}

          {selectedTask ? (
            <Surface title="Logwork" kicker="Create / update / delete">
              <section className="detail-grid">
                <form className="surface-form" onSubmit={handleSubmitLogwork}>
                  <div className="form-grid">
                    <label>
                      <span>Ngày làm việc</span>
                      <input type="date" value={logworkDate} onChange={(event) => setLogworkDate(event.target.value)} required />
                    </label>
                    <label>
                      <span>Số giờ thực tế</span>
                      <input type="number" min="0.5" step="0.5" value={logworkHours} onChange={(event) => setLogworkHours(event.target.value)} required />
                    </label>
                    <label className="form-grid-span">
                      <span>Ghi chú ngắn</span>
                      <textarea value={logworkNote} onChange={(event) => setLogworkNote(event.target.value)} rows={3} required />
                    </label>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="primary-button">
                      {editingLogworkId ? "Cập nhật logwork" : "Ghi nhận logwork"}
                    </button>
                  </div>
                </form>

                <div className="detail-panel">
                  <strong>Nhật ký đã ghi</strong>
                  {selectedTaskLogwork.length ? (
                    <div className="table-like">
                      {selectedTaskLogwork.map((entry) => (
                        <div key={entry.id} className="table-row">
                          <span>{formatDate(entry.date)}</span>
                          <strong>{formatHours(entry.hours)}</strong>
                          <p>{entry.note}</p>
                          {canEditLogwork(viewer, entry) ? (
                            <div className="inline-actions">
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => {
                                  setEditingLogworkId(entry.id);
                                  setLogworkDate(entry.date);
                                  setLogworkHours(String(entry.hours));
                                  setLogworkNote(entry.note);
                                }}
                              >
                                Sửa
                              </button>
                              <button type="button" className="text-button text-button-danger" onClick={() => void handleDeleteLogwork(entry.id)}>
                                Xóa
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Chưa có logwork" description="Người dùng có thể ghi nhận giờ làm và cập nhật lại ngay trong cửa sổ này." />
                  )}
                </div>
              </section>
            </Surface>
          ) : null}
        </>
      ) : null}
    </WorkspaceShell>
  );
}
