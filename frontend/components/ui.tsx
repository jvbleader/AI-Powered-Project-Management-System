import type { ReactNode } from "react";

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
  title: string;
  kicker?: string;
  aside?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <section className={classNames("surface", className)} style={style}>
      <div className="surface-header">
        <div>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          <h2>{title}</h2>
        </div>
        {aside ? <div>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={classNames("pill", `pill-${tone}`)}>{label}</span>;
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
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
          style={{ width: `${Math.max(6, Math.min(100, value))}%` }}
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
  items: Array<{ id: string; initials: string; name: string }>;
}) {
  return (
    <div className="avatar-rail">
      {items.map((item) => (
        <span key={item.id} title={item.name} className="avatar-token">
          {item.initials}
        </span>
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
          const width = total ? Math.max(6, (segment.value / total) * 100) : 0;

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
              style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }}
            />
          </div>
          {item.note ? <small>{item.note}</small> : null}
        </div>
      ))}
    </div>
  );
}

import Link from "next/link";

export function ColumnChart({
  items,
}: {
  items: Array<{ label: string; value: number; tone?: "on-track" | "watch" | "critical"; href?: string }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 100);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", height: "100%", minHeight: "250px", padding: "1rem 0", width: "100%", overflowX: "auto", borderBottom: "1px solid rgba(148,163,184,0.2)" }}>
      {items.map((item) => {
        const height = Math.max(2, (item.value / max) * 100);
        const color = item.tone === "critical" ? "#ef4444" : item.tone === "watch" ? "#facc15" : "#22c55e";
        
        const content = (
          <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: "80px", gap: "0.5rem", height: "100%", justifyContent: "flex-end" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--ink)" }}>{item.value}%</span>
            <div style={{ 
              width: "100%", 
              maxWidth: "48px", 
              height: `${height}%`, 
              minHeight: "4px",
              backgroundColor: color, 
              borderRadius: "6px 6px 0 0",
              transition: "all 0.4s ease",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)"
            }} title={item.label} />
            <span style={{ 
              fontSize: "0.75rem", 
              textAlign: "center", 
              color: "var(--foreground-muted)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
              width: "100%",
              lineHeight: 1.2,
              height: "2.4em"
            }} title={item.label}>
              {item.label}
            </span>
          </div>
        );

        if (item.href) {
          return (
            <Link key={item.label} href={item.href} style={{ textDecoration: "none", color: "inherit", flex: 1, display: "flex", height: "100%" }}>
              {content}
            </Link>
          );
        }

        return content;
      })}
    </div>
  );
}
