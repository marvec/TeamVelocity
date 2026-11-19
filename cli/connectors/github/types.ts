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
  /** GraphQL node id — stable across repo renames and transfers. */
  id?: string;
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
  /**
   * Who reviewed it. A search over several `reviewed-by:` handles cannot say
   * which of them matched, so this is how a batched result is credited to the
   * right member. `author` is null for a deleted account.
   */
  reviews: { totalCount: number; nodes: Array<{ author: { login: string } | null }> };
}

/** A commit node from a pull request's `commits` connection (GraphQL). */
export interface GhCommitNode {
  oid: string;
  committedDate: string;
  url: string;
}

/**
 * An issue or pull-request conversation comment from `User.issueComments`.
 * Inline code-review comments are a different type and never appear here.
 */
export interface GhIssueCommentNode {
  /** The comment's own URL (`…#issuecomment-…`). */
  url: string;
  createdAt: string;
  updatedAt: string;
  repository: GhRepository;
  /** The PR the comment is on; null when it is on an issue. */
  pullRequest: { number: number } | null;
}

/**
 * A member's comments within a window, or word that the handle resolves to no
 * user (renamed or deleted). The two must stay apart: an empty list would let
 * the caller cache the window as covered for a handle that can never answer.
 * The connection is walked to `since`, never capped, so `truncated` is always
 * false — it is there so a found result reads like a {@link SearchOutcome}.
 */
export type IssueCommentsOutcome =
  | { status: "found"; nodes: GhIssueCommentNode[]; truncated: false }
  | { status: "userNotFound" };

/**
 * The narrow surface the connector needs. The real implementation
 * (`octokit-client.ts`) talks to GitHub; tests provide a fake backed by
 * fixtures.
 */
/**
 * A search's nodes plus whether GitHub's 1000-result ceiling cut it short.
 *
 * Truncation has to travel with the result: the caller caches a *coverage*
 * interval, and recording a truncated window as covered would mean the dropped
 * matches are never fetched again by any ordinary pull.
 */
export interface SearchOutcome<T> {
  nodes: T[];
  truncated: boolean;
}

export interface SearchOptions {
  /**
   * Give up after the first page when the search already reports more matches
   * than GitHub will return. The caller is about to split the batch and ask
   * again, so paging through a result it will throw away only spends points.
   */
  bailOnCap?: boolean;
}

export interface GitHubClient {
  /**
   * PRs authored by any of `handles`, updated within [since, until). One search,
   * so the handles must fit one query — see `batchHandles`.
   */
  searchPrsByAuthors(
    handles: string[],
    since: Date,
    until: Date,
    options?: SearchOptions,
  ): Promise<SearchOutcome<GhPullRequestNode>>;
  /** PRs any of `handles` reviewed, updated within [since, until). */
  searchPrsReviewedBy(
    handles: string[],
    since: Date,
    until: Date,
    options?: SearchOptions,
  ): Promise<SearchOutcome<GhReviewedPrNode>>;
  /**
   * Issue and PR conversation comments `handle` created within [since, until),
   * on any repository the token can see. Per user, so not batched.
   */
  listIssueCommentsBy(handle: string, since: Date, until: Date): Promise<IssueCommentsOutcome>;
  /**
   * GraphQL rate-limit points spent since the client was created, and the
   * budget left after the last call (`null` until a response reports one).
   * Making the saving measurable is the point of incremental pulls.
   */
  usage(): { cost: number; remaining: number | null };
}
