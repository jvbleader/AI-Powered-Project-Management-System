"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import styles from "./project-members.module.css";

type FilterOption = {
  value: string;
  label: string;
};

type MemberFiltersProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  roleOptions: FilterOption[];
  roleFilter: string[];
  onRoleFilterChange: (value: string[]) => void;
  statusOptions: FilterOption[];
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
};

type OpenMenu = "role" | "status" | null;

function toggleValue(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function FilterIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function FilterButton({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.filterWrap}>
      <button
        type="button"
        className={`${styles.filterButton} ${open ? styles.filterButtonOpen : ""} ${count > 0 ? styles.filterButtonActive : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-pressed={count > 0}
        onClick={onToggle}
      >
        <FilterIcon />
        <span>
          {label}
          {count > 0 ? <span className={styles.filterBadge}>({count})</span> : null}
        </span>
      </button>
      {open ? children : null}
    </div>
  );
}

export function MemberFilters({
  searchQuery,
  onSearchChange,
  roleOptions,
  roleFilter,
  onRoleFilterChange,
  statusOptions,
  statusFilter,
  onStatusFilterChange,
}: MemberFiltersProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [roleSearch, setRoleSearch] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (toolbarRef.current && !toolbarRef.current.contains(target)) {
        setOpenMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (openMenu !== "role") {
      setRoleSearch("");
    }
  }, [openMenu]);

  const visibleRoleOptions = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    if (!query) {
      return roleOptions;
    }
    return roleOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [roleOptions, roleSearch]);

  function toggleMenu(menu: Exclude<OpenMenu, null>) {
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  return (
    <div className={styles.toolbar} ref={toolbarRef}>
      <input
        type="text"
        className={styles.searchInput}
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Nhập tên hoặc email người dùng..."
        aria-label="Tìm kiếm thành viên"
      />

      <FilterButton
        label="Vai trò"
        count={roleFilter.length}
        open={openMenu === "role"}
        onToggle={() => toggleMenu("role")}
      >
        <div className={styles.filterPanel} role="listbox" aria-label="Lọc vai trò">
          <input
            type="text"
            className={styles.filterSearch}
            value={roleSearch}
            onChange={(event) => setRoleSearch(event.target.value)}
            placeholder="Tìm vai trò..."
            aria-label="Tìm vai trò"
            onClick={(event) => event.stopPropagation()}
          />
          <ul className={styles.filterList}>
            {visibleRoleOptions.length === 0 ? (
              <li className={styles.filterEmpty}>Không có vai trò phù hợp</li>
            ) : (
              visibleRoleOptions.map((option) => (
                <li key={option.value}>
                  <label className={styles.menuItem}>
                    <input
                      type="checkbox"
                      checked={roleFilter.includes(option.value)}
                      onChange={() => onRoleFilterChange(toggleValue(roleFilter, option.value))}
                    />
                    <span>{option.label}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      </FilterButton>

      <FilterButton
        label="Trạng thái"
        count={statusFilter.length}
        open={openMenu === "status"}
        onToggle={() => toggleMenu("status")}
      >
        <div className={styles.filterPanel} role="listbox" aria-label="Lọc trạng thái">
          <ul className={styles.filterList}>
            {statusOptions.map((option) => (
              <li key={option.value}>
                <label className={styles.menuItem}>
                  <input
                    type="checkbox"
                    checked={statusFilter.includes(option.value)}
                    onChange={() => onStatusFilterChange(toggleValue(statusFilter, option.value))}
                  />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </FilterButton>
    </div>
  );
}
