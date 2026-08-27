"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatEmployeeCode } from "@/lib/utils/format";
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

function parseSafeTimestamp(value: string | number | Date | undefined | null): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  const normalized = String(value).trim().replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/, "$1T$2");
  const time = Date.parse(normalized);
  if (Number.isFinite(time)) return time;

  const fallback = new Date(value).getTime();
  return Number.isFinite(fallback) ? fallback : 0;
}

function compareNewestLogworkFirst(a: PendingLogWork, b: PendingLogWork) {
  // 1. Ưu tiên hàng đầu: Thời điểm ghi nhận/gửi logwork (created_at) mới nhất lên đầu
  const bCreated = parseSafeTimestamp(b.created_at);
  const aCreated = parseSafeTimestamp(a.created_at);
  if (bCreated !== aCreated) {
    return bCreated - aCreated;
  }

  // 2. Nếu cùng thời điểm tạo: ngày làm việc (work_date) mới nhất lên đầu
  const bWork = parseSafeTimestamp(b.work_date);
  const aWork = parseSafeTimestamp(a.work_date);
  if (bWork !== aWork) {
    return bWork - aWork;
  }

  // 3. Fallback theo ID mới nhất
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? styles.filterIconActive : styles.filterIcon}
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ColumnSearch({
  label,
  active,
  open,
  value,
  onChange,
  onToggle,
  onClose,
  inputRef,
  placeholder,
}: {
  label: string;
  active: boolean;
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
}) {
  const showInput = open || active;

  useEffect(() => {
    if (!open) return;

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [inputRef, open]);

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
              <SearchIcon active={active} />
            </span>
            <input
              ref={inputRef}
              type="text"
              className={styles.headerSearchInput}
              placeholder={placeholder || "Tìm kiếm..."}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              aria-label={`Tìm kiếm ${label}`}
            />
            <button
              type="button"
              className={styles.headerSearchClose}
              onClick={onClose}
              aria-label="Đóng tìm kiếm"
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
            aria-label={`Tìm kiếm theo ${label}`}
          >
            {label}
          </button>
          <button
            type="button"
            className={`${styles.filterIconButton} ${styles.filterIconButtonLg} ${active ? styles.filterIconButtonActive : ""}`}
            onClick={onToggle}
            aria-label={`Tìm kiếm theo ${label}`}
          >
            <SearchIcon active={active} />
          </button>
        </>
      )}
    </div>
  );
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
  const [flashLogworkId, setFlashLogworkId] = useState<string | null>(() => {
    return highlightFromUrl ? String(highlightFromUrl).replace(/^lw-/, "").trim() : null;
  });
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(() => {
    return highlightFromUrl ? String(highlightFromUrl).replace(/^lw-/, "").trim() : null;
  });
  const tableAnchorRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [filledRowHeight, setFilledRowHeight] = useState<number>();
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
  const staffNameInputRef = useRef<HTMLInputElement>(null);
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
      map.set(email, (user.employeeCode ?? formatEmployeeCode(user.id)).toString());
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
    return logworks
      .filter((lw) => {
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
      })
      .sort(compareNewestLogworkFirst);
  }, [logworks, projectFilter, dateFilter, staffCodeFilter, staffNameFilter, emailToEmployeeCode]);

  const totalPages = Math.max(1, Math.ceil(filteredLogworks.length / pageSize));
  const validPage = Math.min(page, totalPages);
  const paginatedLogworks = filteredLogworks.slice(
    (validPage - 1) * pageSize,
    validPage * pageSize,
  );

  useLayoutEffect(() => {
    const tableWrap = tableAnchorRef.current;
    if (!tableWrap) return;

    const updateRowHeight = () => {
      const rows = Array.from(tableWrap.querySelectorAll("tbody tr"));
      const headerHeight = tableWrap.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      if (rows.length === 0 || headerHeight === 0) return;

      const availableRowSpace = tableWrap.clientHeight - headerHeight;
      const nextHeight = rows.length > 1 ? Math.floor(availableRowSpace / rows.length) : undefined;
      setFilledRowHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    const frame = window.requestAnimationFrame(updateRowHeight);
    const observer = new ResizeObserver(updateRowHeight);
    observer.observe(tableWrap);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [page, paginatedLogworks.length]);

  useEffect(() => {
    if (!activeHighlightId) {
      setPage(1);
    }
  }, [projectFilter, dateFilter, staffCodeFilter, staffNameFilter, activeHighlightId]);

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
    if (!highlightFromUrl) return;

    const normalized = String(highlightFromUrl).replace(/^lw-/, "").trim();
    if (!normalized) return;

    setProjectFilter("");
    setDateFilter("");
    setStaffCodeFilter("");
    setStaffNameFilter("");
    setActiveHighlightId(normalized);
    setFlashLogworkId(normalized);

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("highlightLogworkId")) {
        params.delete("highlightLogworkId");
        const query = params.toString();
        window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
      }
    } catch {
      // Ignore in non-browser environments
    }
  }, [highlightFromUrl, pathname]);

  // Jump to page containing the highlighted logwork item
  useEffect(() => {
    if (!activeHighlightId || filteredLogworks.length === 0) return;

    const normalizedId = String(activeHighlightId).replace(/^lw-/, "").trim();
    if (!normalizedId) return;

    const targetIndex = filteredLogworks.findIndex(
      (lw) => String(lw.id) === normalizedId,
    );

    if (targetIndex >= 0) {
      const targetPage = Math.floor(targetIndex / pageSize) + 1;
      setPage(targetPage);
    }
  }, [activeHighlightId, filteredLogworks, pageSize]);

  // Smooth scroll and flash highlight on targeted row
  useEffect(() => {
    if (!activeHighlightId) return;

    const normalizedId = String(activeHighlightId).replace(/^lw-/, "").trim();
    if (!normalizedId) return;

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const attemptScroll = (delay: number) => {
      const timer = setTimeout(() => {
        const el = document.getElementById(`logwork-row-${normalizedId}`);
        if (el) {
          el.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, delay);
      timers.push(timer);
    };

    attemptScroll(100);
    attemptScroll(300);
    attemptScroll(600);
    attemptScroll(1000);

    const clearTimer = setTimeout(() => {
      setFlashLogworkId(null);
      setActiveHighlightId(null);
    }, 6000);
    timers.push(clearTimer);

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [activeHighlightId, page, loading]);

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
      <div className={styles.panel}>
        <div className={styles.card}>
          <TableWrap ref={tableAnchorRef} className={styles.tableWrap}>
            <Table>
          <colgroup>
            <col className={styles.colEmployeeCode} />
            <col className={styles.colEmployeeName} />
            <col className={styles.colProject} />
            <col className={styles.colTask} />
            <col className={styles.colContent} />
            <col className={styles.colHours} />
            <col className={styles.colDate} />
            <col className={styles.colActions} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className={styles.colEmployeeCode}>
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
              <TableHead className={styles.colEmployeeName}>
                <ColumnSearch
                  label="Tên nhân viên"
                  active={Boolean(staffNameFilter.trim())}
                  open={staffNameDropdownOpen}
                  value={staffNameFilter}
                  onChange={(val) => setStaffNameFilter(val)}
                  onToggle={() => setStaffNameDropdownOpen(!staffNameDropdownOpen)}
                  onClose={() => {
                    setStaffNameFilter("");
                    setStaffNameDropdownOpen(false);
                  }}
                  inputRef={staffNameInputRef}
                  placeholder="Tìm tên nhân viên..."
                />
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
                  style={filledRowHeight ? { height: filledRowHeight } : undefined}
                  className={
                    (flashLogworkId && String(lw.id) === String(flashLogworkId)) ||
                    (activeHighlightId && String(lw.id) === String(activeHighlightId))
                      ? styles.rowHighlight
                      : undefined
                  }
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
              className={validPage >= totalPages ? "secondary-button" : "primary-button"}
              onClick={() => setPage(Math.min(totalPages, validPage + 1))}
              disabled={validPage >= totalPages}
            >
              Trang sau
            </button>
          </div>
        </div>
      ) : null}
        </div>
      </div>

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
