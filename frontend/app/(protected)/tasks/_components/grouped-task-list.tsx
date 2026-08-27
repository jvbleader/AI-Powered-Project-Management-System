"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StatusPill } from "@/components/ui";
import { EnrichedTask, Project, TaskStatus, UserProfile } from "@/types";
import {
  formatEmployeeCode,
  taskPriorityLabel,
  taskPriorityPillStyle,
  taskStatusLabel,
  taskStatusTone,
} from "@/lib/utils/format";
import { useAutoPageSize } from "@/hooks/use-auto-page-size";
import styles from "./grouped-task-list.module.css";

interface GroupedTaskListProps {
  projects: Project[];
  tasks: EnrichedTask[];
  selectedProjectId: string;
  onTaskClick?: (taskId: string) => void;
}

type DueTone = "neutral" | "soon" | "overdue";
type FilterKey = "key" | "title" | "assigneeCode" | "assigneeName" | "status" | "priority" | "dueDate";

type ColumnFilters = Record<FilterKey, string>;
type FilterOptions = Record<FilterKey, string[]>;

const EMPTY_FILTERS: ColumnFilters = {
  key: "",
  title: "",
  assigneeCode: "",
  assigneeName: "",
  status: "",
  priority: "",
  dueDate: "",
};


function getDueTone(dueDate: string | undefined, status: TaskStatus): DueTone {
  if (!dueDate || status === "DONE") return "neutral";

  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = (due.getTime() - now.getTime()) / msPerDay;

  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "soon";
  return "neutral";
}

function dueToneClass(tone: DueTone) {
  if (tone === "overdue") return styles.dueOverdue;
  if (tone === "soon") return styles.dueSoon;
  return "";
}

function formatDueDate(dueDate?: string) {
  if (!dueDate) return "—";
  return new Date(dueDate).toLocaleDateString("vi-VN");
}

function dueDateInputValue(dueDate?: string) {
  return dueDate?.slice(0, 10) || "";
}

function getTaskAssignees(task: EnrichedTask): UserProfile[] {
  if (task.assignees?.length) return task.assignees;
  if (task.assignee) return [task.assignee];
  return [];
}

function getTaskAssigneeNames(task: EnrichedTask): string[] {
  return Array.from(
    new Set(
      getTaskAssignees(task)
        .map((user) => (user.name || "").trim())
        .filter(Boolean),
    ),
  );
}

function getTaskAssigneeCodes(task: EnrichedTask): string[] {
  return Array.from(
    new Set(
      getTaskAssignees(task)
        .map((user) => (user.employeeCode || formatEmployeeCode(user.id) || "").toString().trim())
        .filter(Boolean),
    ),
  );
}

function getTaskAssigneeNamesLabel(task: EnrichedTask) {
  const names = getTaskAssigneeNames(task);
  return names.length > 0 ? names.join(", ") : "—";
}

function getTaskAssigneeCodesLabel(task: EnrichedTask) {
  const codes = getTaskAssigneeCodes(task);
  return codes.length > 0 ? codes.join(", ") : "—";
}

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? styles.filterIconActive : styles.filterIcon}
      aria-hidden
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
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ColumnSearch({
  label,
  value,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showInput = open || Boolean(value.trim());

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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
              <SearchIcon active={Boolean(value.trim())} />
            </span>
            <input
              ref={inputRef}
              type="text"
              className={styles.headerSearchInput}
              placeholder="Tìm người phụ trách..."
              value={value}
              onChange={(event) => onChange(event.target.value)}
              aria-label="Tìm người phụ trách"
            />
            <button
              type="button"
              className={styles.headerSearchClose}
              onClick={() => onChange("")}
              aria-label="Đóng tìm kiếm người phụ trách"
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
            aria-label="Tìm người phụ trách"
          >
            {label}
          </button>
          <button
            type="button"
            className={styles.filterIconButton}
            onClick={onToggle}
            aria-label="Tìm người phụ trách"
          >
            <SearchIcon active={false} />
          </button>
        </>
      )}
    </div>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
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
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function DateColumnFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.headerFilter}>
      <span>{label}</span>
      <div className={styles.filterTriggerWrap}>
        {value ? (
          <span className={styles.filterChip}>
            {new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
            <button
              type="button"
              className={styles.filterChipButton}
              onClick={() => onChange("")}
              aria-label="Xóa bộ lọc hạn"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ) : null}
        <button
          type="button"
          className={`${styles.filterIconButton} ${value ? styles.filterIconButtonActive : ""}`}
          onClick={() => inputRef.current?.showPicker()}
          aria-label="Lọc theo hạn"
        >
          <CalendarIcon active={Boolean(value)} />
        </button>
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={styles.hiddenDateInput}
          tabIndex={-1}
        />
      </div>
    </div>
  );
}

