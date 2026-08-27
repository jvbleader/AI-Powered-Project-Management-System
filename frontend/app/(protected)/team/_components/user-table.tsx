"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { formatEmployeeCode } from "@/lib/utils/format";
import { UserAvatar } from "@/components/user-avatar";
import { EmptyState, Surface, StatusPill } from "@/components/ui";
import {
  expandRoleDisplayLabels,
  userStatusLabel,
  getRoleTone,
  ROLE_DIRECTOR,
} from "@/lib/utils/format";
import {
  SYSTEM_ROLE_OPTIONS,
  type PaginatedUsers,
  type UserDirectoryFilters,
  type UserStatus,
  type UserProfile,
} from "@/types";
import styles from "../styles/team.module.css";

interface UserTableProps {
  directory: PaginatedUsers;
  taskSummaryByUserId: Record<string, { total: number; open: number; inProgress: number }>;
  isLoading: boolean;
  canManageUsers: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onAddUserClick: () => void;
  onUserSelect: (user: UserProfile) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: UserDirectoryFilters["status"];
  onStatusFilterChange: (value: UserDirectoryFilters["status"]) => void;
  roleFilter: UserDirectoryFilters["role"];
  onRoleFilterChange: (value: UserDirectoryFilters["role"]) => void;
  departmentFilter: UserDirectoryFilters["department"];
  onDepartmentFilterChange: (value: UserDirectoryFilters["department"]) => void;
  departments: { id: number; name: string }[];
  roles?: string[];
  canFilterDepartment?: boolean;
  currentDepartment?: string;
  hideDirectorRoles?: boolean;
  tableAnchorRef?: RefObject<HTMLDivElement | null>;
}

type FilterOption = { value: string; label: string };
type OpenFilter = "search" | "role" | "status" | "department" | null;

