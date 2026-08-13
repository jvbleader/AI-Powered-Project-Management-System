"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { logworkApi, type PendingLogWork } from "@/services/api/logworks";
import { userApi } from "@/services/api/users";
import { useAuthSession } from "@/hooks/use-session";
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useAutoPageSize } from "@/hooks/use-auto-page-size";
import type { UserProfile } from "@/types";
import styles from "./logwork-approvals.module.css";

function isDocumentReload() {
  if (typeof performance === "undefined") return false;
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return nav?.type === "reload";
}

export function LogworkApprovalsClient() {
  const session = useAuthSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const highlightFromUrl = searchParams.get("highlightLogworkId");
  const [logworks, setLogworks] = useState<PendingLogWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
    const [staffCodeFilter, setStaffCodeFilter] = useState<string>("");
    const [staffNameFilter, setStaffNameFilter] = useState<string>("");
    const [staffCodeDropdownOpen, setStaffCodeDropdownOpen] = useState(false);
    const [staffNameDropdownOpen, setStaffNameDropdownOpen] = useState(false);
    const [staffCodeSearchQuery, setStaffCodeSearchQuery] = useState("");
    const [staffNameSearchQuery, setStaffNameSearchQuery] = useState("");
  const [flashLogworkId, setFlashLogworkId] = useState<string | null>(null);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const urlConsumedRef = useRef<string | null>(null);
  const pageJumpDoneRef = useRef(false);
  const flashStartedRef = useRef<string | null>(null);
  const tableAnchorRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const pageSize = useAutoPageSize({
    anchorRef: tableAnchorRef,
    rowHeight: 88,
    headerHeight: 56,
    footerHeight: 64,
    bottomGutter: 48,
    min: 4,
    max: 20,
    fallbackTop: 220,
    remeasureKey: logworks.length,
  });

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
    const staffCodeDropdownRef = useRef<HTMLDivElement>(null);
    const staffNameDropdownRef = useRef<HTMLDivElement>(null);
  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>([]);
  const [toastMessage, setToastMessage] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  useEffect(() => {
    let isCancelled = false;
    async function loadDirectory() {
      if (!session?.currentUser) return;
      try {
        const res = await userApi.listDirectory(
          {
            search: "",
            status: "ALL",
            role: "ALL",
            department: "ALL",
            page: 1,
            pageSize: 500,
          },
          session.currentUser,
        );
        if (isCancelled) return;
        setDirectoryUsers(res.data.items);
      } catch (e) {
        // Không bắt buộc: nếu fail vẫn có thể hiển thị theo fallback `usr-<id>`
        // eslint-disable-next-line no-console
        console.warn("Failed to load directory users for employeeCode mapping", e);
      }
    }

    void loadDirectory();
    return () => {
      isCancelled = true;
    };
  }, [session]);

  const emailToEmployeeCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of directoryUsers) {
      const email = user.email?.toLowerCase().trim();
      if (!email) continue;
      map.set(email, (user.employeeCode ?? user.id).toString());
    }
    return map;
  }, [directoryUsers]);

  function getStaffCode(lw: PendingLogWork): string {
    const email = lw.user_email?.toLowerCase().trim();
    if (email) {
      const mapped = emailToEmployeeCode.get(email);
      if (mapped) return mapped;
    }
    if (lw.user_id != null) return `usr-${lw.user_id}`;
    return "";
  }

  const filteredLogworks = useMemo(() => {
    return logworks.filter((lw) => {
      if (projectFilter && lw.project_name !== projectFilter) return false;
      if (dateFilter && lw.work_date !== dateFilter) return false;
      if (staffCodeFilter) {
        const code = getStaffCode(lw);
        if (!code.toLowerCase().includes(staffCodeFilter.toLowerCase())) return false;
      }
      if (staffNameFilter) {
        const name = lw.user_name || "";
        if (!name.toLowerCase().includes(staffNameFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [logworks, projectFilter, dateFilter, staffCodeFilter, staffNameFilter, emailToEmployeeCode]);

  const totalPages = Math.max(1, Math.ceil(filteredLogworks.length / pageSize));
  const validPage = Math.min(page, totalPages);
  const paginatedLogworks = filteredLogworks.slice(
    (validPage - 1) * pageSize,
    validPage * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [projectFilter, dateFilter, staffCodeFilter, staffNameFilter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
      if (staffCodeDropdownRef.current && !staffCodeDropdownRef.current.contains(e.target as Node)) {
        setStaffCodeDropdownOpen(false);
      }
      if (staffNameDropdownRef.current && !staffNameDropdownRef.current.contains(e.target as Node)) {
        setStaffNameDropdownOpen(false);
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
    if (!highlightFromUrl) {
      urlConsumedRef.current = null;
      return;
    }
    if (urlConsumedRef.current === highlightFromUrl) return;
    urlConsumedRef.current = highlightFromUrl;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("highlightLogworkId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

    if (isDocumentReload()) return;

    pageJumpDoneRef.current = false;
    flashStartedRef.current = null;
    setProjectFilter("");
    setDateFilter("");
    setStaffCodeFilter("");
    setStaffNameFilter("");
    setActiveHighlightId(highlightFromUrl);
  }, [highlightFromUrl, pathname, router, searchParams]);

  useEffect(() => {
    if (!activeHighlightId || loading || pageJumpDoneRef.current) return;

    const targetIndex = filteredLogworks.findIndex(
      (lw) => String(lw.id) === String(activeHighlightId),
    );
    if (targetIndex < 0) return;

    pageJumpDoneRef.current = true;
    setPage(Math.floor(targetIndex / pageSize) + 1);
  }, [activeHighlightId, loading, filteredLogworks, pageSize]);

  useEffect(() => {
    if (!activeHighlightId || loading) return;
    if (flashStartedRef.current === activeHighlightId) return;

    flashStartedRef.current = activeHighlightId;
    setFlashLogworkId(String(activeHighlightId));

    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`logwork-row-${activeHighlightId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 350);

    const clearTimer = window.setTimeout(() => {
      setFlashLogworkId(null);
      setActiveHighlightId(null);
    }, 5000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [activeHighlightId, loading]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await logworkApi.approve(id);
      setLogworks((prev) => prev.filter((lw) => lw.id !== id));
      showToast("Đã chấp nhận logwork thành công!", "success");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Lỗi khi duyệt logwork", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number, reason: string) => {
    setActionLoading(id);
    try {
      await logworkApi.reject(id, reason || undefined);
      setLogworks((prev) => prev.filter((lw) => lw.id !== id));
      showToast("Đã từ chối logwork thành công!", "error");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Lỗi khi từ chối logwork", "error");
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
    const uniqueStaffCodes = Array.from(
      new Set(logworks.map((lw) => getStaffCode(lw)).filter(Boolean)),
    );
    const uniqueStaffNames = Array.from(new Set(logworks.map((lw) => lw.user_name).filter(Boolean)));

  return (
    <>
      <TableWrap ref={tableAnchorRef}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={styles.colStaff}>
                <div className={styles.headerFilter}>
                  <span>Mã nhân viên</span>
                  <div className={styles.filterTriggerWrap}>
                    <button
                      type="button"
                      className={`${styles.filterIconButton} ${styles.filterIconButtonLg} ${
                        staffCodeFilter ? styles.filterIconButtonActive : ""
                      }`}
                      onClick={() => setStaffCodeDropdownOpen(!staffCodeDropdownOpen)}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={staffCodeFilter ? styles.filterIconActive : styles.filterIcon}
                      >
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                      <div ref={staffCodeDropdownRef} className={styles.dropdownAnchor}>
                        {staffCodeDropdownOpen ? (
                          <div
                            className={styles.dropdownMenu}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className={styles.dropdownSearchWrap}>
                              <input
                                type="text"
                                placeholder="Tìm mã nhân viên..."
                                className={styles.dropdownSearchInput}
                                value={staffCodeSearchQuery}
                                onChange={(e) => setStaffCodeSearchQuery(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className={styles.dropdownList}>
                              <div
                                className={`${styles.dropdownItem} ${staffCodeFilter === "" ? styles.dropdownItemActive : ""}`}
                                onClick={() => {
                                  setStaffCodeFilter("");
                                  setStaffCodeDropdownOpen(false);
                                  setStaffCodeSearchQuery("");
                                }}
                              >
                                {staffCodeFilter === "" ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <div className={styles.dropdownSpacer} />
                                )}
                                Tất cả
                              </div>
                              {uniqueStaffCodes
                                .filter((code) => code.toLowerCase().includes(staffCodeSearchQuery.toLowerCase()))
                                .map((code) => (
                                  <div
                                    key={code}
                                    className={`${styles.dropdownItem} ${staffCodeFilter === code ? styles.dropdownItemActive : ""}`}
                                    onClick={() => {
                                      setStaffCodeFilter(code);
                                      setStaffCodeDropdownOpen(false);
                                      setStaffCodeSearchQuery("");
                                    }}
                                  >
                                    {staffCodeFilter === code ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    ) : (
                                      <div className={styles.dropdownSpacer} />
                                    )}
                                    {code}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </div>
                </div>
              </TableHead>
              <TableHead className={styles.colStaff}>
                <div className={styles.headerFilter}>
                  <span>Tên nhân viên</span>
                  <div className={styles.filterTriggerWrap}>
                    <button
                      type="button"
                      className={`${styles.filterIconButton} ${styles.filterIconButtonLg} ${
                        staffNameFilter ? styles.filterIconButtonActive : ""
                      }`}
                      onClick={() => setStaffNameDropdownOpen(!staffNameDropdownOpen)}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={staffNameFilter ? styles.filterIconActive : styles.filterIcon}
                      >
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                      <div ref={staffNameDropdownRef} className={styles.dropdownAnchor}>
                        {staffNameDropdownOpen ? (
                          <div
                            className={styles.dropdownMenu}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className={styles.dropdownSearchWrap}>
                              <input
                                type="text"
                                placeholder="Tìm tên nhân viên..."
                                className={styles.dropdownSearchInput}
                                value={staffNameSearchQuery}
                                onChange={(e) => setStaffNameSearchQuery(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className={styles.dropdownList}>
                              <div
                                className={`${styles.dropdownItem} ${staffNameFilter === "" ? styles.dropdownItemActive : ""}`}
                                onClick={() => {
                                  setStaffNameFilter("");
                                  setStaffNameDropdownOpen(false);
                                  setStaffNameSearchQuery("");
                                }}
                              >
                                {staffNameFilter === "" ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <div className={styles.dropdownSpacer} />
                                )}
                                Tất cả
                              </div>
                              {uniqueStaffNames
                                .filter((name) => name.toLowerCase().includes(staffNameSearchQuery.toLowerCase()))
                                .map((name) => (
                                  <div
                                    key={name}
                                    className={`${styles.dropdownItem} ${staffNameFilter === name ? styles.dropdownItemActive : ""}`}
                                    onClick={() => {
                                      setStaffNameFilter(name);
                                      setStaffNameDropdownOpen(false);
                                      setStaffNameSearchQuery("");
                                    }}
                                  >
                                    {staffNameFilter === name ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    ) : (
                                      <div className={styles.dropdownSpacer} />
                                    )}
                                    {name}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </div>
                </div>
              </TableHead>
              <TableHead className={styles.colProject}>
                <div className={styles.headerFilter}>
                  <span>Dự án</span>
                  <div className={styles.filterTriggerWrap}>
                    <button
                      type="button"
                      className={`${styles.filterIconButton} ${styles.filterIconButtonLg} ${projectFilter ? styles.filterIconButtonActive : ""}`}
                      onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={projectFilter ? styles.filterIconActive : styles.filterIcon}
                      >
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
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
              </TableHead>
              <TableHead className={styles.colTask}>Task</TableHead>
              <TableHead className={styles.colContent}>Nội dung công việc</TableHead>
              <TableHead className={styles.colHours}>Số giờ</TableHead>
              <TableHead className={styles.colDate}>
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
                        width="15"
                        height="15"
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
              </TableHead>
              <TableHead className={styles.colActions}>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedLogworks.length > 0 ? (
              paginatedLogworks.map((lw) => (
                <TableRow
                  key={lw.id}
                  id={`logwork-row-${lw.id}`}
                  className={flashLogworkId === String(lw.id) ? styles.rowHighlight : undefined}
                >
                  <TableCell>
                    <div className={styles.staffName}>{getStaffCode(lw) || "—"}</div>
                  </TableCell>
                  <TableCell>
                    <div className={styles.staffName}>{lw.user_name || "Unknown"}</div>
                  </TableCell>
                  <TableCell className={styles.projectName}>
                    {lw.project_id ? (
                      <Link href={`/projects/${lw.project_id}?tab=overview`} className={styles.projectName}>
                        {lw.project_name || "Không xác định"}
                      </Link>
                    ) : (
                      lw.project_name || "Không xác định"
                    )}
                  </TableCell>
                  <TableCell>
                    {lw.task_id ? (
                      <Link href={`/tasks?taskId=${lw.task_id}`} className={styles.taskTitle}>
                        {lw.task_title || "---"}
                      </Link>
                    ) : (
                      <div className={styles.taskTitle}>{lw.task_title || "---"}</div>
                    )}
                  </TableCell>
                  <TableCell className={styles.cellContent}>
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
                  </TableCell>
                  <TableCell className={styles.hoursText}>
                    <strong>{lw.hours_spent}h</strong>
                  </TableCell>
                  <TableCell className={styles.dateText}>
                    {new Date(lw.work_date).toLocaleDateString("vi-VN")}
                  </TableCell>
                  <TableCell className={styles.cellActions}>
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
                        onClick={() => {
                          setRejectTarget(lw.id);
                          setRejectReason("");
                        }}
                        disabled={actionLoading === lw.id}
                      >
                        Từ chối
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className={styles.emptyFilter}>
                  Không tìm thấy logwork nào phù hợp với bộ lọc.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableWrap>

      {filteredLogworks.length > 0 ? (
        <div className={styles.paginationBar}>
          <p>
            Hiển thị {(validPage - 1) * pageSize + 1} -{" "}
            {Math.min(validPage * pageSize, filteredLogworks.length)} / {filteredLogworks.length}{" "}
            logwork.
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
      ) : null}

      {/* Reject Reason Modal */}
      {rejectTarget !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setRejectTarget(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "440px",
              padding: "1.5rem",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Lý do từ chối</h3>
            <textarea
              autoFocus
              rows={3}
              placeholder="Nhập lý do từ chối logwork..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "8px",
                border: "1px solid var(--border, #e2e8f0)",
                fontSize: "0.95rem",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  fontWeight: 500,
                  background: "rgba(15, 23, 42, 0.05)",
                  border: "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim()}
                onClick={async () => {
                  const id = rejectTarget;
                  setRejectTarget(null);
                  await handleReject(id, rejectReason.trim());
                }}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  fontWeight: 500,
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  cursor: rejectReason.trim() ? "pointer" : "not-allowed",
                  opacity: rejectReason.trim() ? 1 : 0.5,
                }}
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`${styles.toast} ${styles[`toast-${toastMessage.type}`]}`}>
          {toastMessage.type === 'success' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          )}
          {toastMessage.message}
        </div>
      )}
    </>
  );
}
