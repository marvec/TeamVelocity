/**
 * Work out the smallest set of fetch windows that brings a handle's cached
 * coverage up to what the caller asked for. Pure — no I/O, no clock
 * (design §4). This is what turns "re-fetch 26 weeks every run" into
 * "re-fetch the last couple of days".
 */

export interface Window {
  since: Date;
  until: Date;
}

/** The single interval of activity time already fetched for a handle. */
export type Coverage = Window;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The smallest window containing both. Exact as a coverage union whenever the
 * two touch or overlap, which is all `planFetchWindows` ever produces.
 */
export function unionWindow(a: Window, b: Window): Window {
  return {
    since: new Date(Math.min(a.since.getTime(), b.since.getTime())),
    until: new Date(Math.max(a.until.getTime(), b.until.getTime())),
  };
}

/**
 * Windows still to fetch, in the order they should be fetched and merged.
 *
 * A back gap is returned before a forward gap so that when both exist the
 * fresher forward fetch is merged last and wins last-write-wins on any entity
 * the two have in common.
 *
 * `overlapDays` re-fetches a little of what is already held, which is how a
 * record that changed right at the previous boundary still gets picked up.
 * It is clamped so the forward gap can never start before coverage begins —
 * that would claim to cover an interval nothing was ever fetched for.
 */
export function planFetchWindows(
  coverage: Coverage | undefined,
  requested: Window,
  overlapDays: number,
): Window[] {
  if (!coverage) return [{ since: requested.since, until: requested.until }];

  const windows: Window[] = [];

  if (requested.since.getTime() < coverage.since.getTime()) {
    windows.push({ since: requested.since, until: coverage.since });
  }

  if (requested.until.getTime() > coverage.until.getTime()) {
    const overlapMs = Math.max(0, overlapDays) * MS_PER_DAY;
    const rewound = coverage.until.getTime() - overlapMs;
    const start = Math.max(rewound, coverage.since.getTime());
    windows.push({ since: new Date(start), until: requested.until });
  }

  return windows;
}

/** The handles (or anything) that need one exact window fetched. */
export interface WindowGroup<T> {
  window: Window;
  items: T[];
}

/**
 * Group items by the exact windows they need, so one request serves every item
 * sharing a window. Only identical windows group: fetching a wider window for
 * someone would be safe, but recording a narrower one as covered would not.
 *
 * Groups come oldest-first. A handle's own windows never overlap, so this keeps
 * each handle's back gap merging before its fresher forward gap, as
 * {@link planFetchWindows} requires.
 */
export function groupByWindow<T>(plans: { item: T; windows: Window[] }[]): WindowGroup<T>[] {
  const groups = new Map<string, WindowGroup<T>>();
  for (const { item, windows } of plans) {
    for (const window of windows) {
      const key = `${window.since.toISOString()}..${window.until.toISOString()}`;
      const group = groups.get(key) ?? { window, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.window.since.getTime() - b.window.since.getTime() || a.window.until.getTime() - b.window.until.getTime(),
  );
}
