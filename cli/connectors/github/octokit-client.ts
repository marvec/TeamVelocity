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
import type {
  GhPullRequestNode,
  GhReviewedPrNode,
  GitHubClient,
  SearchOptions,
  SearchOutcome,
} from "./types";

/**
 * GitHub's `search` connection returns at most 1000 results, whatever the
 * pagination. Hitting it means results were silently dropped.
 * https://docs.github.com/en/graphql/reference/search
 */
const SEARCH_RESULT_CAP = 1000;

/**
 * GitHub rejects search queries longer than this. The REST docs say qualifiers
 * do not count towards it, but every byte here IS a qualifier, so the whole
 * string is measured to stay clear of an undocumented edge.
 * https://docs.github.com/en/search-github/getting-started-with-searching-on-github/troubleshooting-search-queries
 */
export const MAX_SEARCH_QUERY_LENGTH = 256;

const PR_FIELDS = `
  id
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
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { __typename ... on PullRequest { ${PR_FIELDS} } }
  }
}`;

const REVIEWED_SEARCH = `
query SearchReviewed($q: String!, $cursor: String) {
  rateLimit { cost remaining }
  search(query: $q, type: ISSUE, first: 50, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { __typename ... on PullRequest {
      number url updatedAt repository { name url owner { login } }
      reviews(first: 100) { totalCount nodes { author { login } } }
    } }
  }
}`;

interface SearchPage<T> {
  search: {
    /** Absent from older recorded fixtures; only the early bail depends on it. */
    issueCount?: number;
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

/**
 * Repeating a user qualifier ORs it — `author:a author:b` matches PRs by either
 * (verified against live search) — and does not count towards GitHub's limit of
 * five boolean operators, so one query serves a whole batch of handles.
 */
function qualified(qualifier: string, handles: string[]): string {
  return handles.map((h) => `${qualifier}:${h}`).join(" ");
}

export function authorSearchQuery(handles: string[], since: Date, until: Date): string {
  return `${qualified("author", handles)} type:pr ${updatedWindow(since, until)}`;
}

export function reviewedSearchQuery(handles: string[], since: Date, until: Date): string {
  return `${qualified("reviewed-by", handles)} type:pr ${updatedWindow(since, until)}`;
}

/**
 * Split handles into the fewest in-order groups whose queries fit GitHub's
 * length limit. Sized by the reviewed query, the longer of the two, so both
 * searches share one batching. A handle too long to share a query still gets
 * one of its own.
 */
export function batchHandles(handles: string[], since: Date, until: Date): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  for (const handle of handles) {
    const candidate = [...current, handle];
    if (current.length > 0 && reviewedSearchQuery(candidate, since, until).length > MAX_SEARCH_QUERY_LENGTH) {
      batches.push(current);
      current = [handle];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
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

  /**
   * One search page. Octokit returns `response.data.data` unchecked, so a 200
   * carrying neither `data` nor `errors` — seen live on a heavy batched search —
   * arrives as undefined. That is a transient fault, not an empty result: retry
   * it once, then fail in words the caller's warning can carry.
   */
  async function fetchPage<T>(
    query: string,
    variables: Record<string, unknown>,
    what: string,
  ): Promise<SearchPage<T>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await graphql<SearchPage<T> | undefined>(query, variables);
      if (data?.search) return data;
      logger?.debug(`github: ${what} came back with no search data (attempt ${String(attempt + 1)})`);
    }
    throw new Error(`GitHub returned no search data for ${what}, twice`);
  }

  async function searchAll<T>(
    query: string,
    q: string,
    what: string,
    options: SearchOptions = {},
  ): Promise<SearchOutcome<T>> {
    const out: T[] = [];
    let cursor: string | null = null;
    let matches = 0;
    do {
      const data: SearchPage<T> = await fetchPage<T>(query, { q, cursor }, what);
      if (data.rateLimit) {
        cost += data.rateLimit.cost;
        remaining = data.rateLimit.remaining;
      }
      matches = Math.max(matches, data.search.issueCount ?? 0);
      if (options.bailOnCap && matches > SEARCH_RESULT_CAP) {
        logger?.debug(
          `github: ${what} matches ${String(matches)} — over the ${String(SEARCH_RESULT_CAP)}-result ceiling, splitting`,
        );
        return { nodes: [], truncated: true };
      }
      for (const node of data.search.nodes) {
        if (node.__typename === "PullRequest") out.push(node as T);
      }
      cursor = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
    } while (cursor);

    const truncated = out.length >= SEARCH_RESULT_CAP || matches > SEARCH_RESULT_CAP;
    if (truncated) {
      logger?.warn(
        `github: ${what} hit GitHub's ${String(SEARCH_RESULT_CAP)}-result search ceiling, so older matches were dropped. This window will NOT be recorded as cached, so it is retried every pull until it fits — narrow it with --since, or pull more often.`,
      );
    }
    return { nodes: out, truncated };
  }

  return {
    searchPrsByAuthors(handles, since, until, options) {
      return searchAll<GhPullRequestNode>(
        PR_SEARCH,
        authorSearchQuery(handles, since, until),
        `PRs authored by ${mentions(handles)}`,
        options,
      );
    },

    searchPrsReviewedBy(handles, since, until, options) {
      return searchAll<GhReviewedPrNode>(
        REVIEWED_SEARCH,
        reviewedSearchQuery(handles, since, until),
        `PRs reviewed by ${mentions(handles)}`,
        options,
      );
    },

    usage() {
      return { cost, remaining };
    },
  };
}

function mentions(handles: string[]): string {
  return handles.map((h) => `@${h}`).join(", ");
}

export function createOctokitGitHubClient(token: string, logger?: Logger): GitHubClient {
  const octokit = createOctokit(token, logger);
  const graphql: GraphqlFn = (query, variables) => octokit.graphql(query, variables);
  return createGitHubClientFromGraphql(graphql, logger);
}
