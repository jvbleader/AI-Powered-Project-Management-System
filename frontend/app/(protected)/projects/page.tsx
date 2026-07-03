"use client";

import { useEffect, useState, type FormEvent } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import {
  EmptyState,
  ProgressBar,
  StatCard,
  StatusPill,
  Surface,
} from "@/components/ui";
import { logworkApi, projectApi, taskApi, userApi, workspaceApi } from "@/lib/api";
import {
  calculateMemberHours,
  canManageProject,
  getProjectMembers,
  isPrivilegedUser,
  normalizeViewer,
} from "@/lib/mock/permissions";
import { formatHours, formatRange, projectStatusLabel, roleLabel } from "@/lib/utils/format";
import { useAuthSession } from "@/lib/auth/use-session";
import type { LogworkEntry, Project, Task, UserProfile, WorkspaceShellData } from "@/types/dto";

type ProjectsState = {
  shellData: WorkspaceShellData;
  projects: Project[];
  tasks: Task[];
  entries: LogworkEntry[];
  users: UserProfile[];
};

function buildProjectCode(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
    .filter(Boolean);

  return `FP-${words.join("").slice(0, 8) || "NEW"}`;
}

export default function ProjectsPage() {
  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);
  const canManage = isPrivilegedUser(viewer);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectStart, setNewProjectStart] = useState("2026-07-01");
  const [newProjectEnd, setNewProjectEnd] = useState("2026-08-15");
  const [newProjectManagerId, setNewProjectManagerId] = useState(viewer.id);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [projectsState, setProjectsState] = useState<ProjectsState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadProjects() {
      const [{ data: shellData }, { data: projects }, { data: tasks }, { data: entries }, { data: users }] =
        await Promise.all([
          workspaceApi.getShellData(viewer),
          projectApi.list(undefined, viewer),
          taskApi.list(undefined, viewer),
          logworkApi.list(undefined, viewer),
          userApi.list(viewer),
        ]);

      if (isCancelled) {
        return;
      }

      setProjectsState({ shellData, projects, tasks, entries, users });
      setSelectedProjectId((current) => current ?? projects[0]?.id ?? null);
      setNewProjectManagerId((current) => current || viewer.id);
    }

    void loadProjects();

    return () => {
      isCancelled = true;
    };
  }, [viewer]);

  const shellData =
    projectsState?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  const projectList = projectsState?.projects ?? [];
  const selectedProject = projectList.find((project) => project.id === selectedProjectId) ?? projectList[0] ?? null;
  const accessibleTasks = projectsState?.tasks ?? [];
  const accessibleUsers = projectsState?.users ?? [];
  const accessibleEntries = projectsState?.entries ?? [];

  const managedProjects = projectList.filter((project) => canManageProject(viewer, project));
  const selectedProjectTasks = selectedProject
    ? accessibleTasks.filter((task) => task.projectId === selectedProject.id)
    : [];
  const selectedProjectMembers = selectedProject ? getProjectMembers(selectedProject) : [];
  const personalTasks = selectedProjectTasks.filter((task) => task.assigneeId === viewer.id);

  const addableMembers = accessibleUsers.filter((user) => {
    return selectedProject ? !selectedProject.memberIds.includes(user.id) : false;
  });

  async function refreshProjects(nextSelectedId?: string | null) {
    const [{ data: shellData }, { data: projects }, { data: tasks }, { data: entries }, { data: users }] =
      await Promise.all([
        workspaceApi.getShellData(viewer),
        projectApi.list(undefined, viewer),
        taskApi.list(undefined, viewer),
        logworkApi.list(undefined, viewer),
        userApi.list(viewer),
      ]);

    setProjectsState({ shellData, projects, tasks, entries, users });
    setSelectedProjectId(nextSelectedId ?? selectedProjectId ?? projects[0]?.id ?? null);
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!newProjectName.trim() || !newProjectDescription.trim() || !newProjectStart || !newProjectEnd) {
      setFormError("Vui lòng nhập đầy đủ tên dự án, mô tả, ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (newProjectEnd < newProjectStart) {
      setFormError("Ngày kết thúc dự kiến phải sau ngày bắt đầu.");
      return;
    }

    const created = await projectApi.create({
      code: buildProjectCode(newProjectName),
      name: newProjectName.trim(),
      description: newProjectDescription.trim(),
      status: "PLANNING",
      progress: 0,
      managerId: newProjectManagerId,
      memberIds: Array.from(new Set([newProjectManagerId])),
      startDate: newProjectStart,
      endDate: newProjectEnd,
      currentSprintId: null,
      objectives: ["Xác định phạm vi", "Thiết lập sprint đầu tiên", "Phân bổ thành viên"],
      metrics: {
        completedTasks: 0,
        overdueTasks: 0,
        logworkCoverage: 0,
        velocity: 0,
      },
    });

    setNewProjectName("");
    setNewProjectDescription("");
    setNewProjectStart("2026-07-01");
    setNewProjectEnd("2026-08-15");
    await refreshProjects(created.data.id);
  }

  async function handleAddMember() {
    if (!selectedProject || !memberToAdd) {
      return;
    }

    await projectApi.addMember(selectedProject.id, memberToAdd);
    setMemberToAdd("");
    await refreshProjects(selectedProject.id);
  }

  async function handleRemoveMember(memberId: string) {
    if (!selectedProject) {
      return;
    }

    await projectApi.removeMember(selectedProject.id, memberId);
    await refreshProjects(selectedProject.id);
  }

  const summaryCards = [
    {
      label: canManage ? "Dự án đang quản lí" : "Dự án đang tham gia",
      value: `${canManage ? managedProjects.length : projectList.length}`,
      note: canManage ? "Tổng số dự án bạn có quyền điều phối" : "Phạm vi dự án đang hiển thị cho bạn",
      tone: "accent" as const,
    },
    {
      label: "Đang hoạt động",
      value: `${projectList.filter((project) => project.status === "ACTIVE").length}`,
      note: "Dự án đang trong giai đoạn thực thi",
      tone: "on-track" as const,
    },
    {
      label: "Công việc mở",
      value: `${accessibleTasks.filter((task) => task.status !== "DONE").length}`,
      note: "Task chưa hoàn tất trong phạm vi xem hiện tại",
      tone: "watch" as const,
    },
    {
      label: "Giờ logwork",
      value: formatHours(accessibleEntries.reduce((sum, entry) => sum + entry.hours, 0)),
      note: "Tổng giờ đã ghi nhận",
      tone: "accent" as const,
    },
  ];

  return (
    <WorkspaceShell
      shellData={shellData}
      heading={canManage ? "Quản lí dự án" : "Dự án của tôi"}
      subheading={
        canManage
          ? "Theo dõi toàn bộ danh mục dự án, tạo dự án mới và xem chi tiết nguồn lực theo từng dự án."
          : "Chỉ hiển thị các dự án bạn tham gia và những công việc được giao cho bạn."
      }
      highlightLabel="Phạm vi xem"
      highlightValue={canManage ? "Admin / Manager / Leader" : "Thành viên"}
    >
      <section className="stat-grid">
        {summaryCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} note={card.note} tone={card.tone} />
        ))}
      </section>

      <section className="two-up">
        <Surface title={canManage ? "Danh mục điều phối" : "Các dự án đang tham gia"} kicker="Projects">
          {projectList.length ? (
            <div className="stack-list">
              {projectList.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`selection-card ${selectedProject?.id === project.id ? "selection-card-active" : ""}`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="selection-card-head">
                    <div>
                      <strong>{project.name}</strong>
                      <p>{project.code}</p>
                    </div>
                    <StatusPill
                      label={projectStatusLabel(project.status)}
                      tone={
                        project.status === "AT_RISK"
                          ? "critical"
                          : project.status === "ACTIVE"
                            ? "on-track"
                            : "watch"
                      }
                    />
                  </div>
                  <ProgressBar value={project.progress} label="Tiến độ triển khai" />
                  <div className="line-item compact-line">
                    <span>Thời gian</span>
                    <strong>{formatRange(project.startDate, project.endDate)}</strong>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="Chưa có dự án" description="Tạo dự án mới hoặc gán bạn vào một dự án để xem dữ liệu tại đây." />
          )}
        </Surface>

        {canManage ? (
          <Surface title="Tạo dự án mới" kicker="Project setup">
            <form className="surface-form" onSubmit={handleCreateProject}>
              <div className="form-grid">
                <label>
                  <span>Tên dự án</span>
                  <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} required />
                </label>
                <label>
                  <span>Người quản lý</span>
                  <select value={newProjectManagerId} onChange={(event) => setNewProjectManagerId(event.target.value)}>
                    {accessibleUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} - {roleLabel(user.role)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-grid-span">
                  <span>Mô tả chi tiết</span>
                  <textarea
                    value={newProjectDescription}
                    onChange={(event) => setNewProjectDescription(event.target.value)}
                    required
                    rows={4}
                  />
                </label>
                <label>
                  <span>Ngày bắt đầu</span>
                  <input type="date" value={newProjectStart} onChange={(event) => setNewProjectStart(event.target.value)} required />
                </label>
                <label>
                  <span>Ngày kết thúc dự kiến</span>
                  <input type="date" value={newProjectEnd} onChange={(event) => setNewProjectEnd(event.target.value)} required />
                </label>
              </div>

              {formError ? <p className="form-error">{formError}</p> : null}

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  Tạo dự án
                </button>
              </div>
            </form>
          </Surface>
        ) : (
          <Surface title="Chế độ thành viên" kicker="Privacy">
            <div className="privacy-panel">
              <strong>Thông tin thành viên khác đang được ẩn.</strong>
              <p>Bạn chỉ thấy các task được giao cho mình trong từng dự án, không thấy tiến độ chi tiết của các thành viên khác.</p>
            </div>
          </Surface>
        )}
      </section>

      {selectedProject ? (
        canManage ? (
          <>
            <Surface title={`Chi tiết ${selectedProject.name}`} kicker={selectedProject.code}>
              <section className="detail-grid">
                <div className="detail-panel">
                  <div className="detail-panel-head">
                    <div>
                      <strong>Thành viên dự án</strong>
                      <p>CRUD thành viên trong dự án</p>
                    </div>
                    <div className="inline-form">
                      <select value={memberToAdd} onChange={(event) => setMemberToAdd(event.target.value)}>
                        <option value="">Chọn thành viên</option>
                        {addableMembers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} - {roleLabel(user.role)}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="secondary-button" onClick={handleAddMember} disabled={!memberToAdd}>
                        Thêm
                      </button>
                    </div>
                  </div>

                  <div className="member-grid">
                    {selectedProjectMembers.map((member) => (
                      <article key={member.id} className="member-card">
                        <div>
                          <strong>{member.name}</strong>
                          <p>{member.title}</p>
                        </div>
                        <div className="member-card-actions">
                          <StatusPill label={roleLabel(member.role)} tone={member.role === "MEMBER" ? "neutral" : "accent"} />
                          {member.id !== selectedProject.managerId ? (
                            <button type="button" className="text-button" onClick={() => handleRemoveMember(member.id)}>
                              Gỡ
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="detail-panel">
                  <strong>Tiến độ tổng thể</strong>
                  <ProgressBar value={selectedProject.progress} label="Hoàn thành dự án" />
                  <div className="summary-grid">
                    <div className="summary-card">
                      <span>Task hoàn thành</span>
                      <strong>{selectedProject.metrics.completedTasks}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Task quá hạn</span>
                      <strong>{selectedProject.metrics.overdueTasks}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Logwork coverage</span>
                      <strong>{selectedProject.metrics.logworkCoverage}%</strong>
                    </div>
                    <div className="summary-card">
                      <span>Velocity</span>
                      <strong>{selectedProject.metrics.velocity} pts</strong>
                    </div>
                  </div>
                </div>
              </section>
            </Surface>

            <section className="two-up">
              <Surface title="Tiến độ theo từng thành viên" kicker="Member progress">
                <div className="stack-list">
                  {selectedProjectMembers.map((member) => {
                    const memberTasks = selectedProjectTasks.filter((task) => task.assigneeId === member.id);
                    const completedCount = memberTasks.filter((task) => task.status === "DONE").length;
                    const progress = memberTasks.length ? Math.round((completedCount / memberTasks.length) * 100) : 0;

                    return (
                      <div key={member.id} className="member-progress-row">
                        <div className="member-progress-copy">
                          <strong>{member.name}</strong>
                          <p>{memberTasks.length} task được giao</p>
                        </div>
                        <div className="member-progress-bar">
                          <ProgressBar value={progress} label={`${completedCount}/${memberTasks.length || 0} task hoàn thành`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Surface>

              <Surface title="Số giờ làm việc theo thành viên" kicker="Hours by task">
                <div className="stack-list">
                  {selectedProjectMembers.map((member) => (
                    <div key={member.id} className="line-item">
                      <div>
                        <strong>{member.name}</strong>
                        <p>{member.title}</p>
                      </div>
                      <span>{formatHours(calculateMemberHours(selectedProjectTasks, accessibleEntries, member.id))}</span>
                    </div>
                  ))}
                </div>
              </Surface>
            </section>

            <Surface title="Chi tiết giờ làm việc theo task" kicker="Worklog detail">
              {selectedProjectTasks.length ? (
                <div className="table-like">
                  {selectedProjectTasks.map((task) => {
                    const taskHours = accessibleEntries
                      .filter((entry) => entry.taskId === task.id)
                      .reduce((sum, entry) => sum + entry.hours, 0);
                    const assignee = selectedProjectMembers.find((member) => member.id === task.assigneeId);

                    return (
                      <div key={task.id} className="table-row">
                        <span>{task.key}</span>
                        <strong>{task.title}</strong>
                        <p>{assignee?.name ?? "Chưa phân công"}</p>
                        <span>{formatHours(taskHours)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="Chưa có task" description="Hãy tạo task trong phần Sprint để theo dõi giờ làm việc chi tiết." />
              )}
            </Surface>
          </>
        ) : (
          <>
            <Surface title={`Công việc của tôi trong ${selectedProject.name}`} kicker={selectedProject.code}>
              {personalTasks.length ? (
                <div className="table-like">
                  {personalTasks.map((task) => (
                    <div key={task.id} className="table-row">
                      <span>{task.key}</span>
                      <strong>{task.title}</strong>
                      <p>{projectStatusLabel(selectedProject.status)}</p>
                      <span>{formatHours(task.estimateHours)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Bạn chưa có task trong dự án này" description="Khi được giao việc, danh sách task của bạn sẽ hiện ở đây." />
              )}
            </Surface>
          </>
        )
      ) : null}
    </WorkspaceShell>
  );
}
