import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ProgressBar, StatusPill, Surface } from "@/components/ui";
import { formatRange, projectStatusLabel } from "@/lib/utils/format";
import type { Project } from "@/types";
import styles from "../../team/styles/team.module.css";

interface ProjectListProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  canManage: boolean;
  viewerId: string;
  viewerRole: string;
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
  onAddProjectClick,
  onEditProjectClick,
}: ProjectListProps) {
  void onSelectProject;
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

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
    if (viewerRole === "ADMIN" || project.managerId === viewerId) {
      return true;
    }

    return (
      (viewerRole === "MANAGER" || viewerRole === "LEADER") &&
      project.memberIds.includes(viewerId)
    );
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
        <div style={{ display: "flex", gap: "0.5rem", flex: 1, minWidth: "250px" }}>
          <input
            type="text"
            placeholder="Tìm kiếm dự án..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)", flex: 1 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--foreground)" }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang triển khai</option>
            <option value="PLANNING">Đang lập kế hoạch</option>
            <option value="AT_RISK">Rủi ro trễ hạn</option>
            <option value="COMPLETED">Đã hoàn thành</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="icon-button"
            style={{ background: viewMode === "list" ? "var(--surface-raised)" : "transparent", border: "1px solid var(--border)", borderRadius: "4px", padding: "6px" }}
            onClick={() => setViewMode("list")}
            title="Danh sách"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
          <button
            type="button"
            className="icon-button"
            style={{ background: viewMode === "grid" ? "var(--surface-raised)" : "transparent", border: "1px solid var(--border)", borderRadius: "4px", padding: "6px" }}
            onClick={() => setViewMode("grid")}
            title="Dạng lưới"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
        </div>
      </div>

      {filteredProjects.length ? (
        <>
          {viewMode === "list" ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Mã dự án</th>
                    <th>Trạng thái</th>
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
                              Người quản lý: {project.managerName || "Chưa rõ"}
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
                                  : "on-track"
                          }
                        />
                      </td>
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
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
              {paginatedProjects.map((project) => (
                <div key={project.id} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "1.5rem", background: "var(--surface-sunken)", display: "flex", flexDirection: "column", gap: "1rem", cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s" }} onClick={() => openProjectOverview(project.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span className={styles.avatarToken} style={{ width: "40px", height: "40px", fontSize: "1rem" }}>
                        {project.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem", fontWeight: 600 }}>{project.name}</h3>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--foreground-muted)" }}>{project.code}</p>
                      </div>
                    </div>
                    {onEditProjectClick && canEditProject(project) && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditProjectClick(project); }}
                        style={{ background: "transparent", border: "none", color: "var(--foreground-muted)", cursor: "pointer", padding: "4px" }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div>
                    <StatusPill
                      label={projectStatusLabel(project.status)}
                      tone={
                        project.status === "ACTIVE" ? "accent" : project.status === "PLANNING" ? "watch" : project.status === "AT_RISK" ? "critical" : "on-track"
                      }
                    />
                  </div>
                  <div>
                    <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Quản lý: {project.managerName || "Chưa rõ"}</p>
                    <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Thời gian: {formatRange(project.startDate, project.endDate)}</p>
                  </div>
                  <div style={{ marginTop: "auto" }}>
                    <ProgressBar value={project.progress} label="Tiến độ" />
                  </div>
                </div>
              ))}
            </div>
          )}

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
