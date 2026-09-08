import type { ReactNode, CSSProperties } from "react";
import { UserAvatar } from "@/components/user-avatar";
export * from "./ui/table";

type Tone = "accent" | "on-track" | "watch" | "critical" | "neutral" | "todo" | "progress" | "done";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Surface({
  title,
  kicker,
  aside,
  className,
  style,
  children,
}: {
  title: ReactNode;
  kicker?: string;
  aside?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const isFlexColumn =
    style?.display === "flex" &&
    (style.flexDirection === "column" || style.flexDirection === undefined);

  return (
    <section className={classNames("surface", className)} style={style}>
      <div className="surface-header" style={isFlexColumn ? { flexShrink: 0 } : undefined}>
        <div>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          <h2>{title}</h2>
        </div>
        {aside ? <div>{aside}</div> : null}
      </div>
      {isFlexColumn ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function StatusPill({ label, tone = "neutral", style }: { label: ReactNode; tone?: Tone; style?: CSSProperties }) {
  return <span className={classNames("pill", `pill-${tone}`)} style={style}>{label}</span>;
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const isZero = value <= 0;
  return (
    <div className="progress-block">
      {label ? (
        <div className="progress-meta">
          <span>{label}</span>
          <strong>{value}%</strong>
        </div>
      ) : null}
      <div className="progress-track">
        <span
          className="progress-fill"
          style={{ width: isZero ? "0%" : `${Math.max(6, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  tone = "accent",
}: {
  label: string;
  value: string;
  note: string;
  tone?: Tone;
}) {
  return (
    <article className={classNames("stat-card", `stat-${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

export function AvatarRail({
  items,
}: {
  items: Array<{ id: string; initials: string; name: string; email?: string; avatarUrl?: string }>;
}) {
  return (
    <div className="avatar-rail">
      {items.map((item) => (
        <UserAvatar
          key={item.id}
          userId={item.id}
          email={item.email}
          name={item.name}
          avatarUrl={item.avatarUrl}
          size={32}
        />
      ))}
    </div>
  );
}

export function KeyValueList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="key-value-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function SegmentBar({
  segments,
  showLegend = true,
}: {
  segments: Array<{ label: string; value: number; tone: "todo" | "progress" | "done" | "outdate" }>;
  showLegend?: boolean;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className="segment-bar-stack">
      <div className="segment-bar-track" aria-hidden="true">
        {segments.map((segment) => {
          const width = total && segment.value > 0 ? Math.max(6, (segment.value / total) * 100) : 0;

          return (
            <span
              key={segment.label}
              className={classNames("segment-bar-fill", `segment-bar-${segment.tone}`)}
              style={{ width: `${width}%` }}
            />
          );
        })}
      </div>

      {showLegend ? (
        <div className="segment-legend">
          {segments.map((segment) => (
            <div key={segment.label} className="segment-legend-item">
              <span className={classNames("segment-dot", `segment-dot-${segment.tone}`)} />
              <span>{segment.label}</span>
              <strong>{segment.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ value: number; tone: "todo" | "progress" | "done" | "outdate" | "neutral" }>;
  centerLabel: string;
  centerValue: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const colors = {
    todo: "#facc15",
    progress: "#3b82f6",
    done: "#22c55e",
    outdate: "#ef4444",
    neutral: "#94a3b8",
  } as Record<string, string>;

  const gradient = segments
    .reduce<Array<string>>((parts, segment, index) => {
      const previous = segments
        .slice(0, index)
        .reduce((sum, current) => sum + (total ? (current.value / total) * 100 : 0), 0);
      const percentage = total ? (segment.value / total) * 100 : 0;
      const from = previous;
      const to = previous + percentage;

      parts.push(`${colors[segment.tone]} ${from}% ${to}%`);
      return parts;
    }, [])
    .join(", ");

  return (
    <div className="donut-chart-shell">
      <div
        className="donut-chart"
        style={{ backgroundImage: `conic-gradient(${gradient || "#e2e8f0 0 100%"})` }}
      >
        <div className="donut-chart-center">
          <span>{centerLabel}</span>
          <strong>{centerValue}</strong>
        </div>
      </div>
    </div>
  );
}

export function MiniBars({
  items,
}: {
  items: Array<{ label: string; value: number; note?: string }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="mini-bars">
      {items.map((item) => (
        <div key={item.label} className="mini-bar-row">
          <div className="mini-bar-copy">
            <span>{item.label}</span>
            <strong>{item.value}%</strong>
          </div>
          <div className="mini-bar-track">
            <span
              className="mini-bar-fill"
              style={{ width: `${item.value <= 0 ? 0 : Math.max(8, (item.value / max) * 100)}%` }}
            />
          </div>
          {item.note ? <small>{item.note}</small> : null}
        </div>
      ))}
    </div>
  );
}

import Link from "next/link";

const COLUMN_STATUS_COLORS = {
  accent: "#2563eb",
  "on-track": "#16a34a",
  watch: "#facc15",
  critical: "#dc2626",
  neutral: "#94a3b8",
} as const;

export type ColumnChartTone = keyof typeof COLUMN_STATUS_COLORS;

export function ColumnChart({
  items,
  height = "100%",
}: {
  items: Array<{
    label: string;
    value: number;
    tone?: ColumnChartTone;
    href?: string;
  }>;
  /** Fixed px or CSS size; use "100%" to fill the parent card body */
  height?: number | string;
}) {
  const max = Math.max(...items.map((item) => item.value), 100);
  const columnWidth = 88;
  const gap = 10;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        flex: height === "100%" ? 1 : undefined,
        height,
        minHeight: 0,
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-evenly",
          gap: `${gap}px`,
          flex: 1,
          minHeight: 0,
          height: "100%",
          width: "max-content",
          minWidth: "100%",
          padding: "0.1rem 0.15rem 0",
          boxSizing: "border-box",
          borderBottom: "1px solid rgba(148,163,184,0.28)",
        }}
      >
        {items.map((item) => {
          const isZero = item.value <= 0;
          const barPct = isZero ? 0 : Math.max(8, (item.value / max) * 100);
          const color = COLUMN_STATUS_COLORS[item.tone ?? "accent"];

          const content = (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
                height: "100%",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "100%",
                    height: isZero ? "auto" : `${barPct}%`,
                    minHeight: isZero ? "auto" : "18px",
                    justifyContent: "flex-end",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: isZero ? "var(--foreground-muted)" : "var(--ink)",
                      flexShrink: 0,
                      lineHeight: 1,
                      marginBottom: isZero ? "0.15rem" : "0.25rem",
                    }}
                  >
                    {item.value}%
                  </span>
                  {!isZero && (
                    <div
                      style={{
                        width: "36px",
                        flex: 1,
                        minHeight: "6px",
                        backgroundColor: color,
                        borderRadius: "6px 6px 0 0",
                        transition: "height 0.4s ease",
                        boxShadow: "0 2px 4px -1px rgba(0, 0, 0, 0.05)",
                      }}
                      title={`${item.label}: ${item.value}%`}
                    />
                  )}
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.68rem",
                  textAlign: "center",
                  color: "var(--foreground-muted)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: "100%",
                  lineHeight: 1.2,
                  height: "2.4em",
                  flexShrink: 0,
                  marginTop: "0.3rem",
                  paddingBottom: "0.1rem",
                }}
                title={item.label}
              >
                {item.label}
              </span>
            </div>
          );

          if (item.href) {
            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  flex: `0 0 ${columnWidth}px`,
                  width: columnWidth,
                  height: "100%",
                  display: "block",
                  alignSelf: "stretch",
                }}
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={item.label}
              style={{
                flex: `0 0 ${columnWidth}px`,
                width: columnWidth,
                height: "100%",
                alignSelf: "stretch",
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HEALTH_BAR_COLORS = {
  "on-track": "#22c55e",
  watch: "#f59e0b",
  critical: "#ef4444",
} as const;

export function HorizontalBarChart({
  items,
  maxHeight = 460,
  valueSuffix = "%",
}: {
  items: Array<{
    id: string;
    label: string;
    value: number;
    max?: number;
    tone?: "on-track" | "watch" | "critical";
    meta?: string;
    href?: string;
  }>;
  maxHeight?: number;
  valueSuffix?: string;
}) {
  const scaleMax = Math.max(...items.map((item) => item.max ?? item.value), 1);

  return (
    <div
      style={{
        maxHeight,
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: "0.7rem",
        paddingRight: "0.25rem",
        minHeight: Math.min(maxHeight, Math.max(items.length * 36, 120)),
      }}
    >
      {items.length === 0 ? (
        <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
          Chưa có dữ liệu
        </div>
      ) : (
        items.map((item) => {
          const width = Math.max(4, Math.round((item.value / scaleMax) * 100));
          const color = HEALTH_BAR_COLORS[item.tone ?? "on-track"];
          const row = (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1.6fr) auto",
                gap: "0.75rem",
                alignItems: "center",
              }}
            >
              <span
                title={item.label}
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: "var(--ink)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.label}
              </span>
              <div
                style={{
                  height: "10px",
                  borderRadius: "999px",
                  background: "rgba(148,163,184,0.16)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${width}%`,
                    height: "100%",
                    borderRadius: "999px",
                    background: color,
                    transition: "width 0.35s ease",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--foreground-muted)",
                  whiteSpace: "nowrap",
                  textAlign: "right",
                  minWidth: "4.5rem",
                }}
              >
                <strong style={{ color: "var(--ink)", fontSize: "0.8125rem" }}>
                  {item.value}
                  {valueSuffix}
                </strong>
                {item.meta ? ` · ${item.meta}` : ""}
              </span>
            </div>
          );

          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                {row}
              </Link>
            );
          }

          return <div key={item.id}>{row}</div>;
        })
      )}
    </div>
  );
}
