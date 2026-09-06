"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { RoleTags } from "@/components/role-tags";
import { UserAvatar } from "@/components/user-avatar";
import { projectApi, userApi } from "@/services/api";
import { roleDisplayLabels, roleLabel } from "@/lib/utils/format";
import { SYSTEM_ROLE_OPTIONS, type UserProfile, type UserRole } from "@/types";
import type { Project } from "@/types/project";
import styles from "./add-member-modal.module.css";

type ProjectRoleItem = {
  id: number;
  name: string;
};

type ExistingMember = {
  userId: number;
  isActive: boolean;
};

type SelectedPerson =
  | { kind: "user"; user: UserProfile }
  | { kind: "invite"; email: string };

type AddMemberModalProps = {
  isOpen: boolean;
  projectId: string;
  project?: Project;
  accessibleUsers: UserProfile[];
  existingMembers: ExistingMember[];
  projectRoles: ProjectRoleItem[];
  onClose: () => void;
  onAdded: () => Promise<void> | void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isEmail(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

function resolveProjectRoleId(selectedRoles: string[], projectRoles: ProjectRoleItem[]) {
  const aliases: Record<string, string[]> = {
    PROJECT_MANAGER: ["PROJECT_MANAGER", "Manager", "Group Manager", "Project Manager / Product Owner / Group Member"],
    DEVELOPER: ["DEVELOPER", "Lập trình viên"],
    QA: ["QA", "QC", "Tester"],
    VIEWER: ["VIEWER"],
  };

  for (const role of projectRoles) {
    const keys = aliases[role.name] ?? [role.name];
    if (selectedRoles.some((selected) => keys.includes(selected) || selected === role.name)) {
      return role.id;
    }
  }

  return 2;
}

function resolveSystemRole(selectedRoles: string[]): UserRole {
  const systemMatch = SYSTEM_ROLE_OPTIONS.find((role) => selectedRoles.includes(role));
  if (systemMatch) {
    return systemMatch;
  }

  if (selectedRoles.includes("Manager") || selectedRoles.includes("Group Manager")) {
    return "Project Manager / Product Owner / Group Member";
  }

  if (selectedRoles.includes("Leader") || selectedRoles.includes("Team Leader")) {
    return "Leader";
  }

  return selectedRoles[0] || "Lập trình viên";
}

export function AddMemberModal({
  isOpen,
  projectId,
  project,
  accessibleUsers,
  existingMembers,
  projectRoles,
  onClose,
  onAdded,
}: AddMemberModalProps) {
  const [query, setQuery] = useState("");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [roleQuery, setRoleQuery] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<SelectedPerson[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [candidateUsers, setCandidateUsers] = useState<UserProfile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const userFieldRef = useRef<HTMLDivElement>(null);
  const roleFieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setRoleQuery("");
    setSelectedPeople([]);
    setSelectedRoles([]);
    setShowErrors(false);
    setSubmitError(null);
    setIsUserMenuOpen(false);
    setIsRoleMenuOpen(false);

    let cancelled = false;
    async function loadCandidates() {
      try {
        const { data } = await projectApi.listMemberCandidates(projectId, {
          department: project?.departmentName || undefined,
        });
        if (!cancelled) {
          setCandidateUsers(data || []);
        }
      } catch {
        if (!cancelled) {
          setCandidateUsers([]);
        }
      }
    }

    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [isOpen, project?.departmentName, projectId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (userFieldRef.current && !userFieldRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
      if (roleFieldRef.current && !roleFieldRef.current.contains(target)) {
        setIsRoleMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const activeMemberIds = useMemo(
    () =>
      new Set(
        existingMembers
          .filter((member) => member.isActive)
          .map((member) => String(member.userId)),
      ),
    [existingMembers],
  );

  const selectedUserIds = useMemo(
    () =>
      new Set(
        selectedPeople
          .filter((person): person is { kind: "user"; user: UserProfile } => person.kind === "user")
          .map((person) => person.user.id),
      ),
    [selectedPeople],
  );

  const selectedEmails = useMemo(
    () =>
      new Set(
        selectedPeople
          .filter((person): person is { kind: "invite"; email: string } => person.kind === "invite")
          .map((person) => person.email.toLowerCase()),
      ),
    [selectedPeople],
  );

  const availableUsers = useMemo(() => {
    const byId = new Map<string, UserProfile>();
    for (const user of [...accessibleUsers, ...candidateUsers]) {
      byId.set(user.id, user);
    }
    return Array.from(byId.values()).filter((user) => {
      const numericId = user.id.replace("usr-", "");
      return !activeMemberIds.has(numericId) && !selectedUserIds.has(user.id);
    });
  }, [accessibleUsers, activeMemberIds, candidateUsers, selectedUserIds]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return availableUsers.slice(0, 8);
    }
    return availableUsers
      .filter(
        (user) =>
          user.name.toLowerCase().includes(normalized) ||
          user.email.toLowerCase().includes(normalized),
      )
      .slice(0, 8);
  }, [availableUsers, query]);

  const roleOptions = useMemo(() => {
    const options = SYSTEM_ROLE_OPTIONS.map((role) => ({
      value: role,
      label: roleLabel(role),
    }));
    const extras = selectedRoles
      .filter((role) => !SYSTEM_ROLE_OPTIONS.includes(role as (typeof SYSTEM_ROLE_OPTIONS)[number]))
      .map((role) => ({ value: role, label: role }));
    return [...options, ...extras];
  }, [selectedRoles]);

  const visibleRoleOptions = useMemo(() => {
    const normalized = roleQuery.trim().toLowerCase();
    if (!normalized) {
      return roleOptions;
    }
    return roleOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(normalized) ||
        option.value.toLowerCase().includes(normalized),
    );
  }, [roleOptions, roleQuery]);

  const canCreateRole =
    roleQuery.trim().length > 0 &&
    !roleOptions.some(
      (option) => option.label.toLowerCase() === roleQuery.trim().toLowerCase(),
    );

  const trimmedQuery = query.trim();
  const showInvite =
    isEmail(trimmedQuery) &&
    !selectedEmails.has(trimmedQuery.toLowerCase()) &&
    !availableUsers.some((user) => user.email.toLowerCase() === trimmedQuery.toLowerCase()) &&
    !accessibleUsers.some((user) => user.email.toLowerCase() === trimmedQuery.toLowerCase());

  const userError = showErrors && selectedPeople.length === 0;
  const roleError = showErrors && selectedRoles.length === 0;
  const canSubmit = selectedPeople.length > 0 && selectedRoles.length > 0 && !isSubmitting;

  function addUser(user: UserProfile) {
    setSelectedPeople((current) => [...current, { kind: "user", user }]);
    setQuery("");
    setIsUserMenuOpen(true);
    inputRef.current?.focus();
  }

  function addInvite(email: string) {
    setSelectedPeople((current) => [...current, { kind: "invite", email }]);
    setQuery("");
    setIsUserMenuOpen(true);
    inputRef.current?.focus();
  }

  function removePerson(index: number) {
    setSelectedPeople((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function toggleRole(role: string) {
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );
  }

  async function handleSubmit() {
    setShowErrors(true);
    setSubmitError(null);
    if (selectedPeople.length === 0 || selectedRoles.length === 0) {
      return;
    }

    setIsSubmitting(true);
    const roleId = resolveProjectRoleId(selectedRoles, projectRoles);
    const systemRole = resolveSystemRole(selectedRoles);

    try {
      for (const person of selectedPeople) {
        if (person.kind === "user") {
          await projectApi.addMember(projectId, person.user.id, roleId);
          continue;
        }

        const created = await userApi.create({
          name: person.email.split("@")[0],
          email: person.email,
          role: systemRole,
          password: "123456",
          department: project?.departmentName || "",
        });
        await projectApi.addMember(projectId, created.data.id, roleId);
      }

      await onAdded();
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Không thể thêm thành viên. Vui lòng thử lại.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-member-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="add-member-title">Thêm thành viên</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Đóng">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.field} ref={userFieldRef}>
            <span className={styles.fieldLabel}>Người dùng</span>
            <div className={styles.combobox}>
              <div className={styles.comboboxBox} onClick={() => inputRef.current?.focus()}>
                {selectedPeople.map((person, index) => (
                  <span key={person.kind === "user" ? person.user.id : person.email} className={styles.chip}>
                    {person.kind === "user" ? (
                      <UserAvatar
                        userId={person.user.id}
                        email={person.user.email}
                        name={person.user.name}
                        avatarUrl={person.user.avatarUrl}
                        size={20}
                      />
                    ) : null}
                    <span className={styles.chipName}>
                      {person.kind === "user" ? person.user.name : person.email}
                    </span>
                    <button
                      type="button"
                      className={styles.chipRemove}
                      aria-label="Xóa"
                      onClick={() => removePerson(index)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  className={styles.comboboxInput}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setIsUserMenuOpen(true);
                  }}
                  onFocus={() => setIsUserMenuOpen(true)}
                  placeholder={
                    selectedPeople.length === 0 ? "Nhập tên hoặc email người dùng..." : "Thêm người khác..."
                  }
                />
              </div>
              {isUserMenuOpen ? (
                <div className={styles.dropdown}>
                  {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={styles.option}
                      onClick={() => addUser(user)}
                    >
                      <UserAvatar
                        userId={user.id}
                        email={user.email}
                        name={user.name}
                        avatarUrl={user.avatarUrl}
                        size={32}
                      />
                      <span className={styles.optionCopy}>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </span>
                    </button>
                  ))}
                  {showInvite ? (
                    <button
                      type="button"
                      className={classNames(styles.option, styles.inviteOption)}
                      onClick={() => addInvite(trimmedQuery)}
                    >
                      Mời qua email: {trimmedQuery}
                    </button>
                  ) : null}
                  {filteredUsers.length === 0 && !showInvite ? (
                    <div className={styles.emptyHint}>Không tìm thấy người dùng phù hợp.</div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {userError ? <span className={styles.fieldError}>Vui lòng chọn ít nhất một người dùng.</span> : null}
          </div>

          <div className={styles.field} ref={roleFieldRef}>
            <span className={styles.fieldLabel}>Vai trò</span>
            {selectedRoles.length > 0 ? (
              <div className={styles.selectedRoles}>
                <RoleTags labels={selectedRoles.flatMap((role) => roleDisplayLabels(role))} />
              </div>
            ) : null}
            <div className={styles.combobox}>
              <button
                type="button"
                className={classNames(styles.roleTrigger, isRoleMenuOpen && styles.roleTriggerOpen)}
                onClick={() => setIsRoleMenuOpen((current) => !current)}
              >
                <span className={selectedRoles.length ? undefined : styles.rolePlaceholder}>
                  {selectedRoles.length > 0
                    ? `Vai trò (${selectedRoles.length})`
                    : "Chọn vai trò"}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isRoleMenuOpen ? (
                <div className={styles.roleMenu}>
                  <input
                    className={styles.roleSearch}
                    value={roleQuery}
                    onChange={(event) => setRoleQuery(event.target.value)}
                    placeholder="Tìm hoặc thêm vai trò..."
                  />
                  <div className={styles.roleList}>
                    {visibleRoleOptions.map((option) => (
                      <label key={option.value} className={styles.roleItem}>
                        <input
                          type="checkbox"
                          checked={selectedRoles.includes(option.value)}
                          onChange={() => toggleRole(option.value)}
                        />
                        <RoleTags labels={roleDisplayLabels(option.value)} />
                      </label>
                    ))}
                    {canCreateRole ? (
                      <button
                        type="button"
                        className={classNames(styles.option, styles.inviteOption)}
                        onClick={() => {
                          toggleRole(roleQuery.trim());
                          setRoleQuery("");
                        }}
                      >
                        Thêm vai trò: {roleQuery.trim()}
                      </button>
                    ) : null}
                    {visibleRoleOptions.length === 0 && !canCreateRole ? (
                      <div className={styles.emptyHint}>Không có vai trò phù hợp.</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {roleError ? <span className={styles.fieldError}>Vui lòng chọn ít nhất một vai trò.</span> : null}
          </div>

          {submitError ? <span className={styles.fieldError}>{submitError}</span> : null}
        </div>

        <footer className={styles.footer}>
          <button type="button" className="secondary-button" onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className="primary-button"
            aria-disabled={!canSubmit}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {isSubmitting ? "Đang thêm..." : "Thêm thành viên"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
