import type { ReactNode } from "react";

import styles from "./loading-state.module.css";

export type LoadingStateVariant =
  | "spinner"
  | "table"
  | "cards"
  | "page"
  | "dashboard"
  | "profile"
  | "gantt";

type LoadingStateProps = {
  variant?: LoadingStateVariant;
  label?: string;
  rows?: number;
  className?: string;
};

function Bone({
  width = "100%",
  height = 12,
  radius,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}) {
  return (
    <span
      className={`${styles.bone} ${className ?? ""}`}
      style={{ width, height, borderRadius: radius }}
    />
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className={styles.table} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.tableRow}>
          <Bone height={14} width="78%" />
          <Bone height={14} width="52%" />
          <Bone height={14} width="70%" />
          <Bone height={22} width="64%" radius={999} />
          <Bone height={14} width="48%" />
        </div>
      ))}
    </div>
  );
}

export function TableBodySkeleton({
  rows = 8,
  columns,
}: {
  rows?: number;
  columns: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <tr key={index} aria-hidden>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              <Bone
                height={14}
                width={`${58 + ((index * 11 + column * 17) % 32)}%`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function CardsSkeleton({ rows }: { rows: number }) {
  return (
    <div className={styles.cards} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.card}>
          <Bone height={11} width="28%" />
          <Bone height={16} width="72%" />
          <Bone height={12} width="44%" />
        </div>
      ))}
    </div>
  );
}

export function LoadingState({
  variant = "spinner",
  label = "Đang tải dữ liệu...",
  rows,
  className,
}: LoadingStateProps) {
  const tableRows = rows ?? 8;
  const cardRows = rows ?? 4;

  const body = (() => {
    switch (variant) {
      case "table":
        return <TableSkeleton rows={tableRows} />;
      case "cards":
        return <CardsSkeleton rows={cardRows} />;
      case "page":
        return (
          <div className={styles.page} aria-hidden>
            <div className={styles.toolbar}>
              <Bone height={38} width="70%" radius={999} />
              <Bone height={38} width="30%" radius={999} />
            </div>
            <TableSkeleton rows={tableRows} />
          </div>
        );
      case "dashboard":
        return (
          <div className={styles.dashboard} aria-hidden>
            <div className={styles.kpiRow}>
              <Bone className={styles.kpi} height={78} />
              <Bone className={styles.kpi} height={78} />
              <Bone className={styles.kpi} height={78} />
              <Bone className={styles.kpi} height={78} />
            </div>
            <div className={styles.dashGrid}>
              <Bone className={styles.panel} height={220} />
              <Bone className={styles.panel} height={220} />
            </div>
          </div>
        );
      case "profile":
        return (
          <div className={styles.profile} aria-hidden>
            <div className={styles.hero}>
              <Bone className={styles.avatar} height={72} width={72} radius="999px" />
              <Bone height={16} width="60%" />
              <Bone height={12} width="40%" />
            </div>
            <div className={styles.form}>
              <Bone height={14} width="30%" />
              <Bone height={38} />
              <Bone height={14} width="30%" />
              <Bone height={38} />
              <Bone height={14} width="30%" />
              <Bone height={38} />
            </div>
          </div>
        );
      case "gantt":
        return (
          <div className={styles.gantt} aria-hidden>
            {Array.from({ length: rows ?? 7 }, (_, index) => (
              <div key={index} className={styles.ganttRow}>
                <Bone height={16} width="80%" />
                <Bone height={18} width={`${40 + ((index * 13) % 45)}%`} radius={999} />
              </div>
            ))}
          </div>
        );
      default:
        return (
          <div className={styles.spinnerWrap}>
            <span className={styles.spinner} aria-hidden />
            <p className={styles.label}>{label}</p>
          </div>
        );
    }
  })();

  return (
    <div
      className={`${styles.wrap} ${className ?? ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {variant === "spinner" ? null : <span className={styles.srOnly}>{label}</span>}
      {body}
    </div>
  );
}

type AsyncContentProps = {
  isLoading: boolean;
  isEmpty: boolean;
  skeleton?: LoadingStateVariant;
  loadingLabel?: string;
  empty: ReactNode;
  children: ReactNode;
};

export function AsyncContent({
  isLoading,
  isEmpty,
  skeleton = "spinner",
  loadingLabel,
  empty,
  children,
}: AsyncContentProps) {
  if (isLoading) {
    return <LoadingState variant={skeleton} label={loadingLabel} />;
  }
  if (isEmpty) {
    return <>{empty}</>;
  }
  return <>{children}</>;
}
