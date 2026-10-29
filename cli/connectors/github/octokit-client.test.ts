/**
 * Tests the GitHub client's query construction, pagination and accounting
 * through the injectable graphql seam — no network, no token (PRD §11).
 */

import { describe, it, expect } from "vitest";
import {
  batchHandles,
  createGitHubClientFromGraphql,
  MAX_SEARCH_QUERY_LENGTH,
  reviewedSearchQuery,
  type GraphqlFn,
} from "./octokit-client";
import type { Logger } from "../types";

const since = new Date("2026-09-01T00:00:00.000Z");
const until = new Date("2026-09-15T00:00:00.000Z");

function collectingLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    logger: { info() {}, warn: (m) => warnings.push(m), error() {}, debug() {} },
  };
}

/** A graphql fake that records the queries/variables it was called with. */
function recorder(pages: unknown[]): { fn: GraphqlFn; calls: { query: string; vars: Record<string, unknown> }[] } {
  const calls: { query: string; vars: Record<string, unknown> }[] = [];
  let i = 0;
  const fn: GraphqlFn = (query, vars) => {
    calls.push({ query, vars });
    const page = pages[Math.min(i, pages.length - 1)];
    i += 1;
    return Promise.resolve(page as never);
  };
  return { fn, calls };
}

function page(
  nodes: unknown[],
  opts: { next?: string | null; cost?: number; remaining?: number; issueCount?: number } = {},
): unknown {
  return {
    search: {
      issueCount: opts.issueCount ?? nodes.length,
      pageInfo: { hasNextPage: opts.next != null, endCursor: opts.next ?? null },
      nodes,
    },
    rateLimit: { cost: opts.cost ?? 1, remaining: opts.remaining ?? 4999 },
  };
}

function prNode(number: number): unknown {
  return { __typename: "PullRequest", number };
}

describe("gitHub client — search queries", () => {
  it("searches authored PRs by updated:, not created:", async () => {
    const { fn, calls } = recorder([page([])]);
    await createGitHubClientFromGraphql(fn).searchPrsByAuthors(["alice"], since, until);

    const q = calls[0].vars.q as string;
    // `created:` would never re-surface a PR opened before the window but
    // merged inside it, which is exactly what an incremental delta must catch.
    expect(q).toContain("updated:2026-09-01T00:00:00.000Z..2026-09-15T00:00:00.000Z");
    expect(q).not.toContain("created:");
    expect(q).toContain("author:alice");
    expect(q).toContain("type:pr");
  });

  it("searches reviewed PRs by updated: over the same window", async () => {
    const { fn, calls } = recorder([page([])]);
    await createGitHubClientFromGraphql(fn).searchPrsReviewedBy(["bob"], since, until);

    const q = calls[0].vars.q as string;
    expect(q).toContain("reviewed-by:bob");
    expect(q).toContain("updated:2026-09-01T00:00:00.000Z..2026-09-15T00:00:00.000Z");
  });

  it("ORs several handles into one query", async () => {
    const { fn, calls } = recorder([page([])]);
    const client = createGitHubClientFromGraphql(fn);
    await client.searchPrsByAuthors(["alice", "bob"], since, until);
    await client.searchPrsReviewedBy(["alice", "bob"], since, until);

    expect(calls).toHaveLength(2);
    expect(calls[0].vars.q).toMatch(/^author:alice author:bob type:pr updated:/);
    expect(calls[1].vars.q).toMatch(/^reviewed-by:alice reviewed-by:bob type:pr updated:/);
  });

  it("asks who reviewed each PR, so a batched result can be credited", async () => {
    const { fn, calls } = recorder([page([])]);
    await createGitHubClientFromGraphql(fn).searchPrsReviewedBy(["alice"], since, until);
    expect(calls[0].query).toMatch(/reviews\(first: 100\) \{ totalCount nodes \{ author \{ login \} \} \}/);
  });

  it("asks for rateLimit cost in both queries", async () => {
    const { fn, calls } = recorder([page([])]);
    const client = createGitHubClientFromGraphql(fn);
    await client.searchPrsByAuthors(["alice"], since, until);
    await client.searchPrsReviewedBy(["alice"], since, until);
    for (const call of calls) expect(call.query).toContain("rateLimit");
  });
});

describe("batchHandles", () => {
  it("keeps a small team in one batch", () => {
    expect(batchHandles(["alice", "bob", "carol"], since, until)).toEqual([["alice", "bob", "carol"]]);
  });

  it("splits before a query would exceed GitHub's length limit, keeping order", () => {
    const handles = Array.from({ length: 20 }, (_, i) => `member-handle-${String(i).padStart(2, "0")}`);
    const batches = batchHandles(handles, since, until);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(handles);
    for (const batch of batches) {
      expect(reviewedSearchQuery(batch, since, until).length).toBeLessThanOrEqual(MAX_SEARCH_QUERY_LENGTH);
    }
    // Fewest batches: the next handle would not have fitted into any earlier batch.
    for (let i = 0; i < batches.length - 1; i++) {
      const grown = [...batches[i], batches[i + 1][0]];
      expect(reviewedSearchQuery(grown, since, until).length).toBeGreaterThan(MAX_SEARCH_QUERY_LENGTH);
    }
  });

  it("returns no batches for no handles", () => {
    expect(batchHandles([], since, until)).toEqual([]);
  });
});

