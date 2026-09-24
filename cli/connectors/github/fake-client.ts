/**
 * A fixture-backed {@link GitHubClient}. Used by connector tests (no live
 * network, PRD §11) and by the `bun run pull --dry-run` path so the whole
 * pipeline runs without a token.
 */

import type { GhPullRequestNode, GhReviewedPrNode, GitHubClient, SearchOutcome } from "./types";

export interface GitHubFixtures {
  authored: Record<string, GhPullRequestNode[]>;
  reviewed: Record<string, GhReviewedPrNode[]>;
}

export function createFakeGitHubClient(fixtures: GitHubFixtures): GitHubClient {
  return {
    searchPrsByAuthor(handle: string): Promise<SearchOutcome<GhPullRequestNode>> {
      return Promise.resolve({ nodes: fixtures.authored[handle] ?? [], truncated: false });
    },
    searchPrsReviewedBy(handle: string): Promise<SearchOutcome<GhReviewedPrNode>> {
      return Promise.resolve({ nodes: fixtures.reviewed[handle] ?? [], truncated: false });
    },

    /** Fixtures cost nothing, so there is no rate-limit budget to report. */
    usage() {
      return { cost: 0, remaining: null };
    },
  };
}
