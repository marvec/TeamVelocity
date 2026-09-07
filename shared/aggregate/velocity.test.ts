import { describe, it, expect } from "vitest";
import {
  rawWeeklySignal,
  computeVelocitySeries,
  velocityBand,
  velocityContribution,
  contributionSum,
  rangeVelocity,
  median,
  mad,
  DEFAULT_VELOCITY_WEIGHTS,
  type VelocityInput,
} from "./velocity";
import sparseRepoWeeks from "./__fixtures__/sparse-repo-weeks.json";

const ZERO: VelocityInput = {
  mergedPRs: 0,
  prsOpened: 0,
  reviewActivity: 0,
  commits: 0,
  locChanged: 0,
};

describe("rawWeeklySignal", () => {
  it("is 0 for a week with no activity", () => {
    expect(rawWeeklySignal(ZERO)).toBe(0);
  });

  it("applies log1p dampening (a huge burst can't dominate linearly)", () => {
    const one = rawWeeklySignal({ ...ZERO, mergedPRs: 1 }, DEFAULT_VELOCITY_WEIGHTS);
    const hundred = rawWeeklySignal({ ...ZERO, mergedPRs: 100 }, DEFAULT_VELOCITY_WEIGHTS);
    expect(hundred).toBeGreaterThan(one);
    // 100x the PRs is far less than 100x the signal — log dampening.
    expect(hundred).toBeLessThan(one * 100);
  });

  it("uses ln via log1p: log1p(e-1) == 1", () => {
    const raw = rawWeeklySignal(
      { ...ZERO, mergedPRs: Math.E - 1 },
      { wPR: 1, wReview: 0, wCommit: 0, wOpen: 0, wLoc: 0 },
    );
    expect(raw).toBeCloseTo(1, 10);
  });

  it("weights each signal (default review weight 0.7)", () => {
    const raw = rawWeeklySignal(
      { ...ZERO, reviewActivity: Math.E - 1 },
      DEFAULT_VELOCITY_WEIGHTS,
    );
    expect(raw).toBeCloseTo(0.7, 10);
  });

  it("is monotonic non-decreasing in every signal", () => {
    const base = rawWeeklySignal({ mergedPRs: 1, prsOpened: 1, reviewActivity: 1, commits: 1, locChanged: 1 });
    const more = rawWeeklySignal({ mergedPRs: 2, prsOpened: 1, reviewActivity: 1, commits: 1, locChanged: 1 });
    expect(more).toBeGreaterThan(base);
  });
});

describe("velocityContribution", () => {
  const totals = {
    prsMerged: 3,
    prsOpened: 2,
    commits: 6,
    comments: 4,
    locAdded: 300,
    locRemoved: 100,
  };

  it("its five parts sum to the raw weekly signal (comments ↔ review, LOC combined)", () => {
    const parts = velocityContribution(totals, DEFAULT_VELOCITY_WEIGHTS);
    const raw = rawWeeklySignal(
      {
        mergedPRs: totals.prsMerged,
        prsOpened: totals.prsOpened,
        reviewActivity: totals.comments,
        commits: totals.commits,
        locChanged: totals.locAdded + totals.locRemoved,
      },
      DEFAULT_VELOCITY_WEIGHTS,
    );
    expect(contributionSum(parts)).toBeCloseTo(raw, 10);
  });

  it("splits the single LOC term by the add/remove ratio", () => {
    const parts = velocityContribution(totals);
    // 300:100 added:removed → locAdd is 3× locRem, and together they are the LOC term.
    expect(parts.locAdd).toBeCloseTo(parts.locRem * 3, 10);
  });

  it("is all zeros for an empty bucket (no division by zero on LOC split)", () => {
    const parts = velocityContribution({
      prsMerged: 0,
      prsOpened: 0,
      commits: 0,
      comments: 0,
      locAdded: 0,
      locRemoved: 0,
    });
    expect(contributionSum(parts)).toBe(0);
    expect(parts.locAdd).toBe(0);
    expect(parts.locRem).toBe(0);
  });
});

