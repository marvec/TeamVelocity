import { describe, it, expect } from "vitest";
import { planFetchWindows, type Coverage, type Window } from "./plan";

const d = (iso: string): Date => new Date(iso);

/** Render windows as ISO pairs so a failure reads as dates, not objects. */
function show(windows: Window[]): string[] {
  return windows.map((w) => `${w.since.toISOString()}..${w.until.toISOString()}`);
}

const requested: Window = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-15T00:00:00.000Z") };

describe("planFetchWindows — no coverage", () => {
  it("asks for the whole requested window when the handle was never fetched", () => {
    expect(show(planFetchWindows(undefined, requested, 2))).toEqual([
      "2026-03-01T00:00:00.000Z..2026-09-15T00:00:00.000Z",
    ]);
  });
});

describe("planFetchWindows — gaps", () => {
  it("returns nothing when the request is already covered", () => {
    const coverage: Coverage = { since: d("2026-01-01T00:00:00.000Z"), until: d("2026-09-15T00:00:00.000Z") };
    expect(planFetchWindows(coverage, requested, 2)).toEqual([]);
  });

  it("asks only for the forward gap on an ordinary repeat pull", () => {
    // Covered through Sep 13; now want through Sep 15, with 2 days of overlap.
    const coverage: Coverage = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-13T00:00:00.000Z") };
    expect(show(planFetchWindows(coverage, requested, 2))).toEqual([
      "2026-09-11T00:00:00.000Z..2026-09-15T00:00:00.000Z",
    ]);
  });

  it("asks only for the back gap when history is extended further back", () => {
    const coverage: Coverage = { since: d("2026-06-01T00:00:00.000Z"), until: d("2026-09-15T00:00:00.000Z") };
    expect(show(planFetchWindows(coverage, requested, 2))).toEqual([
      "2026-03-01T00:00:00.000Z..2026-06-01T00:00:00.000Z",
    ]);
  });

  it("asks for both gaps, back first so the fresher forward fetch wins on overlap", () => {
    const coverage: Coverage = { since: d("2026-06-01T00:00:00.000Z"), until: d("2026-09-13T00:00:00.000Z") };
    expect(show(planFetchWindows(coverage, requested, 2))).toEqual([
      "2026-03-01T00:00:00.000Z..2026-06-01T00:00:00.000Z",
      "2026-09-11T00:00:00.000Z..2026-09-15T00:00:00.000Z",
    ]);
  });
});

describe("planFetchWindows — overlap", () => {
  it("re-fetches exactly overlapDays before the covered edge", () => {
    const coverage: Coverage = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-14T12:00:00.000Z") };
    expect(show(planFetchWindows(coverage, requested, 5))).toEqual([
      "2026-09-09T12:00:00.000Z..2026-09-15T00:00:00.000Z",
    ]);
  });

  it("never reaches back past the start of coverage", () => {
    // Only three days are covered, but the overlap is ten — clamp to coverage.since
    // rather than inventing a window the cache was never asked about.
    const coverage: Coverage = { since: d("2026-09-10T00:00:00.000Z"), until: d("2026-09-13T00:00:00.000Z") };
    expect(show(planFetchWindows(coverage, requested, 10))).toEqual([
      "2026-03-01T00:00:00.000Z..2026-09-10T00:00:00.000Z",
      "2026-09-10T00:00:00.000Z..2026-09-15T00:00:00.000Z",
    ]);
  });

  it("starts the forward gap exactly at the covered edge when overlap is 0", () => {
    const coverage: Coverage = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-13T00:00:00.000Z") };
    expect(show(planFetchWindows(coverage, requested, 0))).toEqual([
      "2026-09-13T00:00:00.000Z..2026-09-15T00:00:00.000Z",
    ]);
  });

  it("treats a negative overlap as zero instead of skipping forward", () => {
    const coverage: Coverage = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-13T00:00:00.000Z") };
    expect(show(planFetchWindows(coverage, requested, -3))).toEqual([
      "2026-09-13T00:00:00.000Z..2026-09-15T00:00:00.000Z",
    ]);
  });
});

describe("planFetchWindows — boundaries", () => {
  it("emits no forward gap when the request ends exactly at the covered edge", () => {
    const coverage: Coverage = { since: d("2026-03-01T00:00:00.000Z"), until: requested.until };
    expect(planFetchWindows(coverage, requested, 2)).toEqual([]);
  });

  it("emits no back gap when the request starts exactly at the covered start", () => {
    const coverage: Coverage = { since: requested.since, until: d("2026-09-13T00:00:00.000Z") };
    expect(show(planFetchWindows(coverage, requested, 2))).toEqual([
      "2026-09-11T00:00:00.000Z..2026-09-15T00:00:00.000Z",
    ]);
  });

  it("ignores a request that ends before what is already covered", () => {
    // `--until` in the past must not shrink or re-fetch accumulated history.
    const coverage: Coverage = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-15T00:00:00.000Z") };
    const past: Window = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-05-01T00:00:00.000Z") };
    expect(planFetchWindows(coverage, past, 2)).toEqual([]);
  });

  it("does not mutate the inputs it was handed", () => {
    const coverage: Coverage = { since: d("2026-06-01T00:00:00.000Z"), until: d("2026-09-13T00:00:00.000Z") };
    planFetchWindows(coverage, requested, 2);
    expect(coverage.since.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(coverage.until.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    expect(requested.since.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});
