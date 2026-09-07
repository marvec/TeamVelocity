import { describe, it, expect } from "vitest";
import { emptyTotals } from "../../shared/types";
import type { WeekSummary } from "../../shared/schema/data";
import type { Selection } from "./url-state";
import { bandBgClass, bandTextClass, formatLoc, toStackDatum, weeksInRange, LOC_SCALE } from "./format";

function wk(weekStart: string): WeekSummary {
  return {
    weekStart,
    weekEnd: weekStart,
    label: weekStart,
    velocity: 50,
    velocityBand: "yellow",
    warmingUp: false,
    totals: emptyTotals(),
    members: [],
  };
}

const WEEKS = ["2026-05-04", "2026-06-01", "2026-07-06", "2026-08-03", "2026-08-31"].map(wk);

function sel(partial: Partial<Selection>): Selection {
  return { range: "all", ...partial };
}

describe("weeksInRange", () => {
  it("returns everything for 'all'", () => {
    expect(weeksInRange(WEEKS, sel({ range: "all" }))).toHaveLength(5);
  });
  it("filters to the last month (anchored to the latest week)", () => {
    expect(weeksInRange(WEEKS, sel({ range: "1m" })).map((w) => w.weekStart)).toEqual([
      "2026-08-03",
      "2026-08-31",
    ]);
  });
  it("filters to the last 3 months", () => {
    expect(weeksInRange(WEEKS, sel({ range: "3m" })).map((w) => w.weekStart)).toEqual([
      "2026-06-01",
      "2026-07-06",
      "2026-08-03",
      "2026-08-31",
    ]);
  });
  it("honors a custom from/to window", () => {
    const out = weeksInRange(WEEKS, sel({ range: "custom", from: "2026-06-01", to: "2026-07-06" }));
    expect(out.map((w) => w.weekStart)).toEqual(["2026-06-01", "2026-07-06"]);
  });
  it("returns [] for no weeks", () => {
    expect(weeksInRange([], sel({ range: "all" }))).toEqual([]);
  });
});

describe("formatting helpers", () => {
  it("formats a LOC summary", () => {
    expect(formatLoc(112, 246)).toBe("358 LOC +112/−246");
  });
  it("maps bands to token classes (text uses the readable ink step)", () => {
    expect(bandTextClass("green")).toBe("text-band-green-ink");
    expect(bandTextClass("yellow")).toBe("text-band-yellow-ink");
    expect(bandBgClass("red")).toBe("bg-band-red");
  });
  it("scales LOC for stacked bars but keeps raw totals", () => {
    const totals = { ...emptyTotals(), prsMerged: 3, locAdded: 500, locRemoved: 200 };
    const d = toStackDatum(totals);
    expect(d.prs).toBe(3);
    expect(d.locAdd).toBe(500 / LOC_SCALE);
    expect(d.raw.locAdded).toBe(500);
  });
});