describe("median / mad", () => {
  it("median of odd and even sets", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("mad of a constant set is 0", () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });
  it("mad of a spread set is positive", () => {
    expect(mad([1, 2, 3, 4, 5])).toBeGreaterThan(0);
  });
});

describe("computeVelocitySeries — cold start / warming up", () => {
  it("flags the first weeks (fewer than 4 weeks of history) as warming up", () => {
    const series = computeVelocitySeries([1, 2, 3, 4, 5, 6]);
    expect(series.map((w) => w.warmingUp)).toEqual([true, true, true, false, false, false]);
  });

  it("respects a custom stableAfterWeeks", () => {
    const series = computeVelocitySeries([1, 2, 3], { stableAfterWeeks: 2 });
    expect(series.map((w) => w.warmingUp)).toEqual([true, false, false]);
  });
});

describe("computeVelocitySeries — trailing baseline window", () => {
  it("ignores weeks older than the window (default 12): the last week's score is unaffected by the distant prefix", () => {
    // Two series sharing the last 12 weeks but differing >12 weeks back. If the
    // baseline is a trailing window, the last week's velocity must be identical.
    const tail = [4, 6, 5, 4, 6, 5, 4, 6, 5, 4, 6, 5]; // 12 varied weeks
    const calmStart = computeVelocitySeries([1, 1, 1, ...tail]);
    const spikeStart = computeVelocitySeries([100, 100, 100, ...tail]);
    expect(calmStart[calmStart.length - 1].velocity).toBeCloseTo(
      spikeStart[spikeStart.length - 1].velocity,
      10,
    );
  });

  it("honors a custom window size", () => {
    const tail = [4, 6, 5, 4, 6]; // 5 weeks
    const a = computeVelocitySeries([1, 1, ...tail], { windowWeeks: 5 });
    const b = computeVelocitySeries([100, 100, ...tail], { windowWeeks: 5 });
    expect(a[a.length - 1].velocity).toBeCloseTo(b[b.length - 1].velocity, 10);
  });
});

describe("computeVelocitySeries — a median week lands near 50", () => {
  it("scores ~50 when the current raw equals the trailing median", () => {
    // window sorted [2,4,6,6,8,10] -> median 6; current raw is 6.
    const series = computeVelocitySeries([2, 4, 6, 8, 10, 6]);
    expect(series[5].velocity).toBeCloseTo(50, 6);
  });
});

describe("computeVelocitySeries — stronger week up, quiet week down", () => {
  it("a stronger-than-usual week trends above 50", () => {
    const series = computeVelocitySeries([2, 4, 6, 8, 10, 12]);
    expect(series[5].velocity).toBeGreaterThan(50);
  });

  it("a quiet / PTO week trends below 50 and can be red", () => {
    const series = computeVelocitySeries([6, 6, 6, 6, 6, 0]);
    expect(series[5].velocity).toBeLessThan(50);
  });

  it("orders a strong week above a median week above a quiet week", () => {
    const base = [4, 5, 6, 5, 4]; // established baseline around 5
    const strong = computeVelocitySeries([...base, 12])[5].velocity;
    const medianish = computeVelocitySeries([...base, 5])[5].velocity;
    const quiet = computeVelocitySeries([...base, 0])[5].velocity;
    expect(strong).toBeGreaterThan(medianish);
    expect(medianish).toBeGreaterThan(quiet);
  });
});

describe("computeVelocitySeries — MAD ≈ 0 fallback", () => {
  it("returns a finite 50 when history is perfectly constant", () => {
    const series = computeVelocitySeries([5, 5, 5, 5, 5]);
    const last = series[4];
    expect(Number.isFinite(last.velocity)).toBe(true);
    expect(last.velocity).toBe(50);
  });

  it("does not produce NaN/Infinity when MAD is 0 but the current week differs", () => {
    const series = computeVelocitySeries([5, 5, 5, 9]);
    const last = series[3];
    expect(Number.isFinite(last.velocity)).toBe(true);
    expect(last.velocity).toBe(100); // clamped, not Infinity
  });
});

