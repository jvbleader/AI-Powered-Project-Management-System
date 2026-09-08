"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { EmptyState, ProgressBar, StatCard, StatusPill, Surface } from "@/components/ui";
import { logworkApi, projectApi, taskApi, userApi, workspaceApi } from "@/services/api";
import { formatDate, formatHours, canEditPendingLogwork, logworkStatusClassName, logworkStatusLabel } from "@/lib/utils/format";
import { useAuthSession } from "@/hooks/use-session";
import { LogworkEntryDetailModal } from "../tasks/_components/logwork-entry-detail-modal";
import type { EnrichedTask, TaskLogworkEntry, Project, UserProfile, WorkspaceShellData } from "@/types";

type LogworkPageState = {
  shellData: WorkspaceShellData;
  entries: TaskLogworkEntry[];
  tasks: EnrichedTask[];
  users: UserProfile[];
  projects: Project[];
};

const DEMO_TODAY = new Date().toISOString().split("T")[0];

export default function LogworkPage() {
  const session = useAuthSession();
  const viewer = useMemo(() => session?.currentUser as any, [session?.currentUser]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("ALL");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(DEMO_TODAY);
  const [entryHours, setEntryHours] = useState("2");
  const [entryNote, setEntryNote] = useState("");
  const [pageState, setPageState] = useState<LogworkPageState | null>(null);
  const [viewingEntry, setViewingEntry] = useState<TaskLogworkEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

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

      setPageState({ shellData, entries: entries.items, tasks, users, projects });
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

  const todayEntries = filteredEntries.filter((entry) => entry.workDate === DEMO_TODAY);
  const totalHours = filteredEntries.reduce((sum, entry) => sum + (entry.hoursSpent || 0), 0);
  const trackedUsers = pageState?.users ?? [];
  const todayUserIds = new Set(todayEntries.map((entry) => entry.userId));
  const missingUsers = trackedUsers.filter((user: UserProfile) => !todayUserIds.has(user.id));
  const coverage = trackedUsers.length
    ? Math.round((todayUserIds.size / trackedUsers.length) * 100)
    : 0;

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

    setPageState({ shellData, entries: entries.items, tasks, users, projects });
    setSelectedTaskId(nextTaskId ?? selectedTaskId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedTaskId === "ALL" || !entryDate || !entryHours || !entryNote.trim()) {
      return;
    }

    if (editingEntryId) {
      const existing = (pageState?.entries ?? []).find((entry) => entry.id === editingEntryId);
      if (existing && !canEditPendingLogwork(existing.status, existing.userId, viewer.id)) {
        return;
      }
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
              missingUsers.map((user: UserProfile) => (
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
              const canEdit = canEditPendingLogwork(entry.status, entry.userId, viewer.id);

              return (
                <div 
                  key={entry.id} 
                  className="table-row" 
                  onClick={() => {
                    setViewingEntry(entry);
                    setIsDetailModalOpen(true);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <span>{formatDate(entry.workDate)}</span>
                  <strong>{user?.name ?? viewer.name}</strong>
                  <p>{task?.title ?? "Task đã ẩn"}</p>
                  <span>{formatHours(entry.hoursSpent)}</span>
                  <span className={`logwork-status-pill ${logworkStatusClassName(entry.status)}`}>
                    {logworkStatusLabel(entry.status)}
                  </span>
                  {canEdit ? (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEntryId(entry.id);
                          setEntryDate(entry.workDate);
                          setEntryHours(String(entry.hoursSpent));
                          setEntryNote(entry.workContent);
                          setSelectedTaskId(entry.taskId);
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="text-button text-button-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRemove(entry.id);
                        }}
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

      <LogworkEntryDetailModal
        entry={viewingEntry}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        canEdit={
          viewingEntry
            ? canEditPendingLogwork(viewingEntry.status, viewingEntry.userId, viewer.id)
            : false
        }
        onEdit={() => {
          if (!viewingEntry) return;
          setEditingEntryId(viewingEntry.id);
          setEntryDate(viewingEntry.workDate);
          setEntryHours(String(viewingEntry.hoursSpent));
          setEntryNote(viewingEntry.workContent);
          setSelectedTaskId(viewingEntry.taskId);
        }}
      />
    </WorkspaceShell>
  );
}
