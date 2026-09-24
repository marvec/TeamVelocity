/**
 * Raw GitHub API shapes (as returned by the GraphQL/REST calls) and the
 * `GitHubClient` seam. The connector depends only on `GitHubClient`, so tests
 * drive it with recorded fixtures and no live network (PRD §11).
 */

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
  commits: { totalCount: number; nodes: Array<{ commit: GhCommitNode }> };
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

/** A commit node from a pull request's `commits` connection (GraphQL). */
export interface GhCommitNode {
  oid: string;
  committedDate: string;
  url: string;
}

/**
 * The narrow surface the connector needs. The real implementation
 * (`octokit-client.ts`) talks to GitHub; tests provide a fake backed by
 * fixtures.
 */
export interface GitHubClient {
  /** PRs authored by `handle`, updated within [since, until). */
  searchPrsByAuthor(handle: string, since: Date, until: Date): Promise<GhPullRequestNode[]>;
  /** PRs `handle` reviewed, updated within [since, until). */
  searchPrsReviewedBy(handle: string, since: Date, until: Date): Promise<GhReviewedPrNode[]>;
  /**
   * GraphQL rate-limit points spent since the client was created, and the
   * budget left after the last call (`null` until a response reports one).
   * Making the saving measurable is the point of incremental pulls.
   */
  usage(): { cost: number; remaining: number | null };
}
