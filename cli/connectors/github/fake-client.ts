/**
 * A fixture-backed {@link GitHubClient}. Used by connector tests (no live
 * network, PRD §11) and by the `bun run pull --dry-run` path so the whole
 * pipeline runs without a token.
 */

import type {
  GhIssueCommentNode,
  GhPullRequestNode,
  GhReviewedPrNode,
  GitHubClient,
  IssueCommentsOutcome,
  SearchOutcome,
} from "./types";

/**
 * A reviewed PR as recorded under the handle that reviewed it. The reviewer
 * list a live search returns is derived from that key, so fixtures need not
 * repeat it.
 */
export type GhReviewedFixture = Omit<GhReviewedPrNode, "reviews">;

export interface GitHubFixtures {
  authored: Record<string, GhPullRequestNode[]>;
  reviewed: Record<string, GhReviewedFixture[]>;
  /** Issue/PR conversation comments by handle. Optional: older fixture sets have none. */
  commented?: Record<string, GhIssueCommentNode[]>;
}

export function createFakeGitHubClient(fixtures: GitHubFixtures): GitHubClient {
  return {
    searchPrsByAuthors(handles: string[]): Promise<SearchOutcome<GhPullRequestNode>> {
      const nodes = handles.flatMap((h) => fixtures.authored[h] ?? []);
      return Promise.resolve({ nodes, truncated: false });
    },

    /** Like live search, a PR several of `handles` reviewed comes back once, listing each of them. */
    searchPrsReviewedBy(handles: string[]): Promise<SearchOutcome<GhReviewedPrNode>> {
      const byUrl = new Map<string, GhReviewedPrNode>();
      for (const handle of handles) {
        for (const fixture of fixtures.reviewed[handle] ?? []) {
          const node = byUrl.get(fixture.url) ?? { ...fixture, reviews: { totalCount: 0, nodes: [] } };
          node.reviews.nodes.push({ author: { login: handle } });
          node.reviews.totalCount += 1;
          byUrl.set(fixture.url, node);
        }
      }
      return Promise.resolve({ nodes: [...byUrl.values()], truncated: false });
    },

    /**
     * The same [since, until) window on `createdAt` the live client applies. A
     * handle missing from the fixtures has simply commented nowhere.
     */
    listIssueCommentsBy(handle: string, since: Date, until: Date): Promise<IssueCommentsOutcome> {
      const nodes = (fixtures.commented?.[handle] ?? []).filter((n) => {
        const created = Date.parse(n.createdAt);
        return created >= since.getTime() && created < until.getTime();
      });
      return Promise.resolve({ status: "found", nodes });
    },

    /** Fixtures cost nothing, so there is no rate-limit budget to report. */
    usage() {
      return { cost: 0, remaining: null };
    },
  };
}