describe("computeVelocitySeries — clamping", () => {
  it("clamps at 100 for an extreme high week", () => {
    const series = computeVelocitySeries([1, 1, 1, 1, 1, 1000]);
    expect(series[5].velocity).toBe(100);
  });

  it("clamps at 0 for an extreme low week after high history", () => {
    const series = computeVelocitySeries([50, 60, 55, 58, 52, 0]);
    expect(series[5].velocity).toBe(0);
  });

  it("never leaves the 0..100 range", () => {
    const raws = [0, 100, 3, 77, 1, 42, 9, 88, 2, 63, 5, 30, 0, 120];
    for (const w of computeVelocitySeries(raws)) {
      expect(w.velocity).toBeGreaterThanOrEqual(0);
      expect(w.velocity).toBeLessThanOrEqual(100);
    }
  });
});

describe("velocityBand", () => {
  it("maps values to red/yellow/green at default thresholds", () => {
    expect(velocityBand(0)).toBe("red");
    expect(velocityBand(39.9)).toBe("red");
    expect(velocityBand(40)).toBe("yellow");
    expect(velocityBand(69.9)).toBe("yellow");
    expect(velocityBand(70)).toBe("green");
    expect(velocityBand(100)).toBe("green");
  });

  it("respects custom thresholds", () => {
    expect(velocityBand(50, { red: 60, green: 80 })).toBe("red");
    expect(velocityBand(70, { red: 60, green: 80 })).toBe("yellow");
    expect(velocityBand(90, { red: 60, green: 80 })).toBe("green");
  });
});

describe("rangeVelocity", () => {
  it("is the mean of per-week velocities", () => {
    expect(rangeVelocity([50, 70, 30])).toBeCloseTo(50, 10);
  });
  it("is 0 for an empty range", () => {
    expect(rangeVelocity([])).toBe(0);
  });
});

describe("computeVelocitySeries — active-weeks baseline (sparse series such as one repo's)", () => {
  // A repo touched in 2 of 12 weeks. With the default all-weeks baseline the
  // majority-idle window collapses median and MAD to 0, so every active week
  // is pegged at 100. The active baseline scores active weeks against each other.
  const sparse = [0, 0, 0, 1.2, 0, 0, 0, 0, 0, 0, 0, 2.5];

  it("the default all-weeks baseline pegs a majority-idle series at 100 (what repos must avoid)", () => {
    expect(computeVelocitySeries(sparse)[11].velocity).toBe(100);
  });

  it("scores an active week against the other active weeks, not the idle ones", () => {
    const series = computeVelocitySeries(sparse, { baseline: "active" });
    // Baseline for the last week = {1.2, 2.5}: median 1.85, MAD 0.65.
    // 50 + 20 · (2.5 − 1.85) / (1.4826 · 0.65) ≈ 63.5
    expect(series[11].velocity).toBeCloseTo(63.49, 1);
  });

  it("scores the first active week 50 — its only baseline is itself", () => {
    expect(computeVelocitySeries(sparse, { baseline: "active" })[3].velocity).toBe(50);
  });

  it("scores idle weeks 0", () => {
    const idle = computeVelocitySeries(sparse, { baseline: "active" }).filter((w) => w.raw === 0);
    expect(idle).toHaveLength(10);
    for (const w of idle) expect(w.velocity).toBe(0);
  });

  it("idle weeks do not enter the baseline: a sparse series scores like its compacted active series", () => {
    const compact = [3, 5, 4, 6, 2, 5];
    const spread = [0, 3, 0, 0, 5, 4, 0, 6, 0, 0, 0, 2, 5];
    const a = computeVelocitySeries(compact, { baseline: "active" }).map((w) => w.velocity);
    const b = computeVelocitySeries(spread, { baseline: "active" })
      .filter((w) => w.raw > 0)
      .map((w) => w.velocity);
    expect(b).toEqual(a);
  });

  it("reaches past idle weeks: an active week older than the calendar window still counts", () => {
    const twelveIdle = new Array<number>(12).fill(0);
    const afterBig = computeVelocitySeries([9, ...twelveIdle, 5], { baseline: "active" });
    const afterSmall = computeVelocitySeries([1, ...twelveIdle, 5], { baseline: "active" });
    expect(afterBig[13].velocity).toBeLessThan(50); // 5 sits below the {9, 5} median
    expect(afterSmall[13].velocity).toBeGreaterThan(50); // 5 sits above the {1, 5} median
  });

  it("keeps only the last `windowWeeks` active weeks in the baseline", () => {
    const tail = [4, 6, 5, 4, 6, 5, 4, 6, 5, 4, 6, 5]; // 12 active weeks
    const calm = computeVelocitySeries([1, 0, 1, 0, ...tail], { baseline: "active" });
    const spike = computeVelocitySeries([100, 0, 100, 0, ...tail], { baseline: "active" });
    expect(calm[calm.length - 1].velocity).toBeCloseTo(spike[spike.length - 1].velocity, 10);
  });

  it("warms up by active weeks, not calendar weeks", () => {
    const series = computeVelocitySeries([0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5], { baseline: "active" });
    // The 4th active week is index 9; everything before it (idle or not) is provisional.
    expect(series.map((w) => w.warmingUp)).toEqual([
      true, true, true, true, true, true, true, true, true, false, false, false,
    ]);
  });
});