function getStatusTone(status: UserStatus) {
  if (status === "ACTIVE") {
    return "on-track" as const;
  }
  return "critical" as const;
}

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? styles.filterIconActive : styles.filterIcon}
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? styles.filterIconActive : styles.filterIcon}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ColumnSearch({
  label,
  active,
  open,
  value,
  onChange,
  onToggle,
  onClose,
  inputRef,
}: {
  label: string;
  active: boolean;
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const showInput = open || active;

  return (
    <div className={styles.headerFilter}>
      {showInput ? (
        <>
          <span className={styles.headerSearchPlaceholder} aria-hidden>
            <span>{label}</span>
            <SearchIcon active={false} />
          </span>
          <div className={styles.headerSearchInputWrap}>
            <span className={styles.headerSearchIcon} aria-hidden>
              <SearchIcon active={active} />
            </span>
            <input
              ref={inputRef}
              type="text"
              className={styles.headerSearchInput}
              placeholder="Họ tên hoặc email"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              aria-label="Tìm kiếm người dùng"
            />
            <button
              type="button"
              className={styles.headerSearchClose}
              onClick={onClose}
              aria-label="Đóng tìm kiếm"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className={styles.searchLabelButton}
            onClick={onToggle}
            aria-label={`Tìm kiếm ${label.toLowerCase()}`}
          >
            {label}
          </button>
          <div className={styles.filterTriggerWrap}>
            <button
              type="button"
              className={styles.filterIconButton}
              onClick={onToggle}
              aria-label="Tìm kiếm người dùng"
            >
              <SearchIcon active={false} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ColumnFilter({
  label,
  active,
  open,
  onToggle,
  menu,
  triggerRef,
  wrapRef,
  disabled,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  menu: ReactNode;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}) {
  return (
    <div className={styles.headerFilter}>
      <span>{label}</span>
      <div className={styles.filterTriggerWrap} ref={wrapRef}>
        <button
          type="button"
          ref={triggerRef}
          className={`${styles.filterIconButton} ${active ? styles.filterIconButtonActive : ""}`}
          onClick={onToggle}
          disabled={disabled}
          aria-label={`Lọc ${label}`}
        >
          <FilterIcon active={active} />
        </button>
        {open ? menu : null}
      </div>
    </div>
  );
}

export function UserTable({
  directory,
  taskSummaryByUserId,
  isLoading,
  canManageUsers,
  page,
  onPageChange,
  onAddUserClick,
  onUserSelect,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  roleFilter,
  onRoleFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  departments,
  roles,
  canFilterDepartment = true,
  currentDepartment = "",
  hideDirectorRoles = false,
  tableAnchorRef,
}: UserTableProps) {
  void taskSummaryByUserId;

  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const roleWrapRef = useRef<HTMLDivElement>(null);
  const roleBtnRef = useRef<HTMLButtonElement>(null);
  const statusWrapRef = useRef<HTMLDivElement>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const deptWrapRef = useRef<HTMLDivElement>(null);
  const deptBtnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const roleOptions = useMemo<FilterOption[]>(() => {
    const source = roles?.length ? roles : [...SYSTEM_ROLE_OPTIONS];
    const visibleRoles = hideDirectorRoles
      ? source.filter((role) => role !== ROLE_DIRECTOR && role !== "Trợ lý giám đốc")
      : source;
    return [
      { value: "ALL", label: "Tất cả vai trò" },
      ...visibleRoles.map((role) => ({ value: role, label: expandRoleDisplayLabels(role).join(" / ") || role })),
    ];
  }, [hideDirectorRoles, roles]);

  const statusOptions = useMemo<FilterOption[]>(
    () => [
      { value: "ALL", label: "Tất cả trạng thái" },
      { value: "ACTIVE", label: userStatusLabel("ACTIVE") },
      { value: "INACTIVE", label: userStatusLabel("INACTIVE") },
    ],
    [],
  );

  const departmentOptions = useMemo<FilterOption[]>(
    () => [
      { value: "ALL", label: "Tất cả phòng ban" },
      ...departments.map((dept) => ({ value: dept.name, label: dept.name })),
    ],
    [departments],
  );

  function getButtonRef(filter: OpenFilter) {
    if (filter === "role") return roleBtnRef;
    if (filter === "status") return statusBtnRef;
    if (filter === "department") return deptBtnRef;
    return null;
  }

  function updateMenuPosition(filter: OpenFilter) {
    const button = getButtonRef(filter)?.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, left: rect.left });
  }

  function toggleFilter(filter: OpenFilter) {
    setOpenFilter((current) => {
      const next = current === filter ? null : filter;
      if (next) {
        updateMenuPosition(next);
      } else {
        setMenuPos(null);
      }
      return next;
    });
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inAnyTrigger =
        roleWrapRef.current?.contains(target) ||
        statusWrapRef.current?.contains(target) ||
        deptWrapRef.current?.contains(target);
      const inMenu = (target as Element | null)?.closest?.("[data-team-column-menu]");
      if (!inAnyTrigger && !inMenu) {
        setOpenFilter(null);
        setMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (openFilter === "search") {
      searchInputRef.current?.focus();
    }
  }, [openFilter]);

  useEffect(() => {
    if (!openFilter) return;
    const handleReposition = () => updateMenuPosition(openFilter);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [openFilter]);

  function renderOptionsMenu(
    options: FilterOption[],
    value: string,
    onChange: (value: string) => void,
  ) {
    if (!menuPos || typeof document === "undefined") return null;
    return createPortal(
      <div
        className={styles.dropdownMenu}
        data-team-column-menu
        style={{ top: menuPos.top, left: menuPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dropdownList}>
          {options.map((option) => (
            <div
              key={option.value}
              className={`${styles.dropdownItem} ${value === option.value ? styles.dropdownItemActive : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpenFilter(null);
                setMenuPos(null);
              }}
            >
              {value === option.value ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <div className={styles.dropdownSpacer} />
              )}
              {option.label}
            </div>
          ))}
        </div>
      </div>,
      document.body,
    );
  }

  const surfaceTitle = currentDepartment?.trim() || "Danh sách người dùng";

  return (
    <Surface
      title={surfaceTitle}
      className={styles.tableSurface}
      aside={
        canManageUsers ? (
          <div className={styles.toolbarActions}>
            <button type="button" className={`primary-button ${styles.addUserButton}`} onClick={onAddUserClick}>
              + Thêm nhân sự
            </button>
          </div>
        ) : undefined
      }
    >
      <>
          <div className={styles.tableWrap} ref={tableAnchorRef}>
            <table className={styles.table}>
              <colgroup>
                <col className={styles.colUser} />
                <col className={styles.colEmployeeCode} />
                <col className={styles.colEmail} />
                <col className={styles.colRole} />
                <col className={styles.colStatus} />
                <col className={styles.colDepartment} />
                <col className={styles.colPhone} />
              </colgroup>
              <thead>
                <tr>
                  <th className={styles.userColumnHeader}>
                    <ColumnSearch
                      label="Nhân viên"
                      active={Boolean(search.trim())}
                      open={openFilter === "search"}
                      value={search}
                      onChange={onSearchChange}
                      onToggle={() => toggleFilter("search")}
                      onClose={() => {
                        onSearchChange("");
                        setOpenFilter(null);
                      }}
                      inputRef={searchInputRef}
                    />
                  </th>
                  <th>Mã</th>
                  <th>Email</th>
                  <th>
                    <ColumnFilter
                      label="Vai trò"
                      active={Boolean(roleFilter && roleFilter !== "ALL")}
                      open={openFilter === "role"}
                      onToggle={() => toggleFilter("role")}
                      menu={renderOptionsMenu(roleOptions, roleFilter ?? "ALL", (value) =>
                        onRoleFilterChange(value as UserDirectoryFilters["role"]),
                      )}
                      triggerRef={roleBtnRef}
                      wrapRef={roleWrapRef}
                    />
                  </th>
                  <th>
                    <ColumnFilter
                      label="Trạng thái"
                      active={Boolean(statusFilter && statusFilter !== "ALL")}
                      open={openFilter === "status"}
                      onToggle={() => toggleFilter("status")}
                      menu={renderOptionsMenu(statusOptions, statusFilter ?? "ALL", (value) =>
                        onStatusFilterChange(value as UserDirectoryFilters["status"]),
                      )}
                      triggerRef={statusBtnRef}
                      wrapRef={statusWrapRef}
                    />
                  </th>
                  <th>
                    {canFilterDepartment ? (
                      <ColumnFilter
                        label="Phòng ban"
                        active={Boolean(departmentFilter && departmentFilter !== "ALL")}
                        open={openFilter === "department"}
                        onToggle={() => toggleFilter("department")}
                        menu={renderOptionsMenu(
                          departmentOptions,
                          departmentFilter ?? "ALL",
                          (value) =>
                            onDepartmentFilterChange(value as UserDirectoryFilters["department"]),
                        )}
                        triggerRef={deptBtnRef}
                        wrapRef={deptWrapRef}
                      />
                    ) : (
                      "Phòng ban"
                    )}
                  </th>
                  <th>Số điện thoại</th>
                </tr>
              </thead>
              <tbody>
                {directory.items.map((user) => {
                  return (
                    <tr
                      key={user.id}
                      className={styles.clickableRow}
                      onClick={() => onUserSelect(user)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onUserSelect(user);
                        }
                      }}
                    >
                      <td>
                        <div className={styles.userCellButton}>
                          <UserAvatar
                            userId={user.id}
                            email={user.email}
                            name={user.name}
                            avatarUrl={user.avatarUrl}
                            size={34}
                            className={styles.avatarToken}
                          />
                          <span className={styles.userCellCopy}>
                            <strong>{user.name}</strong>
                          </span>
                        </div>
                      </td>
                      <td>{user.employeeCode ?? formatEmployeeCode(user.id)}</td>
                      <td>
                        <div className={styles.contactCell}>
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.roleStack}>
                          {expandRoleDisplayLabels(
                            user.roles?.length ? user.roles : user.role,
                          ).map((rolePart, idx) => (
                            <StatusPill
                              key={idx}
                              label={rolePart}
                              tone={getRoleTone(rolePart as any)}
                              style={{ borderRadius: "10px", padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                            />
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusPill
                          label={userStatusLabel(user.status ?? "ACTIVE")}
                          tone={getStatusTone(user.status ?? "ACTIVE")}
                        />
                      </td>
                      <td>
                        <div className={styles.contactCell}>
                          <span>{user.department || "Chưa có"}</span>
                        </div>
                      </td>
                      <td>{user.phoneNumber || "Chưa có"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {directory.items.length === 0 && (
            <EmptyState
              title={isLoading ? "Đang tải danh sách người dùng" : "Không tìm thấy người dùng phù hợp"}
              description={
                isLoading
                  ? "Hệ thống đang dựng dữ liệu preview cho màn quản lý người dùng."
                  : "Thử đổi từ khóa tìm kiếm hoặc bỏ bớt bộ lọc để xem nhiều kết quả hơn."
              }
            />
          )}
        </>
    </Surface>
  );
}
