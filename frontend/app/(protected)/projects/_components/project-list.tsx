import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EmptyState, ProgressBar, StatusPill, Surface } from "@/components/ui";
import { FilterSelect } from "@/components/filter-select";
import {
  formatRange,
  canManageProjectMembership,
  projectStatusLabel,
} from "@/lib/utils/format";
import type { Project, UserRole } from "@/types";
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useAutoPageSize } from "@/hooks/use-auto-page-size";
import styles from "./project-list.module.css";

interface ProjectListProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  canManage: boolean;
  viewerId: string;
  viewerRole: string;
  viewerDepartment?: string;
  onAddProjectClick?: () => void;
  onEditProjectClick?: (project: Project) => void;
}


const STATUS_OPTIONS = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "ACTIVE", label: "Đang triển khai" },
  { value: "PLANNING", label: "Đang lập kế hoạch" },
  { value: "AT_RISK", label: "Rủi ro trễ hạn" },
  { value: "COMPLETED", label: "Đã hoàn thành" },
  { value: "ON_HOLD", label: "Tạm dừng" },
] as const;

export function ProjectList({
  projects,
  selectedProjectId,
  onSelectProject,
  canManage,
  viewerId,
  viewerRole,
  viewerDepartment,
  onAddProjectClick,
  onEditProjectClick,
}: ProjectListProps) {
  void onSelectProject;
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [statusMenuPos, setStatusMenuPos] = useState<{ top: number; left: number } | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const statusButtonRef = useRef<HTMLButtonElement>(null);
  const tableAnchorRef = useRef<HTMLDivElement>(null);
  const pageSize = useAutoPageSize({
    anchorRef: tableAnchorRef,
    rowHeight: 54,
    headerHeight: 48,
    footerHeight: 76,
    min: 5,
    max: 40,
    remeasureKey: projects.length,
  });

  function openProjectOverview(projectId: string) {
    router.push(`/projects/${projectId}?tab=overview`);
  }

  function updateStatusMenuPosition() {
    const button = statusButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setStatusMenuPos({
      top: rect.bottom + 6,
      left: rect.left,
    });
  }

  function toggleStatusDropdown() {
    setStatusDropdownOpen((open) => {
      const next = !open;
      if (next) {
        updateStatusMenuPosition();
      } else {
        setStatusMenuPos(null);
      }
      return next;
    });
  }

  const projectOptions = useMemo(
    () => [
      { value: "", label: "Tất cả dự án" },
      ...[...projects]
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .map((project) => ({
          value: project.id,
          label: project.name,
        })),
    ],
    [projects],
  );

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesProject = !projectFilter || project.id === projectFilter;
      const matchesStatus = statusFilter === "ALL" || project.status === statusFilter;
      return matchesProject && matchesStatus;
    });
  }, [projects, projectFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [projectFilter, statusFilter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = statusDropdownRef.current?.contains(target);
      const inMenu = (target as Element | null)?.closest?.("[data-project-status-menu]");
      if (!inTrigger && !inMenu) {
        setStatusDropdownOpen(false);
        setStatusMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!statusDropdownOpen) return;

    const handleReposition = () => updateStatusMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [statusDropdownOpen]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const validPage = Math.min(page, totalPages);
  const canEditProject = (project: Project) =>
    canManageProjectMembership(
      {
        id: viewerId,
        role: viewerRole as UserRole,
        department: viewerDepartment,
      },
      project,
    );

  const paginatedProjects = filteredProjects.slice(
    (validPage - 1) * pageSize,
    validPage * pageSize,
  );

  const activeStatusLabel =
    statusFilter === "ALL"
      ? null
      : STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ?? null;

  return (
    <Surface className={styles.compactSurface} title={<span className={styles.srOnly}>Danh sách dự án</span>}>
      <div className={styles.toolbar}>
        <h2 className={styles.toolbarTitle}>Danh sách dự án</h2>
        <div className={styles.toolbarActions}>
          <div className={styles.searchFilter}>
            <FilterSelect
              value={projectFilter}
              onChange={setProjectFilter}
              options={projectOptions}
              placeholder="Tất cả dự án"
              searchable
              variant="combobox"
              size="sm"
              searchPlaceholder="Tìm tên dự án..."
            />
          </div>
          {canManage && onAddProjectClick ? (
            <button type="button" className={styles.createButton} onClick={onAddProjectClick}>
              + Tạo dự án
            </button>
          ) : null}
        </div>
      </div>

      {filteredProjects.length ? (
        <>
          <TableWrap ref={tableAnchorRef} className={styles.flatTableWrap}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.colProject}>Dự án</TableHead>
                  <TableHead className={styles.colCode}>Mã dự án</TableHead>
                  <TableHead className={styles.colStatus}>
                    <div className={styles.headerFilter}>
                      <span>Trạng thái</span>
                      <div className={styles.filterTriggerWrap} ref={statusDropdownRef}>
                        {activeStatusLabel ? (
                          <span className={styles.filterChip}>
                            {activeStatusLabel}
                            <button
                              type="button"
                              className={styles.filterChipButton}
                              onClick={() => setStatusFilter("ALL")}
                              title="Xóa bộ lọc"
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
                          ref={statusButtonRef}
                          className={`${styles.filterIconButton} ${statusFilter !== "ALL" ? styles.filterIconButtonActive : ""}`}
                          onClick={toggleStatusDropdown}
                          aria-label="Lọc theo trạng thái"
                        >
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={statusFilter !== "ALL" ? styles.filterIconActive : styles.filterIcon}
                          >
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                          </svg>
                        </button>
                        {statusDropdownOpen && statusMenuPos && typeof document !== "undefined"
                          ? createPortal(
                              <div
                                className={styles.dropdownMenu}
                                data-project-status-menu
                                style={{ top: statusMenuPos.top, left: statusMenuPos.left }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className={styles.dropdownList}>
                                  {STATUS_OPTIONS.map((option) => (
                                    <div
                                      key={option.value}
                                      className={`${styles.dropdownItem} ${statusFilter === option.value ? styles.dropdownItemActive : ""}`}
                                      onClick={() => {
                                        setStatusFilter(option.value);
                                        setStatusDropdownOpen(false);
                                        setStatusMenuPos(null);
                                      }}
                                    >
                                      {statusFilter === option.value ? (
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
                            )
                          : null}
                      </div>
                    </div>
                  </TableHead>
                  <TableHead className={styles.colDepartment}>Phòng ban</TableHead>
                  <TableHead className={styles.colProgress}>Tiến độ</TableHead>
                  <TableHead className={styles.colTime}>Thời gian</TableHead>
                  <TableHead className={styles.colActions} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProjects.map((project) => (
                  <TableRow
                    key={project.id}
                    className={`${styles.clickableRow} ${selectedProjectId === project.id ? "selected-row" : ""}`}
                    onClick={() => openProjectOverview(project.id)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProjectOverview(project.id);
                      }
                    }}
                  >
                    <TableCell className={styles.colProject}>
                      <div className={styles.userCellButton}>
                        <span className={styles.avatarToken}>
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                        <span className={styles.userCellCopy}>
                          <strong>{project.name}</strong>
                          <small>
                            Manager: {project.managerName || "Chưa rõ"}
                          </small>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={styles.colCode}>
                      <code className={styles.projectCode}>{project.code}</code>
                    </TableCell>
                    <TableCell className={styles.colStatus}>
                      <StatusPill
                        label={projectStatusLabel(project.status)}
                        tone={
                          project.status === "ACTIVE"
                            ? "accent"
                            : project.status === "PLANNING"
                              ? "watch"
                              : project.status === "AT_RISK"
                                ? "critical"
                                : project.status === "ON_HOLD"
                                  ? "neutral"
                                  : "on-track"
                        }
                      />
                    </TableCell>
                    <TableCell className={styles.colDepartment}>
                      {project.departmentName || "---"}
                    </TableCell>
                    <TableCell className={styles.colProgress}>
                      <div className={styles.progressCell}>
                        <ProgressBar value={project.progress} />
                      </div>
                    </TableCell>
                    <TableCell className={styles.colTime}>
                      <div className={styles.contactCell}>
                        <span>{formatRange(project.startDate, project.endDate)}</span>
                      </div>
                    </TableCell>
                    <TableCell className={styles.colActions}>
                      {onEditProjectClick && canEditProject(project) ? (
                        <button
                          type="button"
                          className={styles.editButton}
                          title="Chỉnh sửa dự án"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditProjectClick(project);
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>

          {totalPages > 1 && (
            <div className={styles.paginationBar}>
              <p>
                Hiển thị {(validPage - 1) * pageSize + 1} -{" "}
                {Math.min(validPage * pageSize, filteredProjects.length)} / {filteredProjects.length} dự án.
              </p>
              <div className={styles.paginationActions}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPage(Math.max(1, validPage - 1))}
                  disabled={validPage <= 1}
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setPage(Math.min(totalPages, validPage + 1))}
                  disabled={validPage >= totalPages}
                >
                  Trang sau
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="Chưa có dự án"
          description={
            projectFilter || statusFilter !== "ALL"
              ? "Không tìm thấy dự án nào phù hợp với bộ lọc."
              : "Tạo dự án mới hoặc gán bạn vào một dự án để xem dữ liệu tại đây."
          }
        />
      )}
    </Surface>
  );
}
