/**
 * The single extension point (PRD §5). A connector ONLY fetches + normalizes;
 * it contains no metric math (invariant #2). GitHub ships in v1; Bitbucket/JIRA
 * must be addable later with zero changes to the UI or the metrics.
 */

import type { Member, TeamConfig } from "../../shared/schema/config";
import type { Comment, Commit, PullRequest, RepoRef, SourceId } from "../../shared/types";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface CollectContext {
  team: TeamConfig;
  members: Member[];
  since: Date;
  until: Date;
  explicitRepos: RepoRef[];
  logger: Logger;
}

/**
 * A pull request together with the commits it owns. Grouping them is what lets
 * the pull cache replace a PR's commit set as a unit: a rebased or force-pushed
 * PR would otherwise accumulate the SHAs of every rewritten version and
 * permanently inflate velocity's commit signal.
 *
 * Each group carries its PR's OWN complete commit list — a SHA riding two PRs
 * appears in both. De-duplication by SHA happens when caches are flattened for
 * aggregation, so a group never depends on the order PRs were fetched in.
 */
export interface CollectedPr {
  pr: PullRequest;
  commits: Commit[];
}

export interface CollectResult {
  prs: CollectedPr[];
  /** Commits owned by no pull request. GitHub sources every commit from a PR. */
  commits: Commit[];
  comments: Comment[];
  /** Union of discovered + explicit repos. */
  repos: RepoRef[];
  /**
   * False when any part of the requested window could not be fetched — a failed
   * search is warned and skipped rather than made fatal, so the entities that
   * did arrive are still usable. A caller that caches results must not record
   * an incomplete window as covered, or the missing slice is never retried.
   */
  complete: boolean;
}

export interface SourceConnector {
  readonly id: SourceId;
  /** True if this member has a handle this connector can use. */
  supportsMember(member: Member): boolean;
  /** Fetch + normalize all contributions in [since, until) for the members/repos. */
  collect(ctx: CollectContext): Promise<CollectResult>;
}
