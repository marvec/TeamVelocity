/**
 * Real GitHub client backed by Octokit (umbrella package: REST + GraphQL +
 * throttling + retry). This is the ONLY module that talks to GitHub or reads
 * the token; it lives under cli/ and is never imported by src/ (invariant #1).
 */

import { Octokit } from "octokit";
import type { Logger } from "../types";
import type { GhPullRequestNode, GhReviewedPrNode, GitHubClient } from "./types";

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
  search(query: $q, type: ISSUE, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { __typename ... on PullRequest { ${PR_FIELDS} } }
  }
}`;

const REVIEWED_SEARCH = `
query SearchReviewed($q: String!, $cursor: String) {
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
}

function isoWindow(since: Date, until: Date): string {
  return `${since.toISOString()}..${until.toISOString()}`;
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

export function createOctokitGitHubClient(token: string, logger?: Logger): GitHubClient {
  const octokit = createOctokit(token, logger);

  async function searchAll<T>(query: string, q: string): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | null = null;
    do {
      const data: SearchPage<T> = await octokit.graphql<SearchPage<T>>(query, { q, cursor });
      for (const node of data.search.nodes) {
        if (node.__typename === "PullRequest") out.push(node as T);
      }
      cursor = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
    } while (cursor);
    return out;
  }

  return {
    searchPrsByAuthor(handle, since, until) {
      const q = `author:${handle} type:pr created:${isoWindow(since, until)}`;
      return searchAll<GhPullRequestNode>(PR_SEARCH, q);
    },

    searchPrsReviewedBy(handle, since, until) {
      const q = `reviewed-by:${handle} type:pr updated:${isoWindow(since, until)}`;
      return searchAll<GhReviewedPrNode>(REVIEWED_SEARCH, q);
    },
  };
}
