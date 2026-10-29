/**
 * The single extension point (PRD §5). A connector ONLY fetches + normalizes;
 * it contains no metric math (invariant #2). GitHub ships in v1; Bitbucket/JIRA
 * must be addable later with zero changes to the UI or the metrics.
 */

import type { Member, TeamConfig } from "../../shared/schema/config";
import type { Comment, Commit, PrGroup, RepoRef, SourceId } from "../../shared/types";

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

/** A pull request with the commits it owns — see {@link PrGroup}. */
export type CollectedPr = PrGroup;

/**
 * The entities a collection produced. Kept separate from {@link CollectResult}
 * so a replay of already-cached entities can be described honestly, without
 * having to claim a `complete` fetch that never happened.
 */
export interface CollectedEntities {
  prs: CollectedPr[];
  /** Commits owned by no pull request. GitHub sources every commit from a PR. */
  commits: Commit[];
  comments: Comment[];
  /** Union of discovered + explicit repos. */
  repos: RepoRef[];
}

export interface CollectResult extends CollectedEntities {
  /**
   * False when any part of the requested window could not be fetched — a failed
   * search is warned and skipped rather than made fatal, so the entities that
   * did arrive are still usable. A caller that caches results must not record
   * an incomplete window as covered, or the missing slice is never retried.
   */
  complete: boolean;
}

/**
 * One {@link CollectResult} per member, keyed by the handle this source knows
 * them by. Results are per member so each can be cached under its own coverage,
 * however the connector chose to batch the requests behind them.
 */
export type CollectByHandle = Map<string, CollectResult>;

export interface SourceConnector {
  readonly id: SourceId;
  /** True if this member has a handle this connector can use. */
  supportsMember(member: Member): boolean;
  /**
   * Fetch + normalize all contributions in [since, until) for the members/repos.
   * Every supported member gets an entry, even one with no activity.
   */
  collect(ctx: CollectContext): Promise<CollectByHandle>;
}
