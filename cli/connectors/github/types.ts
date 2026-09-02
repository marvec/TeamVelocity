/**
 * Raw GitHub API shapes (as returned by the GraphQL/REST calls) and the
 * `GitHubClient` seam. The connector depends only on `GitHubClient`, so tests
 * drive it with recorded fixtures and no live network (PRD §11).
 */

import type { RepoRef } from "../../../shared/types";

export interface GhRepository {
  name: string;
  url: string;
  owner: { login: string };
}

/** A pull request node from the GraphQL `search` query (author search). */
export interface GhPullRequestNode {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: { login: string; url: string } | null;
  repository: GhRepository;
  commits: { totalCount: number };
  comments: { totalCount: number };
  reviews: { totalCount: number };
  reviewThreads: { totalCount: number };
  participants: { totalCount: number; nodes: Array<{ login: string }> };
  closingIssuesReferences: { totalCount: number };
}

/** A lighter PR node from the `reviewed-by` search (review activity). */
export interface GhReviewedPrNode {
  number: number;
  url: string;
  updatedAt: string;
  repository: GhRepository;
}

/** A commit (REST list + single-commit stats). */
export interface GhCommit {
  sha: string;
  authorLogin: string | null;
  committedDate: string;
  additions: number;
  deletions: number;
  url: string;
  repo: { owner: string; name: string; url: string };
}

/**
 * The narrow surface the connector needs. The real implementation
 * (`octokit-client.ts`) talks to GitHub; tests provide a fake backed by
 * fixtures.
 */
export interface GitHubClient {
  /** PRs authored by `handle`, created within [since, until). */
  searchPrsByAuthor(handle: string, since: Date, until: Date): Promise<GhPullRequestNode[]>;
  /** PRs `handle` reviewed, updated within [since, until). */
  searchPrsReviewedBy(handle: string, since: Date, until: Date): Promise<GhReviewedPrNode[]>;
  /** Commits authored by `handle` in `repo` within [since, until). */
  listCommits(repo: RepoRef, handle: string, since: Date, until: Date): Promise<GhCommit[]>;
}
