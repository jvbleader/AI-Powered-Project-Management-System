import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ProgressBar, StatusPill, Surface } from "@/components/ui";
import { FilterSelect } from "@/components/filter-select";
import {
  formatRange,
  canManageProjectMembership,
  projectStatusLabel,
} from "@/lib/utils/format";
import type { Project, UserRole } from "@/types";
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

const PROJECTS_PER_PAGE = 15;

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


  function openProjectOverview(projectId: string) {
    router.push(`/projects/${projectId}?tab=overview`);
  }
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            project.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE));
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
    (validPage - 1) * PROJECTS_PER_PAGE,
    validPage * PROJECTS_PER_PAGE,
  );

  return (
    <Surface
      className={styles.compactSurface}
      title={canManage ? "Danh mục điều phối" : "Các dự án đang tham gia"}
      kicker="Projects"
      aside={
        canManage &&
        onAddProjectClick && (
          <button type="button" className="primary-button" onClick={onAddProjectClick}>
            + Tạo dự án
          </button>
        )
      }
    >
      <div className={styles.toolbar}>
        <div className={styles.toolbarFilters}>
          <div className={styles.searchWrap}>
            <div className={styles.searchIcon}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Tìm kiếm dự án..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.statusFilter}>
            <FilterSelect
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { value: "ALL", label: "Tất cả trạng thái" },
                { value: "ACTIVE", label: "Đang triển khai" },
                { value: "PLANNING", label: "Đang lập kế hoạch" },
                { value: "AT_RISK", label: "Rủi ro trễ hạn" },
                { value: "COMPLETED", label: "Đã hoàn thành" },
                { value: "ON_HOLD", label: "Tạm dừng" },
              ]}
            />
          </div>
        </div>
      </div>

      {filteredProjects.length ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Mã dự án</th>
                    <th>Trạng thái</th>
                    <th>Phòng ban</th>
                    <th className={styles.colProgress}>Tiến độ</th>
                    <th>Thời gian</th>
                    <th className={styles.colActions} />
                  </tr>
                </thead>
                <tbody>
                  {paginatedProjects.map((project) => (
                    <tr
                      key={project.id}
                      className={selectedProjectId === project.id ? "selected-row" : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.userCellButton}
                          onClick={() => openProjectOverview(project.id)}
                        >
                          <span className={styles.avatarToken}>
                            {project.name.charAt(0).toUpperCase()}
                          </span>
                          <span className={styles.userCellCopy}>
                            <strong>{project.name}</strong>
                            <small>
                              Manager: {project.managerName || "Chưa rõ"}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <code className={styles.projectCode}>{project.code}</code>
                      </td>
                      <td>
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
                      </td>
                      <td>{project.departmentName || "---"}</td>
                      <td className={styles.colProgress}>
                        <div className={styles.progressCell}>
                          <ProgressBar value={project.progress} />
                        </div>
                      </td>
                      <td>
                        <div className={styles.contactCell}>
                          <span>{formatRange(project.startDate, project.endDate)}</span>
                        </div>
                      </td>
                      <td className={styles.colActions}>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          {onEditProjectClick && canEditProject(project) && (
                            <button
                              type="button"
                              className={styles.editButton}
                              title="Chỉnh sửa dự án"
                              onClick={() => onEditProjectClick(project)}
                            >
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>

          {totalPages > 1 && (
            <div className={styles.paginationBar}>
              <p>
                Hiển thị {(validPage - 1) * PROJECTS_PER_PAGE + 1} -{" "}
                {Math.min(validPage * PROJECTS_PER_PAGE, filteredProjects.length)} / {filteredProjects.length} dự án.
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
          description={searchQuery || statusFilter !== "ALL" ? "Không tìm thấy dự án nào phù hợp với bộ lọc." : "Tạo dự án mới hoặc gán bạn vào một dự án để xem dữ liệu tại đây."}
        />
      )}
    </Surface>
  );
}