describe("gitHub client — pagination", () => {
  it("follows cursors and concatenates every page", async () => {
    const { fn, calls } = recorder([
      page([prNode(1), prNode(2)], { next: "CUR1" }),
      page([prNode(3)], { next: null }),
    ]);
    const out = await createGitHubClientFromGraphql(fn).searchPrsByAuthors(["alice"], since, until);

    expect(out.nodes.map((n) => n.number)).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(2);
    expect(calls[0].vars.cursor).toBeNull();
    expect(calls[1].vars.cursor).toBe("CUR1");
  });

  it("drops non-PullRequest nodes the issue search returns", async () => {
    const { fn } = recorder([page([prNode(1), { __typename: "Issue", number: 2 }])]);
    const out = await createGitHubClientFromGraphql(fn).searchPrsByAuthors(["alice"], since, until);
    expect(out.nodes.map((n) => n.number)).toEqual([1]);
  });
});

describe("gitHub client — accounting", () => {
  it("warns when a search hits GitHub's 1000-result ceiling", async () => {
    const { logger, warnings } = collectingLogger();
    const full = Array.from({ length: 1000 }, (_, i) => prNode(i + 1));
    const { fn } = recorder([page(full, { next: null })]);

    const out = await createGitHubClientFromGraphql(fn, logger).searchPrsByAuthors(["alice"], since, until);

    // Reporting it is what keeps the caller from caching the window as covered;
    // the warning alone would let the dropped matches be lost permanently.
    expect(out.truncated).toBe(true);
    expect(warnings.some((w) => w.includes("1000") && w.includes("alice"))).toBe(true);
  });

  it("bails after the first page when asked and the search is already over the ceiling", async () => {
    const { logger, warnings } = collectingLogger();
    const { fn, calls } = recorder([page([prNode(1)], { next: "MORE", issueCount: 1500 })]);

    const out = await createGitHubClientFromGraphql(fn, logger).searchPrsByAuthors(["alice", "bob"], since, until, {
      bailOnCap: true,
    });

    // The caller is about to split the batch and ask again; paging through the
    // other 29 pages would only spend points on a result that gets discarded.
    expect(calls).toHaveLength(1);
    expect(out).toEqual({ nodes: [], truncated: true });
    expect(warnings).toEqual([]);
  });

  it("pages on past the ceiling when not asked to bail", async () => {
    const { fn, calls } = recorder([
      page([prNode(1)], { next: "MORE", issueCount: 1500 }),
      page([prNode(2)], { next: null, issueCount: 1500 }),
    ]);
    const out = await createGitHubClientFromGraphql(fn).searchPrsByAuthors(["alice"], since, until);
    expect(calls).toHaveLength(2);
    expect(out.nodes).toHaveLength(2);
    // Fewer nodes than GitHub counted still means matches were left behind.
    expect(out.truncated).toBe(true);
  });

  it("stays quiet below the ceiling", async () => {
    const { logger, warnings } = collectingLogger();
    const { fn } = recorder([page([prNode(1)], { next: null })]);

    const out = await createGitHubClientFromGraphql(fn, logger).searchPrsByAuthors(["alice"], since, until);

    expect(out.truncated).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("accumulates rate-limit cost across searches and reports what is left", async () => {
    const { fn } = recorder([
      page([prNode(1)], { next: "C", cost: 3, remaining: 4997 }),
      page([prNode(2)], { next: null, cost: 2, remaining: 4995 }),
    ]);
    const client = createGitHubClientFromGraphql(fn);

    expect(client.usage()).toEqual({ cost: 0, remaining: null });
    await client.searchPrsByAuthors(["alice"], since, until);
    expect(client.usage()).toEqual({ cost: 5, remaining: 4995 });
  });

  it("retries a page GitHub answered with no data at all", async () => {
    // Octokit hands back `response.data.data` unchecked, so a 200 with neither
    // `data` nor `errors` arrives as undefined — seen live on a heavy search.
    const { fn, calls } = recorder([undefined, page([prNode(1)], { next: null })]);
    const out = await createGitHubClientFromGraphql(fn).searchPrsByAuthors(["alice"], since, until);

    expect(calls).toHaveLength(2);
    expect(out.nodes).toHaveLength(1);
  });

  it("fails with a readable error when the empty answer repeats", async () => {
    const { fn } = recorder([undefined]);
    await expect(createGitHubClientFromGraphql(fn).searchPrsByAuthors(["alice"], since, until)).rejects.toThrow(
      /no search data/,
    );
  });

  it("tolerates a response without a rateLimit block", async () => {
    const { fn } = recorder([{ search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }]);
    const client = createGitHubClientFromGraphql(fn);

    await client.searchPrsByAuthors(["alice"], since, until);

    expect(client.usage()).toEqual({ cost: 0, remaining: null });
  });
});