describe("computeVelocitySeries — active baseline on real sparse repo series", () => {
  interface FixtureTotals {
    prsOpened: number;
    prsMerged: number;
    prsClosed: number;
    commits: number;
    comments: number;
    locAdded: number;
    locRemoved: number;
  }
  interface FixtureWeek {
    weekStart: string;
    totals: FixtureTotals | null;
  }
  const repoRaw = (t: FixtureTotals): number =>
    rawWeeklySignal({
      mergedPRs: t.prsMerged,
      prsOpened: t.prsOpened,
      reviewActivity: t.comments,
      commits: t.commits,
      locChanged: t.locAdded + t.locRemoved,
    });
  const rawsOf = (weeks: FixtureWeek[]): number[] => weeks.map((w) => (w.totals ? repoRaw(w.totals) : 0));
  const fixture = sparseRepoWeeks.repos as Record<string, FixtureWeek[]>;

  it("rsp-server (7 active of 27 weeks): the default baseline pegged every active week at 100", () => {
    const active = computeVelocitySeries(rawsOf(fixture["redhat-developer/rsp-server"])).filter((w) => w.raw > 0);
    expect(active).toHaveLength(7);
    expect(active.map((w) => w.velocity)).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });

  it("rsp-server: with the active baseline no week is pegged; the 3-PR/17-commit week is green and the lone-commit week is red", () => {
    const weeks = fixture["redhat-developer/rsp-server"];
    const series = computeVelocitySeries(rawsOf(weeks), { baseline: "active" });
    const active = series.filter((w) => w.raw > 0);
    for (const w of active) expect(w.velocity).toBeLessThan(100);
    const biggest = weeks.findIndex((w) => w.totals?.commits === 17);
    const loneCommit = weeks.findIndex((w) => w.totals?.commits === 1 && w.totals.prsMerged === 0);
    expect(series[biggest].band).toBe("green");
    expect(series[loneCommit].band).toBe("red");
  });

  it("javac-ls (10 active of 27 weeks): commit-only weeks after the PR-heavy weeks score below 50, none at 100", () => {
    const weeks = fixture["nb-javac-shaded/javac-ls"];
    const series = computeVelocitySeries(rawsOf(weeks), { baseline: "active" });
    const lastPrWeek = weeks.map((w) => w.totals?.prsMerged ?? 0).lastIndexOf(7);
    const commitOnlyAfter = series.filter((w, i) => i > lastPrWeek && w.raw > 0);
    expect(commitOnlyAfter.length).toBeGreaterThanOrEqual(5);
    for (const w of commitOnlyAfter) {
      expect(w.velocity).toBeLessThan(50);
      expect(w.velocity).toBeLessThan(100);
    }
    for (const w of series) expect(Number.isFinite(w.velocity)).toBe(true);
  });
});
