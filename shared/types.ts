/**
 * Shared, source-agnostic domain types.
 *
 * These describe the **normalized, in-memory** entities produced by source
 * connectors (§6.1 of docs/prd.md) plus the value types used across the
 * aggregation library. They are pure TypeScript with no runtime dependencies,
 * so they are safe to import from `cli/`, `shared/`, and `src/` alike.
 *
 * The **on-disk** JSON contract (public/data/*) and the **config** file are
 * defined with Zod in `shared/schema/` and their types are derived via
 * `z.infer`; this file holds only the connector-facing domain model and the
 * primitives (Totals, VelocityBand, weights) that the aggregation math needs.
 */

/** Identifier of a data source / connector. GitHub ships in v1. */
export type SourceId = "github" | "bitbucket" | "jira";

/** Lifecycle state of a pull request. `closed` == closed WITHOUT merging. */
export type PrState = "open" | "merged" | "closed";

/** Kind of comment activity attributed to a member. */
export type CommentKind = "issue" | "review" | "review_summary";

/** Velocity color band. */
export type VelocityBand = "red" | "yellow" | "green";

/** A repository reference, source-tagged. */
export interface RepoRef {
  source: SourceId;
  owner: string;
  name: string;
  url: string;
}

/** Stable key for a repo, used for de-duplication and map lookups. */
export function repoKey(repo: Pick<RepoRef, "source" | "owner" | "name">): string {
  return `${repo.source}:${repo.owner}/${repo.name}`;
}

/**
 * Stable key for a pull request. This is the single definition on purpose: the
 * pull cache **persists** these keys, so a second implementation that drifted
 * would silently orphan every PR already stored under the old spelling.
 */
export function prKey(repo: Pick<RepoRef, "source" | "owner" | "name">, number: number): string {
  return `${repoKey(repo)}#${String(number)}`;
}

/**
 * A normalized pull request. Dates are `Date` objects in memory; the on-disk
 * contract serializes them to ISO strings.
 */
export interface PullRequest {
  source: SourceId;
  repo: RepoRef;
  number: number;
  title: string;
  authorHandle: string;
  state: PrState;
  createdAt: Date;
  mergedAt?: Date;
  closedAt?: Date;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  /** Count of review-thread comments (line comments on the diff). */
  reviewCommentsCount: number;
  /** Count of top-level issue-style comments on the PR conversation. */
  issueCommentsCount: number;
  /** Count of submitted reviews (approve / request-changes / comment). */
  reviewsCount: number;
  /** Distinct handles that participated (author, reviewers, commenters). */
  participants: string[];
  /** Count of linked/closing issues. */
  linkedIssues: number;
  url: string;
}

/** A normalized commit. */
export interface Commit {
  source: SourceId;
  repo: RepoRef;
  sha: string;
  authorHandle: string;
  committedAt: Date;
  additions: number;
  deletions: number;
  url: string;
}

/**
 * A pull request together with the commits it owns.
 *
 * Grouping them is what lets the pull cache replace a PR's commit set as a
 * unit: a rebased or force-pushed PR would otherwise accumulate the SHAs of
 * every rewritten version and permanently inflate velocity's commit signal.
 *
 * Each group carries its PR's OWN complete commit list — a SHA riding two PRs
 * appears in both — so a group never depends on the order PRs were fetched in.
 * De-duplication by SHA happens when groups are flattened for aggregation.
 */
export interface PrGroup {
  pr: PullRequest;
  commits: Commit[];
}

/** A normalized comment attributed to a member. */
export interface Comment {
  source: SourceId;
  repo: RepoRef;
  kind: CommentKind;
  authorHandle: string;
  createdAt: Date;
  /** PR number the comment belongs to, when applicable. */
  prNumber?: number;
  url: string;
}

/**
 * The five contribution categories plus split LOC, aggregated for a week.
 * This is the shared shape carried through the on-disk contract (as a Zod
 * schema) and computed by the aggregation library.
 */
export interface Totals {
  prsOpened: number;
  prsMerged: number;
  prsClosed: number;
  commits: number;
  comments: number;
  locAdded: number;
  locRemoved: number;
}

/** Zeroed totals — the additive identity used when folding contributions. */
export function emptyTotals(): Totals {
  return {
    prsOpened: 0,
    prsMerged: 0,
    prsClosed: 0,
    commits: 0,
    comments: 0,
    locAdded: 0,
    locRemoved: 0,
  };
}

/** Add `b` into `a` in place and return `a`. */
export function addTotals(a: Totals, b: Totals): Totals {
  a.prsOpened += b.prsOpened;
  a.prsMerged += b.prsMerged;
  a.prsClosed += b.prsClosed;
  a.commits += b.commits;
  a.comments += b.comments;
  a.locAdded += b.locAdded;
  a.locRemoved += b.locRemoved;
  return a;
}

/**
 * Weights for the team-velocity raw signal (§7.1). Overridable per team via
 * `velocityWeights` in the config; defaults live in `shared/aggregate/velocity.ts`.
 */
export interface VelocityWeights {
  wPR: number;
  wReview: number;
  wCommit: number;
  wOpen: number;
  wLoc: number;
}

/**
 * Weights for the PR relevance score (§7.2). Overridable per team via
 * `prScoreWeights`; defaults live in `shared/aggregate/pr-score.ts`.
 */
export interface PrScoreWeights {
  loc: number;
  reviewActivity: number;
  participants: number;
  files: number;
  commits: number;
  linkedIssues: number;
}
