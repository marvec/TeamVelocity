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

export interface CollectResult {
  pullRequests: PullRequest[];
  commits: Commit[];
  comments: Comment[];
  /** Union of discovered + explicit repos. */
  repos: RepoRef[];
}

export interface SourceConnector {
  readonly id: SourceId;
  /** True if this member has a handle this connector can use. */
  supportsMember(member: Member): boolean;
  /** Fetch + normalize all contributions in [since, until) for the members/repos. */
  collect(ctx: CollectContext): Promise<CollectResult>;
}
