/**
 * Tests the GitHub client's query construction, pagination and accounting
 * through the injectable graphql seam — no network, no token (PRD §11).
 */

import { describe, it, expect } from "vitest";
import { createGitHubClientFromGraphql, type GraphqlFn } from "./octokit-client";
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

function page(nodes: unknown[], opts: { next?: string | null; cost?: number; remaining?: number } = {}): unknown {
  return {
    search: {
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
    await createGitHubClientFromGraphql(fn).searchPrsByAuthor("alice", since, until);

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
    await createGitHubClientFromGraphql(fn).searchPrsReviewedBy("bob", since, until);

    const q = calls[0].vars.q as string;
    expect(q).toContain("reviewed-by:bob");
    expect(q).toContain("updated:2026-09-01T00:00:00.000Z..2026-09-15T00:00:00.000Z");
  });

  it("asks for rateLimit cost in both queries", async () => {
    const { fn, calls } = recorder([page([])]);
    const client = createGitHubClientFromGraphql(fn);
    await client.searchPrsByAuthor("alice", since, until);
    await client.searchPrsReviewedBy("alice", since, until);
    for (const call of calls) expect(call.query).toContain("rateLimit");
  });
});

describe("gitHub client — pagination", () => {
  it("follows cursors and concatenates every page", async () => {
    const { fn, calls } = recorder([
      page([prNode(1), prNode(2)], { next: "CUR1" }),
      page([prNode(3)], { next: null }),
    ]);
    const out = await createGitHubClientFromGraphql(fn).searchPrsByAuthor("alice", since, until);

    expect(out.nodes.map((n) => n.number)).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(2);
    expect(calls[0].vars.cursor).toBeNull();
    expect(calls[1].vars.cursor).toBe("CUR1");
  });

  it("drops non-PullRequest nodes the issue search returns", async () => {
    const { fn } = recorder([page([prNode(1), { __typename: "Issue", number: 2 }])]);
    const out = await createGitHubClientFromGraphql(fn).searchPrsByAuthor("alice", since, until);
    expect(out.nodes.map((n) => n.number)).toEqual([1]);
  });
});

describe("gitHub client — accounting", () => {
  it("warns when a search hits GitHub's 1000-result ceiling", async () => {
    const { logger, warnings } = collectingLogger();
    const full = Array.from({ length: 1000 }, (_, i) => prNode(i + 1));
    const { fn } = recorder([page(full, { next: null })]);

    const out = await createGitHubClientFromGraphql(fn, logger).searchPrsByAuthor("alice", since, until);

    // Reporting it is what keeps the caller from caching the window as covered;
    // the warning alone would let the dropped matches be lost permanently.
    expect(out.truncated).toBe(true);
    expect(warnings.some((w) => w.includes("1000") && w.includes("alice"))).toBe(true);
  });

  it("stays quiet below the ceiling", async () => {
    const { logger, warnings } = collectingLogger();
    const { fn } = recorder([page([prNode(1)], { next: null })]);

    const out = await createGitHubClientFromGraphql(fn, logger).searchPrsByAuthor("alice", since, until);

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
    await client.searchPrsByAuthor("alice", since, until);
    expect(client.usage()).toEqual({ cost: 5, remaining: 4995 });
  });

  it("tolerates a response without a rateLimit block", async () => {
    const { fn } = recorder([{ search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }]);
    const client = createGitHubClientFromGraphql(fn);

    await client.searchPrsByAuthor("alice", since, until);

    expect(client.usage()).toEqual({ cost: 0, remaining: null });
  });
});
