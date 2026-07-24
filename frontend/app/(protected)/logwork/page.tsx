"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { EmptyState, ProgressBar, StatCard, StatusPill, Surface } from "@/components/ui";
import { logworkApi, projectApi, taskApi, userApi, workspaceApi } from "@/services/api";
import {
  DEMO_TODAY,
  getLogworkTrackedUsers,
  normalizeViewer,
} from "@/lib/mock/permissions";
import { formatDate, formatHours, hasCompanywideProjectAccess } from "@/lib/utils/format";
import { useAuthSession } from "@/hooks/use-session";
import type { EnrichedTask, LogworkEntry, Project, UserProfile, WorkspaceShellData } from "@/types";

type LogworkPageState = {
  shellData: WorkspaceShellData;
  entries: LogworkEntry[];
  tasks: EnrichedTask[];
  users: UserProfile[];
  projects: Project[];
};

export default function LogworkPage() {
  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("ALL");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(DEMO_TODAY);
  const [entryHours, setEntryHours] = useState("2");
  const [entryNote, setEntryNote] = useState("");
  const [pageState, setPageState] = useState<LogworkPageState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadLogwork() {
      const [
        { data: shellData },
        { data: entries },
        { data: tasks },
        { data: users },
        { data: projects },
      ] = await Promise.all([
        workspaceApi.getShellData(viewer),
        logworkApi.list(undefined, viewer),
        taskApi.getEnrichedBoard(undefined, viewer),
        userApi.list(viewer),
        projectApi.list(undefined, viewer),
      ]);

      if (isCancelled) {
        return;
      }

      setPageState({ shellData, entries, tasks, users, projects });
    }

    void loadLogwork();

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

  const filteredTasks = useMemo(() => {
    const tasks = pageState?.tasks ?? [];

    return tasks.filter((task) => {
      if (selectedProjectId !== "ALL" && task.projectId !== selectedProjectId) {
        return false;
      }

      return true;
    });
  }, [pageState?.tasks, selectedProjectId]);

  const filteredEntries = useMemo(() => {
    return (pageState?.entries ?? []).filter((entry) => {
      const relatedTask = filteredTasks.find((task) => task.id === entry.taskId);

      if (!relatedTask) {
        return false;
      }

      if (selectedTaskId !== "ALL" && entry.taskId !== selectedTaskId) {
        return false;
      }

      return true;
    });
  }, [filteredTasks, pageState?.entries, selectedTaskId]);

  const todayEntries = filteredEntries.filter((entry) => entry.date === DEMO_TODAY);
  const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const trackedUsers = getLogworkTrackedUsers(viewer);
  const todayUserIds = new Set(todayEntries.map((entry) => entry.userId));
  const missingUsers = trackedUsers.filter((user) => !todayUserIds.has(user.id));
  const coverage = trackedUsers.length
    ? Math.round((todayUserIds.size / trackedUsers.length) * 100)
    : 0;
  const canManageScopedLogwork =
    hasCompanywideProjectAccess(viewer.role, viewer.department) ||
    (pageState?.projects ?? []).some((project) => project.managerId === viewer.id);

  async function refreshLogwork(nextTaskId?: string) {
    const [
      { data: shellData },
      { data: entries },
      { data: tasks },
      { data: users },
      { data: projects },
    ] = await Promise.all([
      workspaceApi.getShellData(viewer),
      logworkApi.list(undefined, viewer),
      taskApi.getEnrichedBoard(undefined, viewer),
      userApi.list(viewer),
      projectApi.list(undefined, viewer),
    ]);

    setPageState({ shellData, entries, tasks, users, projects });
    setSelectedTaskId(nextTaskId ?? selectedTaskId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedTaskId === "ALL" || !entryDate || !entryHours || !entryNote.trim()) {
      return;
    }

    if (editingEntryId) {
      await logworkApi.update(editingEntryId, {
        date: entryDate,
        hours: Number(entryHours),
        note: entryNote.trim(),
      });
    } else {
      await logworkApi.create({
        taskId: selectedTaskId,
        userId: viewer.id,
        date: entryDate,
        hours: Number(entryHours),
        note: entryNote.trim(),
        mood: "smooth",
      });
    }

    setEditingEntryId(null);
    setEntryDate(DEMO_TODAY);
    setEntryHours("2");
    setEntryNote("");
    await refreshLogwork(selectedTaskId);
  }

  async function handleRemove(entryId: string) {
    await logworkApi.remove(entryId);
    await refreshLogwork(selectedTaskId === "ALL" ? undefined : selectedTaskId);
  }

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Theo dõi logwork"
      subheading="Ghi nhận, cập nhật và rà soát logwork theo đúng phạm vi công việc của bạn."
      highlightLabel="Tỷ lệ hôm nay"
      highlightValue={`${coverage}%`}
    >
      <section className="stat-grid">
        <StatCard
          label="Tổng giờ ghi nhận"
          value={formatHours(totalHours)}
          note="Trong bộ lọc hiện tại"
          tone="accent"
        />
        <StatCard
          label="Bản ghi hôm nay"
          value={`${todayEntries.length}`}
          note="Nhịp cập nhật trong ngày"
          tone="on-track"
        />
        <StatCard
          label="Chưa cập nhật"
          value={`${missingUsers.length}`}
          note="Số người chưa ghi logwork"
          tone="watch"
        />
      </section>

      <section className="filter-row">
        <label>
          <span>Dự án</span>
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            <option value="ALL">Tất cả dự án</option>
            {(pageState?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Task</span>
          <select
            value={selectedTaskId}
            onChange={(event) => setSelectedTaskId(event.target.value)}
          >
            <option value="ALL">Tất cả task</option>
            {filteredTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.key} - {task.title}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="two-up">
        <Surface title="Mức độ tuân thủ" kicker="Coverage">
          <ProgressBar value={coverage} label="Thành viên đã cập nhật logwork hôm nay" />
          <div className="stack-list">
            {missingUsers.length ? (
              missingUsers.map((user) => (
                <div key={user.id} className="line-item">
                  <div>
                    <strong>{user.name}</strong>
                    <p>{user.title}</p>
                  </div>
                  <StatusPill label="Chưa cập nhật" tone="watch" />
                </div>
              ))
            ) : (
              <EmptyState
                title="Đã cập nhật đầy đủ"
                description="Không còn thành viên nào thiếu logwork trong ngày hôm nay."
              />
            )}
          </div>
        </Surface>

        <Surface title="Tạo hoặc cập nhật logwork" kicker="Logwork form">
          <form className="surface-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                <span>Ngày</span>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(event) => setEntryDate(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Số giờ</span>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={entryHours}
                  onChange={(event) => setEntryHours(event.target.value)}
                  required
                />
              </label>
              <label className="form-grid-span">
                <span>Ghi chú</span>
                <textarea
                  value={entryNote}
                  onChange={(event) => setEntryNote(event.target.value)}
                  rows={4}
                  required
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={selectedTaskId === "ALL"}>
                {editingEntryId ? "Cập nhật logwork" : "Ghi nhận logwork"}
              </button>
            </div>
          </form>
        </Surface>
      </section>

      <Surface title="Bản ghi logwork" kicker="Timeline">
        {filteredEntries.length ? (
          <div className="table-like">
            {filteredEntries.map((entry) => {
              const user = (pageState?.users ?? []).find(
                (candidate) => candidate.id === entry.userId,
              );
              const task = (pageState?.tasks ?? []).find(
                (candidate) => candidate.id === entry.taskId,
              );
              const canEdit = canManageScopedLogwork || entry.userId === viewer.id;

              return (
                <div key={entry.id} className="table-row">
                  <span>{formatDate(entry.date)}</span>
                  <strong>{user?.name ?? viewer.name}</strong>
                  <p>{task?.title ?? "Task đã ẩn"}</p>
                  <span>{formatHours(entry.hours)}</span>
                  {canEdit ? (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setEditingEntryId(entry.id);
                          setEntryDate(entry.date);
                          setEntryHours(String(entry.hours));
                          setEntryNote(entry.note);
                          setSelectedTaskId(entry.taskId);
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="text-button text-button-danger"
                        onClick={() => void handleRemove(entry.id)}
                      >
                        Xóa
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Chưa có logwork trong bộ lọc"
            description="Chọn task cụ thể rồi tạo logwork để bắt đầu theo dõi giờ làm việc."
          />
        )}
      </Surface>
    </WorkspaceShell>
  );
}
