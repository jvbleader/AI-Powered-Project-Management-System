import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ProgressBar, StatusPill, Surface } from "@/components/ui";
import { FilterSelect } from "@/components/filter-select";
import {
  formatRange,
  hasCompanywideProjectAccess,
  projectStatusLabel,
} from "@/lib/utils/format";
import type { Project } from "@/types";
import styles from "../../team/styles/team.module.css";

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

const PROJECTS_PER_PAGE = 10;

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
  const canEditProject = (project: Project) => {
    if (hasCompanywideProjectAccess(viewerRole, viewerDepartment) || project.managerId === viewerId) {
      return true;
    }

    return false;
  };
  
  const paginatedProjects = filteredProjects.slice(
    (validPage - 1) * PROJECTS_PER_PAGE,
    validPage * PROJECTS_PER_PAGE,
  );

  return (
    <Surface
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
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.75rem", flex: 1, minWidth: "250px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--foreground-muted)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <input
              type="text"
              placeholder="Tìm kiếm dự án..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem 1rem 0.6rem 2.5rem",
                borderRadius: "9999px",
                border: "1px solid var(--border)",
                background: "var(--surface-sunken)",
                color: "var(--foreground)",
                fontSize: "0.875rem",
                outline: "none",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--primary)";
                e.target.style.boxShadow = "0 0 0 2px rgba(var(--primary-rgb), 0.2)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--border)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>
          <div style={{ position: "relative", minWidth: "180px" }}>
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
                    <th style={{ width: "25%" }}>Tiến độ</th>
                    <th>Thời gian</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {paginatedProjects.map((project) => (
                    <tr
                      key={project.id}
                      className={selectedProjectId === project.id ? styles.selectedRow : ""}
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
                      <td>{project.code}</td>
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
                      <td>
                        <ProgressBar value={project.progress} label="Tiến độ triển khai" />
                      </td>
                      <td>
                        <div className={styles.contactCell}>
                          <span>{formatRange(project.startDate, project.endDate)}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => openProjectOverview(project.id)}
                          >
                            Xem
                          </button>
                          {onEditProjectClick && canEditProject(project) && (
                            <button
                              type="button"
                              className="icon-button"
                              style={{ color: "var(--primary-base)", background: "transparent", border: "1px solid var(--primary-subtle)", width: "36px", height: "36px", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}
                              title="Chỉnh sửa dự án"
                              onClick={() => onEditProjectClick(project)}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
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
            <div className={styles.paginationBar} style={{ marginTop: "1rem" }}>
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
