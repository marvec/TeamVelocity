import { describe, it, expect } from "vitest";
import {
  scorePullRequests,
  DEFAULT_PR_SCORE_WEIGHTS,
  type PrScoreInput,
  type PrScore,
} from "./pr-score";
import type { PrScoreWeights } from "../types";

function pr(overrides: Partial<PrScoreInput> = {}): PrScoreInput {
  return {
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    reviewCommentsCount: 0,
    issueCommentsCount: 0,
    reviewsCount: 0,
    participants: 0,
    commits: 0,
    linkedIssues: 0,
    ...overrides,
  };
}

const FULLY_ACTIVE: PrScoreInput = {
  additions: 100,
  deletions: 100,
  changedFiles: 10,
  reviewCommentsCount: 5,
  issueCommentsCount: 3,
  reviewsCount: 2,
  participants: 4,
  commits: 6,
  linkedIssues: 1,
};

function breakdownSum(s: PrScore): number {
  const b = s.breakdown;
  return b.loc + b.reviewActivity + b.participants + b.files + b.commits + b.linkedIssues;
}

describe("scorePullRequests — degenerate sets", () => {
  it("returns [] for no PRs", () => {
    expect(scorePullRequests([])).toEqual([]);
  });

  it("a single active PR scores 100 (every signal normalizes to 1)", () => {
    const [only] = scorePullRequests([FULLY_ACTIVE]);
    expect(only.score).toBeCloseTo(100, 6);
  });

  it("a single all-zero PR scores 0", () => {
    const [only] = scorePullRequests([pr()]);
    expect(only.score).toBe(0);
  });

  it("all-equal PRs get equal scores (100 when non-zero)", () => {
    const [a, b] = scorePullRequests([FULLY_ACTIVE, { ...FULLY_ACTIVE }]);
    expect(a.score).toBeCloseTo(b.score, 10);
    expect(a.score).toBeCloseTo(100, 6);
  });
});

describe("scorePullRequests — ordering", () => {
  it("a strictly larger PR outscores a smaller one", () => {
    const big = FULLY_ACTIVE;
    const small = pr({ additions: 1, changedFiles: 1, participants: 1, commits: 1 });
    const [scoredBig, scoredSmall] = scorePullRequests([big, small]);
    expect(scoredBig.score).toBeGreaterThan(scoredSmall.score);
    expect(scoredBig.score).toBeCloseTo(100, 6); // big is max on every signal
  });

  it("ranks a realistic set by relevance", () => {
    const prs: PrScoreInput[] = [
      pr({ additions: 5, deletions: 2, changedFiles: 1, commits: 1, participants: 1 }), // tiny
      pr({
        additions: 400,
        deletions: 120,
        changedFiles: 18,
        reviewCommentsCount: 8,
        issueCommentsCount: 4,
        reviewsCount: 3,
        participants: 5,
        commits: 12,
        linkedIssues: 2,
      }), // major
      pr({ additions: 40, deletions: 10, changedFiles: 4, issueCommentsCount: 1, participants: 2, commits: 3 }), // medium
    ];
    const scores = scorePullRequests(prs).map((s) => s.score);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[0]);
  });
});

describe("scorePullRequests — normalization", () => {
  it("maps a mid PR to the middle when isolating one signal", () => {
    const weights: PrScoreWeights = {
      loc: 1,
      reviewActivity: 0,
      participants: 0,
      files: 0,
      commits: 0,
      linkedIssues: 0,
    };
    // loc signals via log1p(additions): 0, 1, 2  → min 0, max 2, mid normalizes to 0.5
    const prs: PrScoreInput[] = [
      pr({ additions: 0 }),
      pr({ additions: Math.E - 1 }),
      pr({ additions: Math.E * Math.E - 1 }),
    ];
    const [lo, mid, hi] = scorePullRequests(prs, weights).map((s) => s.score);
    expect(lo).toBeCloseTo(0, 6);
    expect(mid).toBeCloseTo(50, 6);
    expect(hi).toBeCloseTo(100, 6);
  });

  it("keeps every score within 0..100", () => {
    const prs: PrScoreInput[] = [
      FULLY_ACTIVE,
      pr(),
      pr({ additions: 20, participants: 2 }),
      pr({ reviewsCount: 1, issueCommentsCount: 9 }),
    ];
    for (const s of scorePullRequests(prs)) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("scorePullRequests — breakdown & weights", () => {
  it("the six breakdown contributions sum to the score", () => {
    const prs: PrScoreInput[] = [
      FULLY_ACTIVE,
      pr({ additions: 30, changedFiles: 2, participants: 2, commits: 2 }),
    ];
    for (const s of scorePullRequests(prs)) {
      expect(breakdownSum(s)).toBeCloseTo(s.score, 10);
    }
  });

  it("a zero-weighted signal contributes nothing", () => {
    const weights: PrScoreWeights = { ...DEFAULT_PR_SCORE_WEIGHTS, participants: 0 };
    const prs: PrScoreInput[] = [FULLY_ACTIVE, pr({ participants: 99 })];
    const scored = scorePullRequests(prs, weights);
    for (const s of scored) {
      expect(s.breakdown.participants).toBe(0);
    }
  });

  it("default weights favor LOC and review activity most", () => {
    expect(DEFAULT_PR_SCORE_WEIGHTS.loc).toBe(0.25);
    expect(DEFAULT_PR_SCORE_WEIGHTS.reviewActivity).toBe(0.25);
    expect(DEFAULT_PR_SCORE_WEIGHTS.linkedIssues).toBe(0.05);
  });
});
