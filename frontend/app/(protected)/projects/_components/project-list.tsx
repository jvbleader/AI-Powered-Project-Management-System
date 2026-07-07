import { useState } from "react";
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
  onAddProjectClick?: () => void;
}

const PROJECTS_PER_PAGE = 5;

export function ProjectList({
  projects,
  selectedProjectId,
  onSelectProject,
  canManage,
  onAddProjectClick,
}: ProjectListProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(projects.length / PROJECTS_PER_PAGE));

  // Ensure page is within valid range if projects list shrinks
  const validPage = Math.min(page, totalPages);

  const paginatedProjects = projects.slice(
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
      {projects.length ? (
        <>
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
                        onClick={() => router.push(`/projects/${project.id}`)}
                      >
                        <span className={styles.avatarToken}>
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                        <span className={styles.userCellCopy}>
                          <strong>{project.name}</strong>
                          <small>
                            Người quản lý: {project.managerId === "usr-1" ? "Admin" : "Chưa rõ"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>{project.code}</td>
                    <td>
                      <StatusPill
                        label={projectStatusLabel(project.status)}
                        tone={
                          project.status === "AT_RISK"
                            ? "critical"
                            : project.status === "ACTIVE"
                              ? "on-track"
                              : "watch"
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
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => router.push(`/projects/${project.id}`)}
                      >
                        Xem
                      </button>
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
                {Math.min(validPage * PROJECTS_PER_PAGE, projects.length)} / {projects.length} dự
                án.
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
          description="Tạo dự án mới hoặc gán bạn vào một dự án để xem dữ liệu tại đây."
        />
      )}
    </Surface>
  );
}
