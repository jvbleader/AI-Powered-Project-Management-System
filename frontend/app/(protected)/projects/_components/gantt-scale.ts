export type GanttScale = "day" | "week" | "month";

export type TimelineColumn = {
  start: Date;
  end: Date;
  offset: number;
  width: number;
  label: string;
  title?: string;
};

export type TimelineBand = {
  label: string;
  offset: number;
  width: number;
};

export type TimelineModel = {
  columns: TimelineColumn[];
  bands: TimelineBand[];
  width: number;
};

export const COLUMN_WIDTH: Record<GanttScale, number> = {
  day: 18,
  week: 52,
  month: 72,
};

const SCALE_LABELS: Record<GanttScale, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
};

export const GANTT_SCALES: GanttScale[] = ["day", "week", "month"];

export function ganttScaleLabel(scale: GanttScale) {
  return SCALE_LABELS[scale];
}

export function normalizeGanttScale(value: string | null | undefined): GanttScale {
  if (value === "week" || value === "month") return value;
  return "day";
}

export function startOfDay(value: string | Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function toIsoDate(value: string | Date) {
  const date = startOfDay(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthBandLabel(date: Date) {
  const raw = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return raw;
}

function monthColumnLabel(date: Date) {
  return date.toLocaleDateString("vi-VN", { month: "short" });
}

function weekColumnLabel(start: Date) {
  return `${start.getDate()}/${start.getMonth() + 1}`;
}

function weekColumnTitle(start: Date, endExclusive: Date) {
  const end = addDays(endExclusive, -1);
  const from = `${start.getDate()}/${start.getMonth() + 1}`;
  const to = `${end.getDate()}/${end.getMonth() + 1}`;
  return `${from} – ${to}`;
}

export function buildTimeline(minIso: string, maxIso: string, scale: GanttScale): TimelineModel {
  const rangeStart = startOfDay(minIso);
  const rangeEnd = startOfDay(maxIso);
  const widthUnit = COLUMN_WIDTH[scale];
  const columns: TimelineColumn[] = [];

  if (scale === "day") {
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const start = new Date(cursor);
      const end = addDays(start, 1);
      columns.push({
        start,
        end,
        offset: columns.length * widthUnit,
        width: widthUnit,
        label: start.getDay() === 1 ? String(start.getDate()) : "",
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (scale === "week") {
    const cursor = startOfWeek(rangeStart);
    const last = startOfWeek(rangeEnd);
    while (cursor <= last) {
      const start = new Date(cursor);
      const end = addDays(start, 7);
      columns.push({
        start,
        end,
        offset: columns.length * widthUnit,
        width: widthUnit,
        label: weekColumnLabel(start),
        title: weekColumnTitle(start, end),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (scale === "month") {
    const cursor = startOfMonth(rangeStart);
    const last = startOfMonth(rangeEnd);
    while (cursor <= last) {
      const start = new Date(cursor);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      columns.push({
        start,
        end,
        offset: columns.length * widthUnit,
        width: widthUnit,
        label: monthColumnLabel(start),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const width = columns.length * widthUnit;
  const bands: TimelineBand[] = [];

  columns.forEach((column) => {
    const label =
      scale === "month"
        ? String(column.start.getFullYear())
        : monthBandLabel(column.start);

    const prev = bands[bands.length - 1];
    if (prev && prev.label === label) {
      prev.width += column.width;
      return;
    }
    bands.push({ label, offset: column.offset, width: column.width });
  });

  return { columns, bands, width };
}

export function dateToX(value: string | Date, timeline: TimelineModel) {
  if (!timeline.columns.length) return 0;
  const time = startOfDay(value).getTime();
  const first = timeline.columns[0];
  const last = timeline.columns[timeline.columns.length - 1];
  if (time <= first.start.getTime()) return 0;
  if (time >= last.end.getTime()) return timeline.width;

  for (const column of timeline.columns) {
    const start = column.start.getTime();
    const end = column.end.getTime();
    if (time < end) {
      const span = Math.max(1, end - start);
      return column.offset + ((time - start) / span) * column.width;
    }
  }
  return timeline.width;
}

export function intervalToX(start: string | Date, end: string | Date, timeline: TimelineModel) {
  const left = dateToX(start, timeline);
  const right = dateToX(addDays(startOfDay(end), 1), timeline);
  return {
    left,
    width: Math.max(6, right - left),
  };
}

export function assignOverlapLanes(intervals: Array<{ start: number; end: number }>) {
  const order = intervals
    .map((interval, index) => ({ ...interval, index }))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const laneEnds: number[] = [];
  const lanes = new Array<number>(intervals.length).fill(0);

  order.forEach((item) => {
    let lane = laneEnds.findIndex((end) => item.start >= end);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    lanes[item.index] = lane;
  });

  return {
    lanes,
    laneCount: Math.max(1, laneEnds.length),
  };
}
