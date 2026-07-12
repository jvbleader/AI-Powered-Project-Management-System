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
  children,
}: {
  title: string;
  kicker?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={classNames("surface", className)}>
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
}: {
  segments: Array<{ label: string; value: number; tone: "todo" | "progress" | "done" | "outdate" }>;
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

      <div className="segment-legend">
        {segments.map((segment) => (
          <div key={segment.label} className="segment-legend-item">
            <span className={classNames("segment-dot", `segment-dot-${segment.tone}`)} />
            <span>{segment.label}</span>
            <strong>{segment.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ value: number; tone: "todo" | "progress" | "done" | "outdate" }>;
  centerLabel: string;
  centerValue: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const colors = {
    todo: "#facc15",
    progress: "#3b82f6",
    done: "#22c55e",
    outdate: "#ef4444",
  } as const;

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
