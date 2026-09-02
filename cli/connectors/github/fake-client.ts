/**
 * A fixture-backed {@link GitHubClient}. Used by connector tests (no live
 * network, PRD §11) and by the `bun run pull --dry-run` path so the whole
 * pipeline runs without a token.
 */

import type { RepoRef } from "../../../shared/types";
import { repoKey } from "../../../shared/types";
import type { GhCommit, GhPullRequestNode, GhReviewedPrNode, GitHubClient } from "./types";

export interface GitHubFixtures {
  authored: Record<string, GhPullRequestNode[]>;
  reviewed: Record<string, GhReviewedPrNode[]>;
  /** Keyed by `${repoKey}|${handle}`. */
  commits: Record<string, GhCommit[]>;
}

export function createFakeGitHubClient(fixtures: GitHubFixtures): GitHubClient {
  return {
    searchPrsByAuthor(handle: string): Promise<GhPullRequestNode[]> {
      return Promise.resolve(fixtures.authored[handle] ?? []);
    },
    searchPrsReviewedBy(handle: string): Promise<GhReviewedPrNode[]> {
      return Promise.resolve(fixtures.reviewed[handle] ?? []);
    },
    listCommits(repo: RepoRef, handle: string): Promise<GhCommit[]> {
      return Promise.resolve(fixtures.commits[`${repoKey(repo)}|${handle}`] ?? []);
    },
  };
}
