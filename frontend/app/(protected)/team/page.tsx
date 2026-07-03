"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import { PasswordField } from "@/components/password-field";
import { WorkspaceShell } from "@/components/workspace-shell";
import { EmptyState, ProgressBar, StatusPill, Surface } from "@/components/ui";
import { backendCapabilities, taskApi, userApi, workspaceApi } from "@/lib/api";
import { signOut } from "@/lib/auth/session";
import { isPrivilegedUser, normalizeViewer } from "@/lib/mock/permissions";
import { formatDate, formatDateTime, formatHours, presenceLabel, roleLabel, taskPriorityLabel, taskStatusLabel } from "@/lib/utils/format";
import { useAuthSession } from "@/lib/auth/use-session";
import type { EnrichedTask, JobRole, UserProfile, WorkspaceShellData } from "@/types/dto";

type TeamState = {
  shellData: WorkspaceShellData;
  tasks: EnrichedTask[];
  users: UserProfile[];
};

const JOB_ROLE_OPTIONS: Array<{ value: JobRole; label: string }> = [
  { value: "FULLSTACK", label: "Fullstack Developer" },
  { value: "BACKEND", label: "Backend Developer (BE)" },
  { value: "FRONTEND", label: "Frontend Developer (FE)" },
  { value: "AI_ENGINEER", label: "AI Engineer (AIE)" },
  { value: "QA", label: "QA Engineer" },
  { value: "DEVOPS", label: "DevOps Engineer" },
  { value: "UI_UX", label: "UI/UX Designer" },
  { value: "PROJECT_MANAGER", label: "Project Manager" },
];

const EMPTY_CREATE_FORM = {
  name: "",
  email: "",
  password: "",
  jobRole: "FULLSTACK" as JobRole,
  isAdmin: false,
};

const EMPTY_RESET_FORM = {
  newPassword: "",
  confirmPassword: "",
};

const TASK_STATUS_ORDER = {
  BLOCKED: 0,
  IN_PROGRESS: 1,
  REVIEW: 2,
  TODO: 3,
  DONE: 4,
} as const;

