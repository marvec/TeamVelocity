/**
 * Team & per-member velocity (§7.1 of docs/prd.md) — pure, no I/O.
 *
 * Velocity is a *team-rhythm* indicator on a 0–100 scale, NOT a productivity
 * grade. It is relative and self-normalizing: each week's raw signal is scored
 * against the team's (or member's) own trailing baseline, so a typical week
 * lands near 50, a stronger week climbs toward 100, and a quiet/PTO week falls
 * toward 0 — automatically, because fewer contributions were made.
 */

import type { VelocityBand, VelocityWeights } from "../types";

/** Per-week signal inputs for the raw velocity signal. */
export interface VelocityInput {
  /** PRs merged in the week. */
  mergedPRs: number;
  /** PRs opened in the week. */
  prsOpened: number;
  /** Review activity by the member/team: reviews + review comments. */
  reviewActivity: number;
  /** Commits authored in the week. */
  commits: number;
  /** Lines added + removed attributed to the week. */
  locChanged: number;
}

export const DEFAULT_VELOCITY_WEIGHTS: VelocityWeights = {
  wPR: 1.0,
  wReview: 0.7,
  wCommit: 0.5,
  wOpen: 0.4,
  wLoc: 0.3,
};

export interface VelocityThresholds {
  /** Below this → red. Default 40. */
  red: number;
  /** Below this → yellow; at or above → green. Default 70. */
  green: number;
}

export const DEFAULT_THRESHOLDS: VelocityThresholds = { red: 40, green: 70 };

export interface VelocityOptions {
  /** Spread multiplier around the median. Default 20. */
  K?: number;
  /** Trailing baseline window in weeks (expands while less history exists). Default 12. */
  windowWeeks?: number;
  /** A week is "warming up" while fewer than this many weeks of history exist. Default 4. */
  stableAfterWeeks?: number;
  /** Scale floor used when MAD ≈ 0 (near-constant history). Default 1e-6. */
  epsilon?: number;
  thresholds?: VelocityThresholds;
}

export interface WeekVelocity {
  /** 0–100 velocity value (unrounded; callers round for display/storage). */
  velocity: number;
  band: VelocityBand;
  /** Provisional flag while history is too short to be meaningful. */
  warmingUp: boolean;
  /** The raw weekly signal this velocity was derived from (useful for debugging). */
  raw: number;
}

function log1p(n: number): number {
  // Guard against tiny negative inputs from float noise; signals are >= 0.
  return Math.log1p(Math.max(0, n));
}

/** Step 1: the log-dampened weighted raw weekly signal. */
export function rawWeeklySignal(
  input: VelocityInput,
  weights: VelocityWeights = DEFAULT_VELOCITY_WEIGHTS,
): number {
  return (
    weights.wPR * log1p(input.mergedPRs) +
    weights.wOpen * log1p(input.prsOpened) +
    weights.wReview * log1p(input.reviewActivity) +
    weights.wCommit * log1p(input.commits) +
    weights.wLoc * log1p(input.locChanged)
  );
}

/** Per-display-category contribution to the raw weekly signal. The five parts sum to `rawWeeklySignal`. */
export interface VelocityContribution {
  prs: number;
  commits: number;
  comments: number;
  locAdd: number;
  locRem: number;
}

/** Totals fields the contribution split reads (a superset-compatible shape with `Totals`). */
export interface VelocityContributionInput {
  prsMerged: number;
  prsOpened: number;
  commits: number;
  comments: number;
  locAdded: number;
  locRemoved: number;
}

/**
 * Split a totals bucket into each display category's contribution to the raw
 * velocity signal — `weight · log1p(count)`, exactly the terms of
 * `rawWeeklySignal`. The five parts SUM to that signal, so scaling them to a
 * stored velocity produces a stacked bar whose LENGTH is the velocity and whose
 * segments show what drove it (rather than raw contribution volume). LOC is one
 * combined term in the signal; it is split by the add/remove ratio for display.
 * The `comments` term stands in for the signal's review-activity weight.
 */
export function velocityContribution(
  t: VelocityContributionInput,
  weights: VelocityWeights = DEFAULT_VELOCITY_WEIGHTS,
): VelocityContribution {
  const locTotal = t.locAdded + t.locRemoved;
  const locPart = weights.wLoc * log1p(locTotal);
  const addShare = locTotal > 0 ? t.locAdded / locTotal : 0;
  return {
    prs: weights.wPR * log1p(t.prsMerged) + weights.wOpen * log1p(t.prsOpened),
    commits: weights.wCommit * log1p(t.commits),
    comments: weights.wReview * log1p(t.comments),
    locAdd: locPart * addShare,
    locRem: locPart * (1 - addShare),
  };
}

export function contributionSum(c: VelocityContribution): number {
  return c.prs + c.commits + c.comments + c.locAdd + c.locRem;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median absolute deviation. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Color band for a velocity value. */
export function velocityBand(
  velocity: number,
  thresholds: VelocityThresholds = DEFAULT_THRESHOLDS,
): VelocityBand {
  if (velocity < thresholds.red) return "red";
  if (velocity < thresholds.green) return "yellow";
  return "green";
}

/**
 * Step 2: normalize each week's raw signal against the trailing baseline of the
 * same series. Returns one entry per input week, in the same order.
 */
export function computeVelocitySeries(
  raws: readonly number[],
  opts: VelocityOptions = {},
): WeekVelocity[] {
  const K = opts.K ?? 20;
  const windowWeeks = opts.windowWeeks ?? 12;
  const stableAfterWeeks = opts.stableAfterWeeks ?? 4;
  const epsilon = opts.epsilon ?? 1e-6;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;

  return raws.map((raw, i) => {
    const start = Math.max(0, i - windowWeeks + 1);
    const window = raws.slice(start, i + 1);
    const m = median(window);
    const scale = Math.max(1.4826 * mad(window), epsilon);
    const velocity = clamp(50 + K * ((raw - m) / scale), 0, 100);
    return {
      velocity,
      band: velocityBand(velocity, thresholds),
      warmingUp: i + 1 < stableAfterWeeks,
      raw,
    };
  });
}

/** Velocity for a whole date range (no week selected): the mean of per-week velocities. */
export function rangeVelocity(velocities: readonly number[]): number {
  if (velocities.length === 0) return 0;
  return velocities.reduce((s, v) => s + v, 0) / velocities.length;
}
