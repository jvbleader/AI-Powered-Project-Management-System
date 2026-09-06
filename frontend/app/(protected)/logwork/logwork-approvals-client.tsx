"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { logworkApi, type PendingLogWork } from "@/services/api/logworks";
import { TableBodySkeleton } from "@/components/loading-state";
import { useAuthSession } from "@/hooks/use-session";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { Surface } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { TablePagination } from "@/components/table-pagination";
import { formatDateNumeric, formatHours } from "@/lib/utils/format";
import { resolveLogworkTitle } from "@/lib/utils/logwork";
import { LogworkApprovalsFilter, type LogworkDatePeriod } from "./_components/logwork-approvals-filter";
import styles from "./logwork-approvals.module.css";

function staffKey(logwork: PendingLogWork) {
  return logwork.user_id != null ? String(logwork.user_id) : logwork.user_name || "";
}

function projectKey(logwork: PendingLogWork) {
  return logwork.project_id != null ? String(logwork.project_id) : logwork.project_name || "";
}

function toDateKey(value: string | undefined) {
  return (value || "").slice(0, 10);
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfCurrentWeek(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekday = start.getDay();
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  start.setDate(start.getDate() + diffToMonday);
  return start;
}

function matchesDatePeriod(workDate: string, period: LogworkDatePeriod) {
  if (!period) return true;
  if (!workDate) return false;

  const today = new Date();
  const todayKey = toLocalDateKey(today);

  if (period === "day") {
    return workDate === todayKey;
  }

  if (period === "week") {
    const weekStart = startOfCurrentWeek(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return workDate >= toLocalDateKey(weekStart) && workDate <= toLocalDateKey(weekEnd);
  }

  const monthStart = toLocalDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEnd = toLocalDateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  return workDate >= monthStart && workDate <= monthEnd;
}

const LOGWORKS_PER_PAGE = 15;

export function LogworkApprovalsClient() {
  const session = useAuthSession();
  const { confirm, alert } = useConfirmDialog();
  const searchParams = useSearchParams();
  const highlightLogworkId = searchParams.get("highlightLogworkId");
  const [logworks, setLogworks] = useState<PendingLogWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [staffFilter, setStaffFilter] = useState<string[]>([]);
  const [datePeriod, setDatePeriod] = useState<LogworkDatePeriod>("");
  const [flashLogworkId, setFlashLogworkId] = useState<string | null>(null);
  const [selectedLogwork, setSelectedLogwork] = useState<PendingLogWork | null>(null);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const [page, setPage] = useState(1);
  const highlightHandledRef = useRef<string | null>(null);

  const hasActiveFilters =
    projectFilter.length > 0 || staffFilter.length > 0 || Boolean(datePeriod);

  const resetFilters = useCallback(() => {
    setProjectFilter([]);
    setStaffFilter([]);
    setDatePeriod("");
    setPage(1);
  }, []);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const logwork of logworks) {
      const key = projectKey(logwork);
      if (key && !map.has(key)) {
        map.set(key, logwork.project_name || "Không xác định");
      }
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort((left, right) =>
      left.label.localeCompare(right.label, "vi"),
    );
  }, [logworks]);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const logwork of logworks) {
      const key = staffKey(logwork);
      if (key && !map.has(key)) {
        map.set(key, logwork.user_name || "Unknown");
      }
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort((left, right) =>
      left.label.localeCompare(right.label, "vi"),
    );
  }, [logworks]);

  const filteredLogworks = useMemo(() => {
    return logworks.filter((logwork) => {
      if (projectFilter.length > 0 && !projectFilter.includes(projectKey(logwork))) {
        return false;
      }

      if (staffFilter.length > 0 && !staffFilter.includes(staffKey(logwork))) {
        return false;
      }

      if (!matchesDatePeriod(toDateKey(logwork.work_date), datePeriod)) {
        return false;
      }

      return true;
    });
  }, [datePeriod, logworks, projectFilter, staffFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogworks.length / LOGWORKS_PER_PAGE));
  const validPage = Math.min(page, totalPages);
  const paginatedLogworks = filteredLogworks.slice(
    (validPage - 1) * LOGWORKS_PER_PAGE,
    validPage * LOGWORKS_PER_PAGE,
  );

  useEffect(() => {
    setIsPortalReady(true);
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
    resetFilters();
    highlightHandledRef.current = null;
  }, [highlightLogworkId, resetFilters]);

  const openDetail = useCallback((logwork: PendingLogWork) => {
    setIsModalClosing(false);
    setSelectedLogwork(logwork);
  }, []);

  useEffect(() => {
    if (!highlightLogworkId || loading) return;
    if (highlightHandledRef.current === highlightLogworkId) return;
    if (hasActiveFilters) return;

    const index = filteredLogworks.findIndex((lw) => String(lw.id) === String(highlightLogworkId));
    if (index < 0) return;

    highlightHandledRef.current = highlightLogworkId;
    setPage(Math.floor(index / LOGWORKS_PER_PAGE) + 1);
    setFlashLogworkId(String(highlightLogworkId));
    openDetail(filteredLogworks[index]);

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
  }, [filteredLogworks, hasActiveFilters, highlightLogworkId, loading, openDetail]);

  const closeDetail = () => {
    setIsModalClosing(true);
  };

  const requestCloseDetail = () => {
    if (actionLoading != null) return;
    closeDetail();
  };

  useEffect(() => {
    if (!isModalClosing || !selectedLogwork) return;
    const timer = window.setTimeout(() => {
      setSelectedLogwork(null);
      setIsModalClosing(false);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [isModalClosing, selectedLogwork]);

  useEffect(() => {
    if (!selectedLogwork) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (actionLoading == null) {
          setIsModalClosing(true);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedLogwork, actionLoading]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await logworkApi.approve(id);
      setLogworks((prev) => prev.filter((lw) => lw.id !== id));
      closeDetail();
    } catch (err: unknown) {
      await alert({
        title: "Không thể duyệt",
        message: err instanceof Error ? err.message : "Lỗi khi duyệt logwork",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    const confirmed = await confirm({
      title: "Từ chối logwork",
      message: "Bạn có chắc muốn từ chối bản ghi logwork này?",
      confirmLabel: "Từ chối",
      tone: "danger",
    });
    if (!confirmed) return;

    setActionLoading(id);
    try {
      await logworkApi.reject(id);
      setLogworks((prev) => prev.filter((lw) => lw.id !== id));
      closeDetail();
    } catch (err: unknown) {
      await alert({
        title: "Không thể từ chối",
        message: err instanceof Error ? err.message : "Lỗi khi từ chối logwork",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const selectedTitle = selectedLogwork
    ? resolveLogworkTitle(selectedLogwork.title, selectedLogwork.work_content)
    : "";

  return (
    <>
      <div className={`${styles.pageStack} filtered-list-page`}>
        <LogworkApprovalsFilter
          projectFilter={projectFilter}
          onProjectFilterChange={(value) => {
            setProjectFilter(value);
            setPage(1);
          }}
          projectOptions={projectOptions}
          staffFilter={staffFilter}
          onStaffFilterChange={(value) => {
            setStaffFilter(value);
            setPage(1);
          }}
          staffOptions={staffOptions}
          datePeriod={datePeriod}
          onDatePeriodChange={(value) => {
            setDatePeriod(value);
            setPage(1);
          }}
          hasActiveFilters={hasActiveFilters}
          onReset={resetFilters}
        />

        <Surface className={`${styles.tableSurface} filtered-list-table`}>
          <div className={`${styles.tableWrap} table-scroll`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colStaff}>Nhân sự</th>
                  <th className={styles.colProject}>Dự án</th>
                  <th className={styles.colTask}>Task</th>
                  <th className={styles.colTitle}>Tên logwork</th>
                  <th className={styles.colHours}>Số giờ</th>
                  <th className={styles.colDate}>Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableBodySkeleton rows={8} columns={6} />
                ) : filteredLogworks.length > 0 ? (
                  paginatedLogworks.map((lw) => (
                    <tr
                      key={lw.id}
                      id={`logwork-row-${lw.id}`}
                      className={`${styles.clickableRow} ${flashLogworkId === String(lw.id) ? styles.rowHighlight : ""}`}
                      onClick={() => openDetail(lw)}
                    >
                      <td>
                        <div className={styles.staffCell}>
                          <UserAvatar
                            userId={lw.user_id}
                            name={lw.user_name || "Unknown"}
                            size={24}
                            className={styles.avatarToken}
                          />
                          <span className={styles.staffName}>{lw.user_name || "Unknown"}</span>
                        </div>
                      </td>
                      <td className={styles.projectCell}>
                        {lw.project_id ? (
                          <Link
                            href={`/projects/${lw.project_id}?tab=overview`}
                            className={styles.projectName}
                            title={lw.project_name || "Không xác định"}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {lw.project_name || "Không xác định"}
                          </Link>
                        ) : (
                          <span className={styles.projectText} title={lw.project_name || "Không xác định"}>
                            {lw.project_name || "Không xác định"}
                          </span>
                        )}
                      </td>
                      <td className={styles.taskCell}>
                        {lw.task_id && lw.project_id ? (
                          <Link
                            href={`/projects/${lw.project_id}?highlightTaskId=${lw.task_id}&highlightColor=green`}
                            className={styles.taskTitle}
                            title={lw.task_title || "---"}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {lw.task_title || "---"}
                          </Link>
                        ) : (
                          <span className={styles.taskText} title={lw.task_title || "---"}>
                            {lw.task_title || "---"}
                          </span>
                        )}
                      </td>
                      <td className={styles.titleCell}>
                        {resolveLogworkTitle(lw.title, lw.work_content)}
                      </td>
                      <td className={styles.hoursText}>{formatHours(Number(lw.hours_spent))}</td>
                      <td className={styles.dateText}>{formatDateNumeric(lw.work_date)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className={styles.emptyFilter}>
                      {logworks.length === 0 ? (
                        <>
                          <strong>Không có yêu cầu duyệt log work nào</strong>
                          <p>Tất cả các báo cáo thời gian đã được xem xét.</p>
                        </>
                      ) : (
                        "Không tìm thấy logwork nào phù hợp với bộ lọc."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!loading && filteredLogworks.length > 0 ? (
            <TablePagination
              page={validPage}
              pageSize={LOGWORKS_PER_PAGE}
              total={filteredLogworks.length}
              totalPages={totalPages}
              onPageChange={setPage}
              itemLabel="logwork"
            />
          ) : null}
        </Surface>
      </div>

      {isPortalReady && selectedLogwork
        ? createPortal(
            <div
              className={`${styles.modalBackdrop} ${isModalClosing ? styles.modalBackdropClosing : ""}`}
              role="presentation"
              onMouseDown={requestCloseDetail}
            >
              <section
                className={`${styles.modalSurface} ${isModalClosing ? styles.modalSurfaceClosing : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="approval-logwork-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <div>
                    <h2 id="approval-logwork-title" className={styles.modalTitle}>
                      {selectedTitle}
                    </h2>
                  </div>
                  <button type="button" className={styles.modalClose} onClick={requestCloseDetail} aria-label="Đóng">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className={styles.modalBody}>
                  <dl className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <dt>Nhân sự</dt>
                      <dd>{selectedLogwork.user_name || "Unknown"}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>Dự án</dt>
                      <dd>{selectedLogwork.project_name || "Không xác định"}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>Task</dt>
                      <dd className={styles.metaValueEllipsis} title={selectedLogwork.task_title || "---"}>
                        {selectedLogwork.task_title || "---"}
                      </dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>Số giờ</dt>
                      <dd>{formatHours(Number(selectedLogwork.hours_spent))}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>Ngày tạo</dt>
                      <dd>{formatDateNumeric(selectedLogwork.work_date)}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>Trạng thái</dt>
                      <dd>
                        <span className={styles.statusBadge}>Chờ duyệt</span>
                      </dd>
                    </div>
                  </dl>

                  <div className={styles.sectionPanel}>
                    <span className={styles.sectionLabel}>Nội dung công việc</span>
                    <div className={styles.contentBox}>
                      {selectedLogwork.work_content?.trim() || "— Không có mô tả —"}
                    </div>
                  </div>

                  {selectedLogwork.comment?.trim() ? (
                    <div className={styles.sectionPanel}>
                      <span className={styles.sectionLabel}>Ghi chú</span>
                      <div className={styles.contentBox}>{selectedLogwork.comment.trim()}</div>
                    </div>
                  ) : null}
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    data-testid={`reject-logwork-${selectedLogwork.id}`}
                    className={styles.rejectButton}
                    onClick={() => void handleReject(selectedLogwork.id)}
                    disabled={actionLoading === selectedLogwork.id}
                  >
                    Từ chối
                  </button>
                  <button
                    type="button"
                    data-testid={`approve-logwork-${selectedLogwork.id}`}
                    className={styles.approveButton}
                    onClick={() => void handleApprove(selectedLogwork.id)}
                    disabled={actionLoading === selectedLogwork.id}
                  >
                    Duyệt
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