export default function TeamPage() {
  const router = useRouter();
  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);
  const [teamState, setTeamState] = useState<TeamState | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState("");
  const [createNotice, setCreateNotice] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [resetForm, setResetForm] = useState(EMPTY_RESET_FORM);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");
  const [deactivateNotice, setDeactivateNotice] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [isResetPasswordVisible, setIsResetPasswordVisible] = useState(false);
  const [isResetConfirmVisible, setIsResetConfirmVisible] = useState(false);
  const supportsUserAdmin = backendCapabilities.userAdmin;

  useEffect(() => {
    let isCancelled = false;

    async function loadTeam() {
      const [{ data: shellData }, { data: users }, { data: tasks }] = await Promise.all([
        workspaceApi.getShellData(viewer),
        userApi.list(viewer),
        taskApi.getEnrichedBoard(undefined, viewer),
      ]);

      if (isCancelled) {
        return;
      }

      setTeamState({ shellData, tasks, users });
    }

    void loadTeam();

    return () => {
      isCancelled = true;
    };
  }, [viewer]);

  useEffect(() => {
    if (!isCreateModalOpen && !selectedUser) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (selectedUser && !isResetting && !isDeactivating) {
        setSelectedUser(null);
        setDeactivateError("");
        setDeactivateNotice("");
        setResetError("");
        setResetNotice("");
        setResetForm(EMPTY_RESET_FORM);
        setIsResetPasswordVisible(false);
        setIsResetConfirmVisible(false);
        return;
      }

      if (isCreateModalOpen && !isCreating) {
        setIsCreateModalOpen(false);
        setCreateError("");
        setCreateForm(EMPTY_CREATE_FORM);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCreateModalOpen, isCreating, isDeactivating, isResetting, selectedUser]);

  function closeCreateModal() {
    if (isCreating) {
      return;
    }

    setIsCreateModalOpen(false);
    setCreateError("");
    setCreateForm(EMPTY_CREATE_FORM);
  }

  function openDetailModal(user: UserProfile) {
    setSelectedUser(user);
    setDeactivateError("");
    setDeactivateNotice("");
    setResetError("");
    setResetNotice("");
    setResetForm(EMPTY_RESET_FORM);
    setIsResetPasswordVisible(false);
    setIsResetConfirmVisible(false);
  }

  function closeDetailModal() {
    if (isResetting || isDeactivating) {
      return;
    }

    setSelectedUser(null);
    setDeactivateError("");
    setDeactivateNotice("");
    setResetError("");
    setResetNotice("");
    setResetForm(EMPTY_RESET_FORM);
    setIsResetPasswordVisible(false);
    setIsResetConfirmVisible(false);
  }

  async function handleCreateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    setCreateNotice("");
    setIsCreating(true);

    try {
      const { data: createdUser } = await userApi.create({
        email: createForm.email.trim(),
        name: createForm.name.trim(),
        password: createForm.password,
        jobRole: createForm.jobRole,
        isAdmin: createForm.isAdmin,
      });

      setTeamState((current) =>
        current
          ? {
              ...current,
              users: current.users.some((user) => user.email === createdUser.email)
                ? current.users
                : [...current.users, createdUser],
            }
          : current,
      );
      setCreateNotice(`Đã tạo tài khoản cho ${createdUser.name}.`);
      setCreateForm(EMPTY_CREATE_FORM);
      setIsCreateModalOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Không thể tạo tài khoản nhân viên.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeactivateUser() {
    if (!selectedUser) {
      return;
    }

    setIsDeactivating(true);
    setDeactivateError("");
    setDeactivateNotice("");

    try {
      const { data } = await userApi.deactivate({
        email: selectedUser.email,
      });

      if (selectedUser.email.toLowerCase() === viewer.email.toLowerCase()) {
        await signOut();
        router.push("/login");
        return;
      }

      setTeamState((current) =>
        current
          ? {
              ...current,
              users: current.users.map((user) =>
                user.email.toLowerCase() === data.email.toLowerCase()
                  ? { ...user, isActive: data.isActive }
                  : user,
              ),
            }
          : current,
      );
      setSelectedUser((current) =>
        current && current.email.toLowerCase() === data.email.toLowerCase()
          ? { ...current, isActive: data.isActive }
          : current,
      );
      setDeactivateNotice(data.message);
    } catch (error) {
      setDeactivateError(error instanceof Error ? error.message : "Không thể cập nhật trạng thái nghỉ việc lúc này.");
    } finally {
      setIsDeactivating(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUser) {
      return;
    }

    setResetError("");
    setResetNotice("");

    const hasLetter = Array.from(resetForm.newPassword).some(
      (character) => character.toLocaleLowerCase() !== character.toLocaleUpperCase(),
    );
    const hasNumber = Array.from(resetForm.newPassword).some((character) => /\d/u.test(character));

    if (!hasLetter || !hasNumber) {
      setResetError("Mật khẩu phải chứa chữ cái và chữ số.");
      return;
    }

    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setResetError("Mật khẩu xác nhận chưa khớp.");
      return;
    }

    setIsResetting(true);

    try {
      await userApi.resetPassword({
        email: selectedUser.email,
        newPassword: resetForm.newPassword,
      });

      if (selectedUser.email.toLowerCase() === viewer.email.toLowerCase()) {
        await signOut();
        router.push("/login");
        return;
      }

      setResetNotice(`Đã reset mật khẩu cho ${selectedUser.name}.`);
      setResetForm(EMPTY_RESET_FORM);
      setIsResetPasswordVisible(false);
      setIsResetConfirmVisible(false);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Không thể reset mật khẩu lúc này.");
    } finally {
      setIsResetting(false);
    }
  }

  function getUtilization(user: UserProfile) {
    if (!user.capacityHours) {
      return 0;
    }

    return Math.round((user.workloadHours / user.capacityHours) * 100);
  }

  function getUserStatusLabel(user: UserProfile) {
    return user.isActive ? presenceLabel(user.presence) : "Đã nghỉ việc";
  }

  function getUserStatusTone(user: UserProfile) {
    if (!user.isActive) {
      return "critical" as const;
    }

    if (user.presence === "offline") {
      return "neutral" as const;
    }

    if (user.presence === "focus") {
      return "watch" as const;
    }

    return "on-track" as const;
  }

  function handleMemberCardKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, user: UserProfile) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openDetailModal(user);
  }

  const selectedUserTasks = selectedUser
    ? [...(teamState?.tasks ?? [])]
        .filter((task) => task.assigneeId === selectedUser.id)
        .sort((left, right) => {
          const statusOrder = TASK_STATUS_ORDER[left.status] - TASK_STATUS_ORDER[right.status];
          if (statusOrder !== 0) {
            return statusOrder;
          }

          return left.dueDate.localeCompare(right.dueDate);
        })
    : [];
  const selectedUserActiveTasks = selectedUserTasks.filter((task) => task.status !== "DONE");
  const selectedUserCompletedTasks = selectedUserTasks.length - selectedUserActiveTasks.length;
  const selectedUserProjectCount = new Set(selectedUserTasks.map((task) => task.projectId)).size;
  const selectedUserUtilization = selectedUser ? getUtilization(selectedUser) : 0;

  const shellData =
    teamState?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  return (
    <WorkspaceShell
      shellData={shellData}
      heading={isPrivilegedUser(viewer) ? "Năng lực đội ngũ" : "Thông tin cá nhân"}
      subheading={
        isPrivilegedUser(viewer)
          ? "Theo dõi vai trò, công suất làm việc và mức độ tập trung để cân đối nguồn lực."
          : "Thành viên chỉ xem thông tin của chính mình trong màn này."
      }
      highlightLabel="Nhân sự"
      highlightValue={`${teamState?.users.length ?? 0}`}
    >
      {viewer.role === "ADMIN" ? (
        <section className="team-management-bar">
          <div>
            <span className="kicker">Quản lý tài khoản</span>
            <h2>{supportsUserAdmin ? "Thêm nhân sự vào hệ thống" : "Màn này đang ở chế độ chỉ xem"}</h2>
            <p>
              {supportsUserAdmin
                ? "Tạo thông tin đăng nhập và phân loại chuyên môn cho nhân viên mới."
                : "Backend hiện tại chỉ hỗ trợ xác thực cá nhân, chưa có API tạo tài khoản, reset mật khẩu hoặc nghỉ việc."}
            </p>
          </div>
          {supportsUserAdmin ? (
            <button
              type="button"
              className="primary-button team-create-button"
              onClick={() => {
                setCreateError("");
                setCreateNotice("");
                setIsCreateModalOpen(true);
              }}
            >
              <span aria-hidden="true">+</span>
              Tạo nhân viên
            </button>
          ) : null}
        </section>
      ) : null}

      {createNotice ? (
        <p className="form-success team-create-notice" role="status">
          {createNotice}
        </p>
      ) : null}

      <section className="card-grid">
        {(teamState?.users ?? []).map((user) => {
          const utilization = getUtilization(user);

          return (
            <div
              key={user.id}
              className="team-member-card-trigger"
              role="button"
              tabIndex={0}
              onClick={() => openDetailModal(user)}
              onKeyDown={(event) => handleMemberCardKeyDown(event, user)}
            >
              <Surface
                title={user.name}
                kicker={roleLabel(user.role)}
                className="team-member-card"
                aside={
                  <StatusPill
                    label={getUserStatusLabel(user)}
                    tone={getUserStatusTone(user)}
                  />
                }
              >
                <p>{user.title}</p>
                <ProgressBar value={utilization} label="Công suất đang sử dụng" />
                <div className="stack-list compact">
                  <div className="line-item">
                    <span>Công suất</span>
                    <strong>{formatHours(user.capacityHours)}</strong>
                  </div>
                  <div className="line-item">
                    <span>Đã phân bổ</span>
                    <strong>{formatHours(user.workloadHours)}</strong>
                  </div>
                  <div className="line-item">
                    <span>Điểm tập trung</span>
                    <strong>{user.focusScore}/100</strong>
                  </div>
                </div>
              </Surface>
            </div>
          );
        })}
      </section>

      {selectedUser ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeDetailModal}>
          <section
            className="password-modal employee-modal team-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="password-modal-header">
              <div>
                <span className="eyebrow">Chi tiết nhân sự</span>
                <h2 id="employee-detail-title">{selectedUser.name}</h2>
                <p>{selectedUser.title}</p>
              </div>
              <button type="button" className="icon-button" onClick={closeDetailModal} aria-label="Đóng" disabled={isResetting || isDeactivating}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="team-detail-layout">
              <section className="team-detail-panel">
                <div className="team-detail-identity">
                  <div className="team-detail-copy">
                    <span className="kicker">{roleLabel(selectedUser.role)}</span>
                    <h3>{selectedUser.name}</h3>
                    <p>{selectedUser.email}</p>
                  </div>
                  <div className="team-detail-badges">
                    <StatusPill
                      label={getUserStatusLabel(selectedUser)}
                      tone={getUserStatusTone(selectedUser)}
                    />
                  </div>
                </div>

                <div className="team-detail-fact-grid">
                  <article className="team-detail-fact">
                    <span>Quyền hệ thống</span>
                    <strong>{roleLabel(selectedUser.role)}</strong>
                  </article>
                  {/* <article className="team-detail-fact">
                    <span>Trạng thái tài khoản</span>
                    <strong>{selectedUser.isActive ? "is_active = 1" : "is_active = 0"}</strong>
                  </article> */}
                  <article className="team-detail-fact">
                    <span>Công suất sử dụng</span>
                    <strong>{selectedUserUtilization}%</strong>
                  </article>
                  <article className="team-detail-fact">
                    <span>Giờ khả dụng</span>
                    <strong>{formatHours(selectedUser.capacityHours)}</strong>
                  </article>
                  <article className="team-detail-fact">
                    <span>Giờ đã phân bổ</span>
                    <strong>{formatHours(selectedUser.workloadHours)}</strong>
                  </article>
                  <article className="team-detail-fact">
                    <span>Điểm tập trung</span>
                    <strong>{selectedUser.focusScore}/100</strong>
                  </article>
                  <article className="team-detail-fact">
                    <span>Dự án đang tham gia</span>
                    <strong>{selectedUserProjectCount}</strong>
                  </article>
                </div>

                <ProgressBar value={selectedUserUtilization} label="Tỷ lệ phân bổ hiện tại" />

                {viewer.role === "ADMIN" && supportsUserAdmin ? (
                  <section className="team-detail-panel team-security-panel">
                    <div className="group-block">
                      <div className="team-detail-section-title">
                        <div>
                          {/* <span className="kicker">Trạng thái</span> */}
                          <h3>Trạng thái</h3>
                        </div>
                        <StatusPill
                          label={selectedUser.isActive ? "Đang làm việc" : "Đã nghỉ việc"}
                          tone={selectedUser.isActive ? "on-track" : "critical"}
                        />
                      </div>

                      {/* <p className="team-password-helper">Nút này chuyển tài khoản nhân viên từ `is_active = 1` sang `is_active = 0` và ngắt toàn bộ phiên đăng nhập hiện tại.</p> */}

                      {deactivateError ? <p className="form-error" role="alert">{deactivateError}</p> : null}
                      {deactivateNotice ? <p className="form-success" role="status">{deactivateNotice}</p> : null}

                      <div className="team-security-actions">
                        <button
                          type="button"
                          className={selectedUser.isActive ? "secondary-button" : "primary-button"}
                          disabled={isDeactivating || !selectedUser.isActive}
                          onClick={handleDeactivateUser}
                        >
                          {isDeactivating ? "Đang cập nhật..." : selectedUser.isActive ? "Dừng công tác" : "Đã nghỉ việc"}
                        </button>
                      </div>
                    </div>

                    <div className="group-block">
                      <div className="team-detail-section-title">
                        <div>
                          <span className="kicker">Bảo mật</span>
                          <h3>Reset mật khẩu</h3>
                        </div>
                      </div>

                      <form className="password-form team-reset-form" onSubmit={handleResetPassword}>
                        <div className="team-password-grid">
                          <label>
                            <span>Mật khẩu mới</span>
                            <PasswordField
                              value={resetForm.newPassword}
                              onChange={(event) => setResetForm((current) => ({ ...current, newPassword: event.target.value }))}
                              isVisible={isResetPasswordVisible}
                              onToggleVisibility={() => setIsResetPasswordVisible((current) => !current)}
                              minLength={8}
                              required
                              autoComplete="new-password"
                            />
                          </label>

                          <label>
                            <span>Xác nhận mật khẩu</span>
                            <PasswordField
                              value={resetForm.confirmPassword}
                              onChange={(event) => setResetForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                              isVisible={isResetConfirmVisible}
                              onToggleVisibility={() => setIsResetConfirmVisible((current) => !current)}
                              minLength={8}
                              required
                              autoComplete="new-password"
                            />
                          </label>
                        </div>

                        <p className="team-password-helper">Chỉ admin mới có quyền reset mật khẩu và toàn bộ phiên đăng nhập cũ của người dùng sẽ bị thu hồi.</p>

                        {resetError ? <p className="form-error" role="alert">{resetError}</p> : null}
                        {resetNotice ? <p className="form-success" role="status">{resetNotice}</p> : null}

                        <div className="team-security-actions">
                          <button type="submit" className="primary-button" disabled={isResetting}>
                            {isResetting ? "Đang reset..." : "Reset mật khẩu"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </section>
                ) : null}

                {viewer.role === "ADMIN" && !supportsUserAdmin ? (
                  <section className="team-detail-panel team-security-panel">
                    <div className="group-block">
                      <div className="team-detail-section-title">
                        <div>
                          <span className="kicker">Hạn chế backend</span>
                          <h3>Quản trị tài khoản</h3>
                        </div>
                      </div>

                      <p className="team-password-helper">
                        Backend hiện tại chưa cung cấp API quản trị nhân sự, nên phần tạo tài khoản, reset mật khẩu và dừng công tác đang được tắt ở frontend.
                      </p>
                    </div>
                  </section>
                ) : null}
              </section>

              <section className="team-detail-panel">
                <div className="team-detail-section-title">
                  <div>
                    <span className="kicker">Công việc</span>
                    <h3>Task đang phụ trách</h3>
                  </div>
                  <StatusPill label={`${selectedUserActiveTasks.length} task mở`} tone="accent" />
                </div>

                {selectedUserActiveTasks.length ? (
                  <div className="team-task-list">
                    {selectedUserActiveTasks.map((task) => (
                      <article key={task.id} className="team-task-card">
                        <div className="team-task-card-topline">
                          <strong>{task.key}</strong>
                          <div className="team-task-badges">
                            <StatusPill
                              label={taskStatusLabel(task.status)}
                              tone={
                                task.status === "BLOCKED"
                                  ? "critical"
                                  : task.status === "REVIEW"
                                    ? "watch"
                                    : task.status === "IN_PROGRESS"
                                      ? "accent"
                                      : "neutral"
                              }
                            />
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
                        </div>

                        <h3>{task.title}</h3>
                        <p>{task.description}</p>

                        <div className="team-task-meta">
                          <span>{task.project.name}</span>
                          <span>Hạn {formatDate(task.dueDate)}</span>
                        </div>
                        <div className="team-task-meta">
                          <span>{task.sprint ? task.sprint.name : "Chưa vào sprint"}</span>
                          <span>{formatHours(task.spentHours)} / {formatHours(task.estimateHours)}</span>
                        </div>
                        <div className="team-task-meta">
                          <span>{task.commentsCount} bình luận</span>
                          <span>Cập nhật {formatDateTime(task.lastActivity)}</span>
                        </div>

                        {task.blockers.length ? (
                          <div className="team-task-blockers">
                            {task.blockers.map((blocker) => (
                              <span key={blocker} className="soft-token soft-token-alert">{blocker}</span>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Không có task đang mở"
                    description={
                      selectedUserCompletedTasks
                        ? `${selectedUser.name} hiện không có task active. Đã hoàn thành ${selectedUserCompletedTasks} task trong dữ liệu hiện có.`
                        : "Nhân sự này chưa được gán task nào trong dữ liệu hiện tại."
                    }
                  />
                )}
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {viewer.role === "ADMIN" && supportsUserAdmin && isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeCreateModal}>
          <section
            className="password-modal employee-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-employee-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="password-modal-header">
              <div>
                <span className="eyebrow">Nhân sự mới</span>
                <h2 id="create-employee-title">Tạo tài khoản nhân viên</h2>
                <p>Nhân viên sẽ dùng email và mật khẩu này để đăng nhập.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeCreateModal} aria-label="Đóng" disabled={isCreating}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <form className="password-form employee-form" onSubmit={handleCreateEmployee}>
              <div className="employee-form-grid">
                <label>
                  <span>Họ và tên</span>
                  <input
                    value={createForm.name}
                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Nguyễn Văn An"
                    autoComplete="name"
                    required
                  />
                </label>

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="an@company.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <label>
                  <span>Mật khẩu khởi tạo</span>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Tối thiểu 8 ký tự, gồm chữ và số"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>

                <label>
                  <span>Vai trò chuyên môn</span>
                  <select
                    value={createForm.jobRole}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, jobRole: event.target.value as JobRole }))
                    }
                  >
                    {JOB_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={createForm.isAdmin}
                  onChange={(event) => setCreateForm((current) => ({ ...current, isAdmin: event.target.checked }))}
                />
                <span>
                  <strong>Cấp quyền Admin</strong>
                  <small>Cho phép quản trị tài khoản và truy cập toàn bộ dữ liệu dự án.</small>
                </span>
              </label>

              {createError ? <p className="form-error" role="alert">{createError}</p> : null}

              <div className="password-modal-actions">
                <button type="button" className="secondary-button" onClick={closeCreateModal} disabled={isCreating}>
                  Hủy
                </button>
                <button type="submit" className="primary-button" disabled={isCreating}>
                  {isCreating ? "Đang tạo..." : "Tạo tài khoản"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