function ColumnFilter({
  label,
  value,
  options,
  open,
  onToggle,
  onChange,
  searchPlaceholder,
  searchable = true,
}: {
  label: string;
  value: string;
  options: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (next: string) => void;
  searchPlaceholder?: string;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setMenuPosition({ top: rect.bottom + 6, left: rect.left });
    };

    updateMenuPosition();

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setQuery("");
        onToggle();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, onToggle]);

  const filteredOptions = (searchable
    ? options.filter((option) => option && option.toLowerCase().includes(query.trim().toLowerCase()))
    : options
  ).filter((opt) => Boolean(opt && opt.trim() && opt !== "—"));

  return (
    <div className={styles.headerFilter} ref={rootRef}>
      <span>{label}</span>
      <div className={styles.filterTriggerWrap} ref={triggerRef}>
        <button
          type="button"
          className={`${styles.filterIconButton} ${value ? styles.filterIconButtonActive : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            if (open) setQuery("");
            onToggle();
          }}
          aria-label={`Lọc ${label}`}
        >
          <FilterIcon active={Boolean(value)} />
        </button>
        {open && menuPosition
          ? createPortal(
            <div
              ref={menuRef}
              className={styles.dropdownMenu}
              style={{ top: menuPosition.top, left: menuPosition.left }}
              onClick={(event) => event.stopPropagation()}
            >
            {searchable ? (
              <div className={styles.dropdownSearchWrap}>
                <input
                  type="text"
                  placeholder={searchPlaceholder || `Tìm ${label.toLowerCase()}...`}
                  className={styles.dropdownSearchInput}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                />
              </div>
            ) : null}
            <div className={styles.dropdownList}>
              <div className={styles.dropdownListInner}>
                <button
                  type="button"
                  className={`${styles.dropdownItem} ${value === "" ? styles.dropdownItemActive : ""}`}
                  onClick={() => onChange("")}
                >
                  Tất cả
                </button>
                {filteredOptions.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`${styles.dropdownItem} ${value === option ? styles.dropdownItemActive : ""}`}
                    onClick={() => onChange(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            </div>,
            document.body,
          )
          : null}
      </div>
    </div>
  );
}

function ColumnHeaderRow({
  filters,
  filterOptions,
  openFilter,
  onToggleFilter,
  onChangeFilter,
}: {
  filters: ColumnFilters;
  filterOptions: Record<FilterKey, string[]>;
  openFilter: FilterKey | null;
  onToggleFilter: (key: FilterKey) => void;
  onChangeFilter: (key: FilterKey, value: string) => void;
}) {
  return (
    <thead>
      <tr className={styles.columnHeaderRow}>
        <th className={styles.colKey} scope="col">
          <ColumnFilter
            label="Mã task"
            value={filters.key}
            options={filterOptions.key}
            open={openFilter === "key"}
            onToggle={() => onToggleFilter("key")}
            onChange={(value) => onChangeFilter("key", value)}
          />
        </th>
        <th className={styles.colTitle} scope="col">
          <ColumnFilter
            label="Tên nhiệm vụ"
            value={filters.title}
            options={filterOptions.title}
            open={openFilter === "title"}
            onToggle={() => onToggleFilter("title")}
            onChange={(value) => onChangeFilter("title", value)}
            searchPlaceholder="Tìm tên nhiệm vụ..."
          />
        </th>
        <th className={styles.colAssigneeCode} scope="col">
          <ColumnFilter
            label="Mã NV"
            value={filters.assigneeCode}
            options={filterOptions.assigneeCode}
            open={openFilter === "assigneeCode"}
            onToggle={() => onToggleFilter("assigneeCode")}
            onChange={(value) => onChangeFilter("assigneeCode", value)}
            searchPlaceholder="Tìm mã NV..."
          />
        </th>
        <th className={styles.colAssignee} scope="col">
          <ColumnSearch
            label="Người phụ trách"
            value={filters.assigneeName}
            open={openFilter === "assigneeName"}
            onToggle={() => onToggleFilter("assigneeName")}
            onChange={(value) => onChangeFilter("assigneeName", value)}
          />
        </th>
        <th className={styles.colStatus} scope="col">
          <ColumnFilter
            label="Trạng thái"
            value={filters.status}
            options={filterOptions.status}
            open={openFilter === "status"}
            onToggle={() => onToggleFilter("status")}
            onChange={(value) => onChangeFilter("status", value)}
            searchable={false}
          />
        </th>
        <th className={styles.colPriority} scope="col">
          <ColumnFilter
            label="Ưu tiên"
            value={filters.priority}
            options={filterOptions.priority}
            open={openFilter === "priority"}
            onToggle={() => onToggleFilter("priority")}
            onChange={(value) => onChangeFilter("priority", value)}
            searchable={false}
          />
        </th>
        <th className={styles.colDue} scope="col">
          <DateColumnFilter
            label="Hạn"
            value={filters.dueDate}
            onChange={(value) => onChangeFilter("dueDate", value)}
          />
        </th>
      </tr>
    </thead>
  );
}

export function GroupedTaskList({
  projects,
  tasks,
  selectedProjectId,
  onTaskClick,
}: GroupedTaskListProps) {
  const selectedProject =
    selectedProjectId === "ALL"
      ? null
      : projects.find((project) => project.id === selectedProjectId);

  const [filtersByProject, setFiltersByProject] = useState<Record<string, ColumnFilters>>({});
  const [openFilter, setOpenFilter] = useState<{ projectId: string; key: FilterKey } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [pageByProjectId, setPageByProjectId] = useState<Record<string, number>>({});
  const tableAnchorRef = useRef<HTMLElement>(null);
  const pageSize = useAutoPageSize({
    anchorRef: tableAnchorRef,
    rowHeight: 56,
    headerHeight: 48,
    footerHeight: 68,
    bottomGutter: 12,
    min: 4,
    max: 20,
    fallbackTop: 320,
    remeasureKey: tasks.length,
  });

  const projectGroups = useMemo(() => {
    const list = selectedProject ? [selectedProject] : projects;

    return list
      .map((project) => {
        const allProjectTasks = tasks.filter((task) => task.projectId === project.id);
        if (allProjectTasks.length === 0) return null;

        const pFilters = filtersByProject[project.id] || EMPTY_FILTERS;
        const filteredTasks = allProjectTasks.filter((task) => {
          if (pFilters.key && task.key !== pFilters.key) return false;
          if (pFilters.title && task.title !== pFilters.title) return false;
          if (pFilters.assigneeCode) {
            const codes = getTaskAssigneeCodes(task);
            if (!codes.includes(pFilters.assigneeCode)) return false;
          }
          if (pFilters.assigneeName) {
            const names = getTaskAssigneeNames(task);
            const query = pFilters.assigneeName.trim().toLocaleLowerCase();
            if (!names.some((name) => name.toLocaleLowerCase().includes(query))) return false;
          }
          if (pFilters.status && taskStatusLabel(task.status) !== pFilters.status) return false;
          if (pFilters.priority && taskPriorityLabel(task.priority) !== pFilters.priority) return false;
          if (pFilters.dueDate && dueDateInputValue(task.dueDate) !== pFilters.dueDate) return false;
          return true;
        });

        const keys = new Set<string>();
        const titles = new Set<string>();
        const assigneeCodes = new Set<string>();
        const assigneeNames = new Set<string>();
        const statuses = new Set<string>();
        const priorities = new Set<string>();
        const dueDates = new Set<string>();

        for (const task of allProjectTasks) {
          if (task.key) keys.add(task.key);
          if (task.title) titles.add(task.title);
          getTaskAssigneeCodes(task).forEach((code) => assigneeCodes.add(code));
          getTaskAssigneeNames(task).forEach((name) => assigneeNames.add(name));
          statuses.add(taskStatusLabel(task.status));
          priorities.add(taskPriorityLabel(task.priority));
          dueDates.add(formatDueDate(task.dueDate));
        }

        const filterOptions = {
          key: Array.from(keys).filter(Boolean).sort(),
          title: Array.from(titles).filter(Boolean).sort((a, b) => a.localeCompare(b, "vi")),
          assigneeCode: Array.from(assigneeCodes).filter(Boolean).sort(),
          assigneeName: Array.from(assigneeNames).filter(Boolean).sort((a, b) => a.localeCompare(b, "vi")),
          status: Array.from(statuses).filter(Boolean),
          priority: Array.from(priorities).filter(Boolean),
          dueDate: Array.from(dueDates).filter((d) => Boolean(d && d !== "—")).sort(),
        };

        return {
          project,
          allProjectTasks,
          tasks: filteredTasks,
          filterOptions,
          filters: pFilters,
        };
      })
      .filter(Boolean) as Array<{
        project: Project;
        allProjectTasks: EnrichedTask[];
        tasks: EnrichedTask[];
        filterOptions: FilterOptions;
        filters: ColumnFilters;
      }>;
  }, [tasks, projects, selectedProject, filtersByProject]);



  if (tasks.length === 0) {
    return null;
  }

  const toggleProject = (projectId: string) => {
    setCollapsedIds((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const setFilterValue = (projectId: string, key: FilterKey, value: string) => {
    setFiltersByProject((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || EMPTY_FILTERS),
        [key]: value,
      },
    }));
    setOpenFilter(null);
    setPageByProjectId((prev) => ({ ...prev, [projectId]: 1 }));
  };

  const toggleFilter = (projectId: string, key: FilterKey) => {
    setOpenFilter((current) =>
      current?.projectId === projectId && current.key === key
        ? null
        : { projectId, key },
    );
  };

  const setProjectPage = (projectId: string, nextPage: number) => {
    setPageByProjectId((prev) => ({ ...prev, [projectId]: nextPage }));
  };

  // The global "Không có nhiệm vụ khớp bộ lọc" message is removed since filters are per-project now.
  // Instead, each project will show an empty state if its tasks are filtered out.

  return (
    <div className={styles.container}>
      {projectGroups.map((group, groupIndex) => {
        const { project, tasks: projectTasks, filterOptions: pFilterOptions, filters: pFilters } = group;
        const isCollapsed = Boolean(collapsedIds[project.id]);
        const panelId = `project-tasks-${project.id}`;
        const totalPages = Math.max(1, Math.ceil(projectTasks.length / pageSize));
        const currentPage = Math.min(pageByProjectId[project.id] ?? 1, totalPages);
        const pageStart = (currentPage - 1) * pageSize;
        const paginatedTasks = projectTasks.slice(pageStart, pageStart + pageSize);

        return (
          <section
            key={project.id}
            className={styles.projectSection}
            ref={groupIndex === 0 ? tableAnchorRef : undefined}
          >
            <button
              type="button"
              className={`${styles.projectHeader} ${isCollapsed ? styles.projectHeaderCollapsed : ""}`}
              onClick={() => toggleProject(project.id)}
              aria-expanded={!isCollapsed}
              aria-controls={panelId}
            >
              <span className={styles.projectAccent} aria-hidden />
              <span className={styles.projectHeaderMain}>
                <span className={styles.projectTitleBlock}>
                  <span className={styles.projectLabel}>Dự án</span>
                  <span className={styles.projectIdentity}>
                    <span className={styles.projectTitle}>{project.name}</span>
                    <span
                      className={styles.taskCount}
                      title={`${projectTasks.length} nhiệm vụ`}
                    >
                      {projectTasks.length}
                      <span className={styles.taskCountLabel}> nhiệm vụ</span>
                    </span>
                  </span>
                </span>
              </span>
              <span
                className={`${styles.chevron} ${isCollapsed ? styles.chevronCollapsed : ""}`}
                aria-hidden
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>

            <div
              id={panelId}
              className={`${styles.collapsePanel} ${isCollapsed ? styles.collapsePanelClosed : ""}`}
            >
              <div className={styles.collapseInner}>
                <div className={styles.tableScroll}>
                  <table className={styles.taskTable}>
                    <colgroup>
                      <col className={styles.colKey} />
                      <col className={styles.colTitle} />
                      <col className={styles.colAssigneeCode} />
                      <col className={styles.colAssignee} />
                      <col className={styles.colStatus} />
                      <col className={styles.colPriority} />
                      <col className={styles.colDue} />
                    </colgroup>
                    <ColumnHeaderRow
                      filters={pFilters}
                      filterOptions={pFilterOptions}
                      openFilter={
                        openFilter?.projectId === project.id ? openFilter.key : null
                      }
                      onToggleFilter={(key) => toggleFilter(project.id, key)}
                      onChangeFilter={(key, value) => setFilterValue(project.id, key, value)}
                    />

                    <tbody>
                      {paginatedTasks.length > 0 ? (
                        paginatedTasks.map((task) => {
                          const dueTone = getDueTone(task.dueDate, task.status);
                          const assigneeLabel = getTaskAssigneeNamesLabel(task);
                          const assigneeCodeLabel = getTaskAssigneeCodesLabel(task);

                          return (
                            <tr
                              key={task.id}
                              className={styles.taskRow}
                              onClick={() => onTaskClick?.(task.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onTaskClick?.(task.id);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <td className={styles.colKey}>
                                <span className={styles.taskKey}>{task.key}</span>
                              </td>
                              <td className={styles.colTitle}>
                                <h4 className={styles.taskTitle} title={task.title}>
                                  {task.title}
                                </h4>
                              </td>
                              <td className={styles.colAssigneeCode}>
                                <span className={styles.assigneeCode} title={assigneeCodeLabel}>
                                  {assigneeCodeLabel}
                                </span>
                              </td>
                              <td className={styles.colAssignee}>
                                <span className={styles.assigneeName} title={assigneeLabel}>
                                  {assigneeLabel}
                                </span>
                              </td>
                              <td className={styles.colStatus}>
                                <StatusPill
                                  label={taskStatusLabel(task.status)}
                                  tone={taskStatusTone(task.status)}
                                />
                              </td>
                              <td className={styles.colPriority}>
                                <StatusPill
                                  label={taskPriorityLabel(task.priority)}
                                  style={taskPriorityPillStyle(task.priority)}
                                />
                              </td>
                              <td className={styles.colDue}>
                                <span
                                  className={`${styles.metaDue} ${dueToneClass(dueTone)}`}
                                  title={
                                    dueTone === "overdue"
                                      ? "Quá hạn"
                                      : dueTone === "soon"
                                        ? "Sắp đến hạn"
                                        : task.dueDate
                                          ? "Hạn hoàn thành"
                                          : undefined
                                  }
                                >
                                  {formatDueDate(task.dueDate)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7}>
                            <div className={styles.emptyProject}>
                              {Object.values(pFilters).some(Boolean)
                                ? "Không có nhiệm vụ nào khớp bộ lọc"
                                : "Không có nhiệm vụ nào trong dự án này"}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {projectTasks.length > 0 ? (
                  <div className={styles.paginationBar}>
                    <span>
                      Hiển thị {pageStart + 1} -{" "}
                      {Math.min(pageStart + pageSize, projectTasks.length)} /{" "}
                      {projectTasks.length} nhiệm vụ
                    </span>
                    <div className={styles.paginationActions}>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setProjectPage(project.id, Math.max(1, currentPage - 1))}
                        disabled={currentPage <= 1}
                      >
                        Trang trước
                      </button>
                      <span className={styles.paginationPage}>
                        {currentPage}/{totalPages}
                      </span>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setProjectPage(project.id, Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage >= totalPages}
                      >
                        Trang sau
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
