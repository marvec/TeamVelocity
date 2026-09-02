/**
 * Week bucketing — pure, deterministic, no I/O (§3, §7 of docs/prd.md).
 *
 * A "week" is a sprint window that starts on a configured weekday
 * (`sprintStartsOn`) at a configured hour (`sprintStartHour`) in the machine's
 * **local** timezone, and runs for exactly 7 calendar days (wall-clock, so it
 * spans 167/168/169 real hours across a DST transition — the boundary always
 * lands on the same weekday + hour). `weekStart` is the ISO date of the window
 * start and is used as the id in data paths and URLs.
 *
 * All arithmetic uses the local-time Date constructor, so tests must pin a
 * timezone (the project uses `TZ=Europe/Prague`) for determinism.
 */

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

/** JS `Date.getDay()` index (Sun = 0) for each weekday name. */
const WEEKDAY_INDEX: Record<Weekday, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const WEEKDAYS: readonly Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface WeekConfig {
  /** Weekday the sprint window opens on. Default "Mon". */
  sprintStartsOn: Weekday;
  /** Hour of day (0–23, local) the boundary flips. Default 0. */
  sprintStartHour: number;
}

export interface WeekWindow {
  /** Instant the window opens (inclusive). */
  weekStart: Date;
  /** Instant the next window opens (exclusive end). */
  weekEnd: Date;
  /** ISO date `YYYY-MM-DD` of `weekStart`, used as the id in paths/URLs. */
  key: string;
  /** Human range label, e.g. `2026/08/24–08/30`. */
  label: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local-time `YYYY-MM-DD` for a date (the day the week window opens). */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * The most recent sprint boundary at or before `date`, as a local-time instant
 * on `sprintStartsOn` at `sprintStartHour`.
 */
export function weekStartFor(date: Date, cfg: WeekConfig): Date {
  const target = WEEKDAY_INDEX[cfg.sprintStartsOn];
  // Boundary hour on the same local calendar day as `date`.
  let boundary = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    cfg.sprintStartHour,
    0,
    0,
    0,
  );
  // Walk back to the target weekday.
  const delta = (boundary.getDay() - target + 7) % 7;
  boundary = new Date(
    boundary.getFullYear(),
    boundary.getMonth(),
    boundary.getDate() - delta,
    cfg.sprintStartHour,
    0,
    0,
    0,
  );
  // If we landed after `date` (same weekday but the hour hasn't flipped yet),
  // step back a full week.
  if (boundary.getTime() > date.getTime()) {
    boundary = new Date(
      boundary.getFullYear(),
      boundary.getMonth(),
      boundary.getDate() - 7,
      cfg.sprintStartHour,
      0,
      0,
      0,
    );
  }
  return boundary;
}

/** The exclusive end of the window that opens at `weekStart` (start + 7 wall-clock days). */
export function weekEndFor(weekStart: Date): Date {
  return new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 7,
    weekStart.getHours(),
    0,
    0,
    0,
  );
}

/** Human label like `2026/08/24–08/30` (inclusive last day of the window). */
export function weekLabel(weekStart: Date): string {
  const lastDay = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 6,
    weekStart.getHours(),
    0,
    0,
    0,
  );
  const y = weekStart.getFullYear();
  const startMd = `${pad2(weekStart.getMonth() + 1)}/${pad2(weekStart.getDate())}`;
  const endMd = `${pad2(lastDay.getMonth() + 1)}/${pad2(lastDay.getDate())}`;
  return `${y}/${startMd}–${endMd}`;
}

/** Build the full `WeekWindow` for the window containing `date`. */
export function weekWindowFor(date: Date, cfg: WeekConfig): WeekWindow {
  const weekStart = weekStartFor(date, cfg);
  return buildWindow(weekStart);
}

function buildWindow(weekStart: Date): WeekWindow {
  return {
    weekStart,
    weekEnd: weekEndFor(weekStart),
    key: isoDate(weekStart),
    label: weekLabel(weekStart),
  };
}

/**
 * All week windows that open within `[rangeStart, rangeEnd]`, in chronological
 * order — including empty weeks (weeks with no activity). The first window is
 * the one containing `rangeStart`; the last is the one containing `rangeEnd`.
 */
export function enumerateWeeks(rangeStart: Date, rangeEnd: Date, cfg: WeekConfig): WeekWindow[] {
  if (rangeEnd.getTime() < rangeStart.getTime()) return [];
  const windows: WeekWindow[] = [];
  let cursor = weekStartFor(rangeStart, cfg);
  const lastStart = weekStartFor(rangeEnd, cfg);
  // Iterate inclusively up to the window that contains rangeEnd. Compare by
  // key to avoid any sub-day drift; step by whole wall-clock weeks.
  // A hard cap guards against pathological inputs.
  for (let i = 0; i < 10_000; i++) {
    windows.push(buildWindow(cursor));
    if (cursor.getTime() >= lastStart.getTime()) break;
    cursor = weekEndFor(cursor);
  }
  return windows;
}

/** The `YYYY-MM-DD` week id for the window containing `date`. */
export function weekKeyFor(date: Date, cfg: WeekConfig): string {
  return isoDate(weekStartFor(date, cfg));
}

/**
 * Bucket items by their week id. Items whose date falls outside any provided
 * key are still keyed by their own week; use `enumerateWeeks` to materialize
 * empty weeks. Returns a Map keyed by `YYYY-MM-DD` week id.
 */
export function bucketByWeek<T>(
  items: readonly T[],
  getDate: (item: T) => Date,
  cfg: WeekConfig,
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = weekKeyFor(getDate(item), cfg);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return buckets;
}
