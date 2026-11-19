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

describe("gitHub client — member issue comments", () => {
  /** A `user.issueComments` page, newest-updated first, as GitHub returns it. */
  function commentsPage(
    nodes: unknown[],
    opts: { next?: string | null; cost?: number; remaining?: number } = {},
  ): unknown {
    return {
      user: {
        issueComments: {
          pageInfo: { hasNextPage: opts.next != null, endCursor: opts.next ?? null },
          nodes,
        },
      },
      rateLimit: { cost: opts.cost ?? 1, remaining: opts.remaining ?? 4999 },
    };
  }

  function comment(id: number, createdAt: string, updatedAt = createdAt, prNumber: number | null = null): unknown {
    return {
      url: `https://github.com/other/repo/issues/9#issuecomment-${String(id)}`,
      createdAt,
      updatedAt,
      repository: { name: "repo", url: "https://github.com/other/repo", owner: { login: "other" } },
      pullRequest: prNumber === null ? null : { number: prNumber },
    };
  }

  const ids = (out: Awaited<ReturnType<ReturnType<typeof createGitHubClientFromGraphql>["listIssueCommentsBy"]>>) =>
    out.status === "found" ? out.nodes.map((n) => n.url.split("-").pop()) : out;

  it("asks for the user's comments newest-updated first, with rate-limit cost", async () => {
    const { fn, calls } = recorder([commentsPage([])]);
    await createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until);

    expect(calls).toHaveLength(1);
    expect(calls[0].vars).toEqual({ login: "alice", cursor: null });
    expect(calls[0].query).toContain("user(login: $login)");
    expect(calls[0].query).toMatch(/issueComments\(first: 100, after: \$cursor, orderBy: \{ field: UPDATED_AT, direction: DESC \}\)/);
    expect(calls[0].query).toContain("pullRequest { number }");
    expect(calls[0].query).toContain("rateLimit { cost remaining }");
  });

  it("stops paging once a page reaches back before `since`", async () => {
    const { fn, calls } = recorder([
      commentsPage([comment(1, "2026-09-10T00:00:00Z"), comment(2, "2026-09-08T00:00:00Z")], { next: "P2" }),
      commentsPage([comment(3, "2026-09-05T00:00:00Z"), comment(4, "2026-08-20T00:00:00Z")], { next: "P3" }),
      commentsPage([comment(5, "2026-08-01T00:00:00Z")], { next: null }),
    ]);
    const out = await createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until);

    // Page 3 can only hold comments updated even earlier — never in the window.
    expect(calls).toHaveLength(2);
    expect(calls[1].vars.cursor).toBe("P2");
    expect(ids(out)).toEqual(["1", "2", "3"]);
  });

  it("follows every page while comments are still inside the window", async () => {
    const { fn, calls } = recorder([
      commentsPage([comment(1, "2026-09-10T00:00:00Z")], { next: "P2" }),
      commentsPage([comment(2, "2026-09-09T00:00:00Z")], { next: null }),
    ]);
    const out = await createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until);
    expect(calls).toHaveLength(2);
    expect(ids(out)).toEqual(["1", "2"]);
  });

  it("stops on an empty page even if GitHub claims there is another", async () => {
    const { fn, calls } = recorder([commentsPage([], { next: "P2" }), commentsPage([comment(1, "2026-09-10T00:00:00Z")])]);
    const out = await createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until);
    expect(calls).toHaveLength(1);
    expect(out).toEqual({ status: "found", nodes: [], truncated: false });
  });

  it("excludes an old comment edited inside the window", async () => {
    const { fn } = recorder([
      commentsPage([comment(1, "2026-08-20T00:00:00Z", "2026-09-10T00:00:00Z"), comment(2, "2026-09-03T00:00:00Z")]),
    ]);
    const out = await createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until);
    // Credited at creation time, so an edit does not move it into this window.
    expect(ids(out)).toEqual(["2"]);
  });

  it("windows on createdAt as [since, until)", async () => {
    const { fn } = recorder([
      commentsPage([
        comment(1, "2026-09-15T00:00:00.000Z"),
        comment(2, "2026-09-14T23:59:59.999Z"),
        comment(3, "2026-09-01T00:00:00.000Z"),
        comment(4, "2026-08-31T23:59:59.999Z"),
      ]),
    ]);
    const out = await createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until);
    expect(ids(out)).toEqual(["2", "3"]);
  });

  it("keeps the raw node shape, including a PR's number", async () => {
    const node = comment(7, "2026-09-03T00:00:00Z", "2026-09-03T00:00:00Z", 42);
    const { fn } = recorder([commentsPage([node, comment(8, "2026-09-02T00:00:00Z")])]);
    const out = await createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until);

    expect(out.status).toBe("found");
    if (out.status !== "found") return;
    expect(out.nodes[0]).toEqual(node);
    expect(out.nodes[1].pullRequest).toBeNull();
  });

  it("reports a null user as not found, not as an empty success", async () => {
    const { fn } = recorder([{ user: null, rateLimit: { cost: 1, remaining: 4998 } }]);
    const client = createGitHubClientFromGraphql(fn);
    const out = await client.listIssueCommentsBy("ghost", since, until);
    expect(out).toEqual({ status: "userNotFound" });
    expect(client.usage()).toEqual({ cost: 1, remaining: 4998 });
  });

  it("reports GitHub's NOT_FOUND error on `user` as not found", async () => {
    // Octokit throws a GraphqlResponseError whenever the response has `errors`,
    // which is how an unknown login actually arrives from the live API.
    const fn: GraphqlFn = () =>
      Promise.reject(
        Object.assign(new Error("Could not resolve to a User with the login of 'ghost'."), {
          name: "GraphqlResponseError",
          errors: [{ type: "NOT_FOUND", path: ["user"], message: "Could not resolve to a User" }],
          data: { user: null },
        }),
      );
    await expect(createGitHubClientFromGraphql(fn).listIssueCommentsBy("ghost", since, until)).resolves.toEqual({
      status: "userNotFound",
    });
  });

  it("rethrows any other GraphQL error", async () => {
    const fn: GraphqlFn = () =>
      Promise.reject(Object.assign(new Error("boom"), { errors: [{ type: "RATE_LIMITED", path: ["user"] }] }));
    await expect(createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until)).rejects.toThrow("boom");
  });

  it("retries a page that came back with no data, once", async () => {
    const { fn, calls } = recorder([undefined, commentsPage([comment(1, "2026-09-10T00:00:00Z")])]);
    const out = await createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until);
    expect(calls).toHaveLength(2);
    expect(ids(out)).toEqual(["1"]);
  });

  it("fails naming the handle when the empty answer repeats", async () => {
    const { fn, calls } = recorder([undefined]);
    await expect(createGitHubClientFromGraphql(fn).listIssueCommentsBy("alice", since, until)).rejects.toThrow(
      /@alice/,
    );
    expect(calls).toHaveLength(2);
  });

  it("adds each page's rate-limit cost to usage()", async () => {
    const { fn } = recorder([
      commentsPage([comment(1, "2026-09-10T00:00:00Z")], { next: "P2", cost: 1, remaining: 4990 }),
      commentsPage([comment(2, "2026-09-09T00:00:00Z")], { next: null, cost: 2, remaining: 4988 }),
    ]);
    const client = createGitHubClientFromGraphql(fn);
    await client.listIssueCommentsBy("alice", since, until);
    expect(client.usage()).toEqual({ cost: 3, remaining: 4988 });
  });
});
