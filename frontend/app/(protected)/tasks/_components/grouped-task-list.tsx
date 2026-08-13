"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "@/components/ui";
import { EnrichedTask, Project, TaskStatus, UserProfile } from "@/types";
import {
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
        .map((user) => (user.employeeCode || user.id || "").toString().trim())
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

function ColumnFilter({
  label,
  value,
  options,
  open,
  onToggle,
  onChange,
  searchPlaceholder,
}: {
  label: string;
  value: string;
  options: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (next: string) => void;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onToggle();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onToggle]);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className={styles.headerFilter} ref={rootRef}>
      <span>{label}</span>
      <div className={styles.filterTriggerWrap}>
        <button
          type="button"
          className={`${styles.filterIconButton} ${value ? styles.filterIconButtonActive : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          aria-label={`Lọc ${label}`}
        >
          <FilterIcon active={Boolean(value)} />
        </button>
        {open ? (
          <div className={styles.dropdownMenu} onClick={(event) => event.stopPropagation()}>
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
            <div className={styles.dropdownList}>
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
        ) : null}
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
          <ColumnFilter
            label="Người phụ trách"
            value={filters.assigneeName}
            options={filterOptions.assigneeName}
            open={openFilter === "assigneeName"}
            onToggle={() => onToggleFilter("assigneeName")}
            onChange={(value) => onChangeFilter("assigneeName", value)}
            searchPlaceholder="Tìm người phụ trách..."
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
          />
        </th>
        <th className={styles.colDue} scope="col">
          <ColumnFilter
            label="Hạn"
            value={filters.dueDate}
            options={filterOptions.dueDate}
            open={openFilter === "dueDate"}
            onToggle={() => onToggleFilter("dueDate")}
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

  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filters.key && task.key !== filters.key) return false;
      if (filters.title && task.title !== filters.title) return false;
      if (filters.assigneeCode) {
        const codes = getTaskAssigneeCodes(task);
        if (!codes.includes(filters.assigneeCode)) return false;
      }
      if (filters.assigneeName) {
        const names = getTaskAssigneeNames(task);
        if (!names.includes(filters.assigneeName)) return false;
      }
      if (filters.status && taskStatusLabel(task.status) !== filters.status) return false;
      if (filters.priority && taskPriorityLabel(task.priority) !== filters.priority) return false;
      if (filters.dueDate && formatDueDate(task.dueDate) !== filters.dueDate) return false;
      return true;
    });
  }, [filters, tasks]);

  const filterOptions = useMemo(() => {
    const keys = new Set<string>();
    const titles = new Set<string>();
    const assigneeCodes = new Set<string>();
    const assigneeNames = new Set<string>();
    const statuses = new Set<string>();
    const priorities = new Set<string>();
    const dueDates = new Set<string>();

    for (const task of tasks) {
      if (task.key) keys.add(task.key);
      if (task.title) titles.add(task.title);
      getTaskAssigneeCodes(task).forEach((code) => assigneeCodes.add(code));
      getTaskAssigneeNames(task).forEach((name) => assigneeNames.add(name));
      statuses.add(taskStatusLabel(task.status));
      priorities.add(taskPriorityLabel(task.priority));
      dueDates.add(formatDueDate(task.dueDate));
    }

    return {
      key: Array.from(keys).sort(),
      title: Array.from(titles).sort((a, b) => a.localeCompare(b, "vi")),
      assigneeCode: Array.from(assigneeCodes).sort(),
      assigneeName: Array.from(assigneeNames).sort((a, b) => a.localeCompare(b, "vi")),
      status: Array.from(statuses),
      priority: Array.from(priorities),
      dueDate: Array.from(dueDates).sort(),
    };
  }, [tasks]);

  const projectGroups = useMemo(() => {
    if (selectedProject) {
      return [
        {
          project: selectedProject,
          tasks: filteredTasks.filter((task) => task.projectId === selectedProject.id),
        },
      ];
    }

    return projects
      .map((project) => ({
        project,
        tasks: filteredTasks.filter((task) => task.projectId === project.id),
      }))
      .filter((entry) => entry.tasks.length > 0)
      .sort((left, right) => right.tasks.length - left.tasks.length);
  }, [filteredTasks, projects, selectedProject]);

  if (tasks.length === 0) {
    return null;
  }

  const toggleProject = (projectId: string) => {
    setCollapsedIds((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const setFilterValue = (key: FilterKey, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setOpenFilter(null);
    setPageByProjectId({});
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

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className={styles.container}>
      {hasActiveFilters && projectGroups.length === 0 ? (
        <div className={styles.emptyFilterResult}>
          Không có nhiệm vụ khớp bộ lọc hiện tại.
          <button
            type="button"
            className={styles.clearFiltersButton}
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setPageByProjectId({});
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      ) : null}

      {projectGroups.map(({ project, tasks: projectTasks }, groupIndex) => {
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
                      filters={filters}
                      filterOptions={filterOptions}
                      openFilter={
                        openFilter?.projectId === project.id ? openFilter.key : null
                      }
                      onToggleFilter={(key) => toggleFilter(project.id, key)}
                      onChangeFilter={setFilterValue}
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
                              Không có nhiệm vụ nào trong dự án này
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
