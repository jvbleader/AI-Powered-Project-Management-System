"use client";

import styles from "./table-pagination.module.css";

type TablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  itemLabel: string;
  className?: string;
  showSummary?: boolean;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function ChevronLeftIcon() {
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
      aria-hidden
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
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
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function TablePagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  itemLabel,
  className,
  showSummary = true,
}: TablePaginationProps) {
  if (total <= 0) {
    return null;
  }

  const pages = Math.max(1, totalPages ?? Math.ceil(total / pageSize));
  const showButtons = pages > 1;
  const showCount = showSummary && showButtons;

  if (!showButtons) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={classNames(styles.bar, "filtered-list-chrome", className)}>
      {showCount ? (
        <p>
          Hiển thị {from} - {to} trên tổng {total} {itemLabel}.
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={`secondary-button ${styles.pageButton}`}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeftIcon />
          Trang trước
        </button>
        <span className={styles.pageStatus}>
          Trang {page} / {pages}
        </span>
        <button
          type="button"
          className={`primary-button ${styles.pageButton}`}
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          disabled={page >= pages}
        >
          Trang sau
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}
