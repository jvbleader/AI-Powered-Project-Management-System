"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { logworkApi, type PendingLogWork } from "@/services/api/logworks";
import { useAuthSession } from "@/hooks/use-session";
import styles from "./logwork-approvals.module.css";

export function LogworkApprovalsClient() {
  const session = useAuthSession();
  const searchParams = useSearchParams();
  const highlightLogworkId = searchParams.get("highlightLogworkId");
  const [logworks, setLogworks] = useState<PendingLogWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [flashLogworkId, setFlashLogworkId] = useState<string | null>(null);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const highlightHandledRef = useRef<string | null>(null);

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  const filteredLogworks = logworks.filter((lw) => {
    if (projectFilter && lw.project_name !== projectFilter) return false;
    if (dateFilter && lw.work_date !== dateFilter) return false;
    return true;
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchLogworks = async () => {
    try {
      const data = await logworkApi.getPending();
      setLogworks(data);
    } catch (err) {
      console.error("Failed to fetch pending logworks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogworks();

    const handleNewNotification = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === "LOGWORK_SUBMITTED") {
        fetchLogworks();
      }
    };

    window.addEventListener("new_notification", handleNewNotification);
    return () => window.removeEventListener("new_notification", handleNewNotification);
  }, [session]);

  useEffect(() => {
    if (!highlightLogworkId) return;
    setProjectFilter("");
    setDateFilter("");
    highlightHandledRef.current = null;
  }, [highlightLogworkId]);

  useEffect(() => {
    if (!highlightLogworkId || loading) return;
    if (highlightHandledRef.current === highlightLogworkId) return;

    const targetExists = logworks.some((lw) => String(lw.id) === String(highlightLogworkId));
    if (!targetExists) return;

    const targetVisible = filteredLogworks.some((lw) => String(lw.id) === String(highlightLogworkId));
    if (!targetVisible) return;

    highlightHandledRef.current = highlightLogworkId;
    setFlashLogworkId(String(highlightLogworkId));

    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`logwork-row-${highlightLogworkId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 350);

    const clearTimer = window.setTimeout(() => {
      setFlashLogworkId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("highlightLogworkId");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }, 5000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightLogworkId, loading, logworks, filteredLogworks, projectFilter, dateFilter]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await logworkApi.approve(id);
      setLogworks((prev) => prev.filter((lw) => lw.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Lỗi khi duyệt logwork");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    setActionLoading(id);
    try {
      await logworkApi.reject(id);
      setLogworks((prev) => prev.filter((lw) => lw.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Lỗi khi từ chối logwork");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Đang tải dữ liệu...</div>;
  }

  if (logworks.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h3>Không có yêu cầu duyệt log work nào</h3>
        <p>Tất cả các báo cáo thời gian đã được xem xét.</p>
      </div>
    );
  }

  const uniqueProjects = Array.from(new Set(logworks.map((lw) => lw.project_name).filter(Boolean)));

  return (
    <div className={styles.panel}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colStaff}>Nhân sự</th>
              <th className={styles.colProject}>
                <div className={styles.headerFilter}>
                  <span>Dự án</span>
                  <div className={styles.filterTriggerWrap}>
                    {projectFilter ? (
                      <span className={styles.filterChip}>
                        {projectFilter}
                        <button
                          type="button"
                          className={styles.filterChipButton}
                          onClick={() => setProjectFilter("")}
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
                      className={`${styles.filterIconButton} ${projectFilter ? styles.filterIconButtonActive : ""}`}
                      onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={projectFilter ? styles.filterIconActive : styles.filterIcon}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <div ref={projectDropdownRef} className={styles.dropdownAnchor}>
                        {projectDropdownOpen ? (
                          <div
                            className={styles.dropdownMenu}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className={styles.dropdownSearchWrap}>
                              <input
                                type="text"
                                placeholder="Tìm dự án..."
                                className={styles.dropdownSearchInput}
                                value={projectSearchQuery}
                                onChange={(e) => setProjectSearchQuery(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className={styles.dropdownList}>
                              <div
                                className={`${styles.dropdownItem} ${projectFilter === "" ? styles.dropdownItemActive : ""}`}
                                onClick={() => {
                                  setProjectFilter("");
                                  setProjectDropdownOpen(false);
                                  setProjectSearchQuery("");
                                }}
                              >
                                {projectFilter === "" ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <div className={styles.dropdownSpacer} />
                                )}
                                Tất cả
                              </div>
                              {uniqueProjects
                                .filter((proj): proj is string => Boolean(proj))
                                .filter((proj) => proj.toLowerCase().includes(projectSearchQuery.toLowerCase()))
                                .map((proj) => (
                                  <div
                                    key={proj}
                                    className={`${styles.dropdownItem} ${projectFilter === proj ? styles.dropdownItemActive : ""}`}
                                    onClick={() => {
                                      setProjectFilter(proj);
                                      setProjectDropdownOpen(false);
                                      setProjectSearchQuery("");
                                    }}
                                  >
                                    {projectFilter === proj ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    ) : (
                                      <div className={styles.dropdownSpacer} />
                                    )}
                                    {proj}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </div>
                </div>
              </th>
              <th className={styles.colTask}>Task</th>
              <th className={styles.colContent}>Nội dung công việc</th>
              <th className={styles.colHours}>Số giờ</th>
              <th className={styles.colDate}>
                <div className={styles.headerFilter}>
                  <span>Ngày tạo</span>
                  <div className={styles.filterTriggerWrap}>
                    {dateFilter ? (
                      <span className={styles.filterChip}>
                        {new Date(dateFilter).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                        <button
                          type="button"
                          className={styles.filterChipButton}
                          onClick={() => setDateFilter("")}
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
                      className={`${styles.filterIconButton} ${dateFilter ? styles.filterIconButtonActive : ""}`}
                      onClick={() => dateInputRef.current?.showPicker()}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={dateFilter ? styles.filterIconActive : styles.filterIcon}
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </button>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className={styles.hiddenDateInput}
                    />
                  </div>
                </div>
              </th>
              <th className={styles.colActions}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogworks.length > 0 ? (
              filteredLogworks.map((lw) => (
                <tr
                  key={lw.id}
                  id={`logwork-row-${lw.id}`}
                  className={flashLogworkId === String(lw.id) ? styles.rowHighlight : undefined}
                >
                  <td>
                    <div className={styles.staffName}>{lw.user_name || "Unknown"}</div>
                  </td>
                  <td className={styles.projectName}>
                    {lw.project_id ? (
                      <Link href={`/projects/${lw.project_id}?tab=overview`} className={styles.projectName}>
                        {lw.project_name || "Không xác định"}
                      </Link>
                    ) : (
                      lw.project_name || "Không xác định"
                    )}
                  </td>
                  <td>
                    {lw.task_id && lw.project_id ? (
                      <Link
                        href={`/projects/${lw.project_id}?highlightTaskId=${lw.task_id}&highlightColor=green`}
                        className={styles.taskTitle}
                      >
                        {lw.task_title || "---"}
                      </Link>
                    ) : (
                      <div className={styles.taskTitle}>{lw.task_title || "---"}</div>
                    )}
                  </td>
                  <td className={styles.cellContent}>
                    <div className={styles.contentCell}>
                      <p className={styles.workContent}>
                        {lw.work_content?.trim() || "— Không có mô tả —"}
                      </p>
                      {lw.comment?.trim() ? (
                        <div className={styles.commentBox}>
                          <span className={styles.commentLabel}>Ghi chú</span>
                          <span className={styles.commentText}>{lw.comment.trim()}</span>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className={styles.hoursText}>
                    <strong>{lw.hours_spent}h</strong>
                  </td>
                  <td className={styles.dateText}>
                    {new Date(lw.work_date).toLocaleDateString("vi-VN")}
                  </td>
                  <td className={styles.cellActions}>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        data-testid={`approve-logwork-${lw.id}`}
                        className={styles.approveButton}
                        onClick={() => handleApprove(lw.id)}
                        disabled={actionLoading === lw.id}
                      >
                        Duyệt
                      </button>
                      <button
                        type="button"
                        data-testid={`reject-logwork-${lw.id}`}
                        className={styles.rejectButton}
                        onClick={() => handleReject(lw.id)}
                        disabled={actionLoading === lw.id}
                      >
                        Từ chối
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className={styles.emptyFilter}>
                  Không tìm thấy logwork nào phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
