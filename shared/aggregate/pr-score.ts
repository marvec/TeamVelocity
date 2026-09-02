/**
 * PR relevance score (§7.2 of docs/prd.md) — pure, no I/O.
 *
 * Answers "which PRs are worth putting in the status report?" Each PR's signals
 * are log-dampened, then **min-max normalized within the selected week's PR
 * set** (so the score is relative to that week), then weighted. The score is
 * 0–100. The per-signal weighted contributions (`breakdown`) sum to the score
 * and drive the per-PR stacked-bar chart.
 */

import type { PrScoreWeights } from "../types";

/** Raw per-PR signal counts consumed by the scorer. */
export interface PrScoreInput {
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewCommentsCount: number;
  issueCommentsCount: number;
  reviewsCount: number;
  /** Number of distinct participants. */
  participants: number;
  commits: number;
  linkedIssues: number;
}

/** Per-signal weighted contribution to the score; the six values sum to `score`. */
export interface PrScoreBreakdown {
  loc: number;
  reviewActivity: number;
  participants: number;
  files: number;
  commits: number;
  linkedIssues: number;
}

export interface PrScore {
  score: number;
  breakdown: PrScoreBreakdown;
}

export const DEFAULT_PR_SCORE_WEIGHTS: PrScoreWeights = {
  loc: 0.25,
  reviewActivity: 0.25,
  participants: 0.2,
  files: 0.15,
  commits: 0.1,
  linkedIssues: 0.05,
};

/** The six signal keys, in stable order. */
const SIGNAL_KEYS = [
  "loc",
  "reviewActivity",
  "participants",
  "files",
  "commits",
  "linkedIssues",
] as const;
type SignalKey = (typeof SIGNAL_KEYS)[number];

function log1p(n: number): number {
  return Math.log1p(Math.max(0, n));
}

/** Log-dampened raw signals for one PR (before cross-set normalization). */
function rawSignals(pr: PrScoreInput): Record<SignalKey, number> {
  return {
    loc: log1p(pr.additions + pr.deletions),
    files: log1p(pr.changedFiles),
    reviewActivity: log1p(pr.reviewCommentsCount + pr.issueCommentsCount + pr.reviewsCount),
    participants: log1p(pr.participants),
    commits: log1p(pr.commits),
    linkedIssues: log1p(pr.linkedIssues),
  };
}

/**
 * Min-max normalize a raw value within [min, max]. When the range is degenerate
 * (a single PR, or all PRs equal on this signal), a non-zero shared value maps
 * to 1 (all equally relevant on that signal) and an all-zero signal maps to 0.
 */
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return max > 0 ? 1 : 0;
  return (value - min) / (max - min);
}

/**
 * Score every PR in the set, returning results in the same order. Scores are
 * relative to this exact set (typically one week's PRs).
 */
export function scorePullRequests(
  prs: readonly PrScoreInput[],
  weights: PrScoreWeights = DEFAULT_PR_SCORE_WEIGHTS,
): PrScore[] {
  if (prs.length === 0) return [];

  const raw = prs.map(rawSignals);

  // Per-signal min/max across the set.
  const mins = {} as Record<SignalKey, number>;
  const maxs = {} as Record<SignalKey, number>;
  for (const key of SIGNAL_KEYS) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of raw) {
      if (r[key] < lo) lo = r[key];
      if (r[key] > hi) hi = r[key];
    }
    mins[key] = lo;
    maxs[key] = hi;
  }

  const weightSum =
    weights.loc +
    weights.reviewActivity +
    weights.participants +
    weights.files +
    weights.commits +
    weights.linkedIssues;
  // Guard against an all-zero weight config.
  const safeWeightSum = weightSum > 0 ? weightSum : 1;

  return raw.map((r) => {
    const breakdown: PrScoreBreakdown = {
      loc: (100 * weights.loc * normalize(r.loc, mins.loc, maxs.loc)) / safeWeightSum,
      reviewActivity:
        (100 * weights.reviewActivity * normalize(r.reviewActivity, mins.reviewActivity, maxs.reviewActivity)) /
        safeWeightSum,
      participants:
        (100 * weights.participants * normalize(r.participants, mins.participants, maxs.participants)) /
        safeWeightSum,
      files: (100 * weights.files * normalize(r.files, mins.files, maxs.files)) / safeWeightSum,
      commits: (100 * weights.commits * normalize(r.commits, mins.commits, maxs.commits)) / safeWeightSum,
      linkedIssues:
        (100 * weights.linkedIssues * normalize(r.linkedIssues, mins.linkedIssues, maxs.linkedIssues)) /
        safeWeightSum,
    };
    const score =
      breakdown.loc +
      breakdown.reviewActivity +
      breakdown.participants +
      breakdown.files +
      breakdown.commits +
      breakdown.linkedIssues;
    return { score, breakdown };
  });
}
