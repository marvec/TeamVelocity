/**
 * Real GitHub client backed by Octokit (umbrella package: REST + GraphQL +
 * throttling + retry). This is the ONLY module that talks to GitHub or reads
 * the token; it lives under cli/ and is never imported by src/ (invariant #1).
 *
 * The GraphQL call itself is injectable ({@link createGitHubClientFromGraphql})
 * so query construction, pagination and rate-limit accounting are unit-tested
 * without a network or a token (PRD §11).
 */

import { Octokit } from "octokit";
import type { Logger } from "../types";
import type { GhPullRequestNode, GhReviewedPrNode, GitHubClient } from "./types";

/**
 * GitHub's `search` connection returns at most 1000 results, whatever the
 * pagination. Hitting it means results were silently dropped.
 * https://docs.github.com/en/graphql/reference/search
 */
const SEARCH_RESULT_CAP = 1000;

const PR_FIELDS = `
  number
  title
  state
  url
  createdAt
  updatedAt
  mergedAt
  closedAt
  additions
  deletions
  changedFiles
  author { login url }
  repository { name url owner { login } }
  commits(first: 100) { totalCount nodes { commit { oid committedDate url } } }
  comments { totalCount }
  reviews { totalCount }
  reviewThreads { totalCount }
  participants(first: 100) { totalCount nodes { login } }
  closingIssuesReferences { totalCount }
`;

const PR_SEARCH = `
query SearchPRs($q: String!, $cursor: String) {
  rateLimit { cost remaining }
  search(query: $q, type: ISSUE, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { __typename ... on PullRequest { ${PR_FIELDS} } }
  }
}`;

const REVIEWED_SEARCH = `
query SearchReviewed($q: String!, $cursor: String) {
  rateLimit { cost remaining }
  search(query: $q, type: ISSUE, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { __typename ... on PullRequest {
      number url updatedAt repository { name url owner { login } }
    } }
  }
}`;

interface SearchPage<T> {
  search: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<(T & { __typename: string }) | { __typename: string }>;
  };
  rateLimit?: { cost: number; remaining: number } | null;
}

/** The single GraphQL entry point the client needs. */
export type GraphqlFn = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;

/**
 * Both searches window on `updated:`, never `created:`. A `created:` window
 * cannot re-surface a pull request opened before it but merged inside it, so an
 * incremental delta would leave that PR's merge and LOC permanently unrecorded.
 * Sharing one qualifier is also what makes a single coverage interval per handle
 * a correct description of what has been fetched.
 */
function updatedWindow(since: Date, until: Date): string {
  return `updated:${since.toISOString()}..${until.toISOString()}`;
}

export function authorSearchQuery(handle: string, since: Date, until: Date): string {
  return `author:${handle} type:pr ${updatedWindow(since, until)}`;
}

export function reviewedSearchQuery(handle: string, since: Date, until: Date): string {
  return `reviewed-by:${handle} type:pr ${updatedWindow(since, until)}`;
}

interface ThrottleRequestOptions {
  method: string;
  url: string;
}

function createOctokit(token: string, logger?: Logger): Octokit {
  return new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: ThrottleRequestOptions,
        _octokit: unknown,
        retryCount: number,
      ): boolean => {
        logger?.warn(
          `github: primary rate limit on ${options.method} ${options.url}; retrying after ${String(retryAfter)}s`,
        );
        return retryCount < 2;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        options: ThrottleRequestOptions,
        _octokit: unknown,
        retryCount: number,
      ): boolean => {
        logger?.warn(
          `github: secondary rate limit on ${options.method} ${options.url}; retrying after ${String(retryAfter)}s`,
        );
        return retryCount < 2;
      },
    },
  });
}

/** Build a client over any GraphQL callable — the seam tests drive. */
export function createGitHubClientFromGraphql(graphql: GraphqlFn, logger?: Logger): GitHubClient {
  let cost = 0;
  let remaining: number | null = null;

  async function searchAll<T>(query: string, q: string, what: string): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | null = null;
    do {
      const data: SearchPage<T> = await graphql<SearchPage<T>>(query, { q, cursor });
      if (data.rateLimit) {
        cost += data.rateLimit.cost;
        remaining = data.rateLimit.remaining;
      }
      for (const node of data.search.nodes) {
        if (node.__typename === "PullRequest") out.push(node as T);
      }
      cursor = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
    } while (cursor);

    if (out.length >= SEARCH_RESULT_CAP) {
      logger?.warn(
        `github: ${what} returned ${String(out.length)} results — GitHub's search ceiling is ${String(SEARCH_RESULT_CAP)}, so older matches were dropped. Narrow the window (--weeks / --since) to see them.`,
      );
    }
    return out;
  }

  return {
    searchPrsByAuthor(handle, since, until) {
      return searchAll<GhPullRequestNode>(
        PR_SEARCH,
        authorSearchQuery(handle, since, until),
        `PRs authored by @${handle}`,
      );
    },

    searchPrsReviewedBy(handle, since, until) {
      return searchAll<GhReviewedPrNode>(
        REVIEWED_SEARCH,
        reviewedSearchQuery(handle, since, until),
        `PRs reviewed by @${handle}`,
      );
    },

    usage() {
      return { cost, remaining };
    },
  };
}

export function createOctokitGitHubClient(token: string, logger?: Logger): GitHubClient {
  const octokit = createOctokit(token, logger);
  const graphql: GraphqlFn = (query, variables) => octokit.graphql(query, variables);
  return createGitHubClientFromGraphql(graphql, logger);
}
