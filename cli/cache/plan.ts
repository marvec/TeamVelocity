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
