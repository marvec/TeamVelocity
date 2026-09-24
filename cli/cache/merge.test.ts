import { describe, it, expect } from "vitest";
import { mergeHandleCache } from "./merge";
import { emptyHandleCache, type HandleCache } from "../../shared/schema/cache";
import type { CollectResult } from "../connectors/types";
import type { Comment, Commit, PullRequest, RepoRef } from "../../shared/types";
import type { Window } from "./plan";

const web: RepoRef = { source: "github", owner: "acme", name: "web", url: "https://github.com/acme/web" };
const api: RepoRef = { source: "github", owner: "acme", name: "api", url: "https://github.com/acme/api" };

const d = (iso: string): Date => new Date(iso);
const KEY = "github:acme/web#42";

function pr(over: Partial<PullRequest> = {}): PullRequest {
  return {
    source: "github",
    repo: web,
    number: 42,
    title: "Add widget",
    authorHandle: "alice",
    state: "open",
    createdAt: d("2026-08-01T09:00:00.000Z"),
    additions: 10,
    deletions: 1,
    changedFiles: 2,
    commits: 1,
    reviewCommentsCount: 0,
    issueCommentsCount: 0,
    reviewsCount: 0,
    participants: ["alice"],
    linkedIssues: 0,
    url: "https://github.com/acme/web/pull/42",
    ...over,
  };
}

function commit(sha: string): Commit {
  return {
    source: "github",
    repo: web,
    sha,
    authorHandle: "alice",
    committedAt: d("2026-08-02T10:00:00.000Z"),
    additions: 0,
    deletions: 0,
    url: `https://github.com/acme/web/commit/${sha}`,
  };
}

function comment(url: string, over: Partial<Comment> = {}): Comment {
  return {
    source: "github",
    repo: web,
    kind: "review_summary",
    authorHandle: "alice",
    createdAt: d("2026-08-04T08:00:00.000Z"),
    prNumber: 42,
    url,
    ...over,
  };
}

function fetched(over: Partial<CollectResult> = {}): CollectResult {
  return { prs: [], commits: [], comments: [], repos: [], complete: true, ...over };
}

const w = (since: string, until: string): Window => ({ since: d(since), until: d(until) });

describe("mergeHandleCache — entities", () => {
  it("adds newly fetched records to an empty cache", () => {
    const out = mergeHandleCache(
      emptyHandleCache("github", "alice"),
      fetched({ prs: [{ pr: pr(), commits: [commit("aaa")] }], comments: [comment("c1")] }),
      w("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
    );

    expect(out.prs.get(KEY)?.pr.state).toBe("open");
    expect(out.comments.get("c1")).toBeDefined();
  });

  it("replaces a cached PR with the re-fetched one", () => {
    const before = emptyHandleCache("github", "alice");
    before.prs.set(KEY, { pr: pr(), commits: [] });

    const merged = pr({ state: "merged", mergedAt: d("2026-08-05T00:00:00.000Z"), additions: 99 });
    const out = mergeHandleCache(before, fetched({ prs: [{ pr: merged, commits: [] }] }), w("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"));

    expect(out.prs.size).toBe(1);
    expect(out.prs.get(KEY)?.pr.state).toBe("merged");
    expect(out.prs.get(KEY)?.pr.additions).toBe(99);
  });

  it("REPLACES a re-fetched PR's commit set rather than unioning it", () => {
    // The rebase case. Unioning would keep every rewritten SHA forever and
    // permanently inflate velocity's wCommit signal.
    const before = emptyHandleCache("github", "alice");
    before.prs.set(KEY, { pr: pr(), commits: [commit("old1"), commit("old2")] });

    const out = mergeHandleCache(
      before,
      fetched({ prs: [{ pr: pr(), commits: [commit("new1")] }] }),
      w("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
    );

    expect(out.prs.get(KEY)?.commits.map((c) => c.sha)).toEqual(["new1"]);
  });

  it("leaves untouched PRs alone", () => {
    const before = emptyHandleCache("github", "alice");
    before.prs.set(KEY, { pr: pr(), commits: [commit("keep")] });
    before.prs.set("github:acme/web#7", { pr: pr({ number: 7 }), commits: [] });

    const out = mergeHandleCache(before, fetched({ prs: [{ pr: pr({ number: 7, title: "Renamed" }), commits: [] }] }), w("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"));

    expect(out.prs.get(KEY)?.commits.map((c) => c.sha)).toEqual(["keep"]);
    expect(out.prs.get("github:acme/web#7")?.pr.title).toBe("Renamed");
  });

  it("replaces a comment by url and keeps the others", () => {
    const before = emptyHandleCache("github", "alice");
    before.comments.set("c1", comment("c1", { createdAt: d("2026-07-01T00:00:00.000Z") }));
    before.comments.set("c2", comment("c2"));

    const out = mergeHandleCache(before, fetched({ comments: [comment("c1", { createdAt: d("2026-09-01T00:00:00.000Z") })] }), w("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"));

    expect(out.comments.size).toBe(2);
    expect(out.comments.get("c1")?.createdAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("merges PR-less commits by sha", () => {
    const before = emptyHandleCache("github", "alice");
    before.commits.set("loose1", commit("loose1"));

    const out = mergeHandleCache(before, fetched({ commits: [commit("loose2")] }), w("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"));

    expect([...out.commits.keys()].sort()).toEqual(["loose1", "loose2"]);
  });

  it("unions repos without duplicating by repo key", () => {
    const before = emptyHandleCache("github", "alice");
    before.repos = [web];

    const out = mergeHandleCache(before, fetched({ repos: [{ ...web }, api] }), w("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"));

    expect(out.repos.map((r) => r.name).sort()).toEqual(["api", "web"]);
  });
});

describe("mergeHandleCache — coverage", () => {
  it("adopts the fetched window when nothing was covered", () => {
    const out = mergeHandleCache(emptyHandleCache("github", "alice"), fetched(), w("2026-03-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"));
    expect(out.coverage?.since.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(out.coverage?.until.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("extends coverage forward", () => {
    const before = emptyHandleCache("github", "alice");
    before.coverage = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-01T00:00:00.000Z") };

    const out = mergeHandleCache(before, fetched(), w("2026-08-30T00:00:00.000Z", "2026-09-15T00:00:00.000Z"));

    expect(out.coverage?.since.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(out.coverage?.until.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("extends coverage backward", () => {
    const before = emptyHandleCache("github", "alice");
    before.coverage = { since: d("2026-06-01T00:00:00.000Z"), until: d("2026-09-01T00:00:00.000Z") };

    const out = mergeHandleCache(before, fetched(), w("2026-03-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));

    expect(out.coverage?.since.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(out.coverage?.until.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("never shrinks coverage when a narrower window is merged", () => {
    const before = emptyHandleCache("github", "alice");
    before.coverage = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-15T00:00:00.000Z") };

    const out = mergeHandleCache(before, fetched(), w("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));

    expect(out.coverage?.since.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(out.coverage?.until.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("folds two windows in sequence into one interval", () => {
    const back = w("2026-03-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z");
    const forward = w("2026-08-30T00:00:00.000Z", "2026-09-15T00:00:00.000Z");
    const start = emptyHandleCache("github", "alice");
    start.coverage = { since: d("2026-06-01T00:00:00.000Z"), until: d("2026-09-01T00:00:00.000Z") };

    const out = mergeHandleCache(mergeHandleCache(start, fetched(), back), fetched(), forward);

    expect(out.coverage?.since.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(out.coverage?.until.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });
});

describe("mergeHandleCache — incomplete fetch", () => {
  it("still stores what arrived but leaves coverage where it was", () => {
    // A window that was only partly fetched must stay outside coverage so the
    // next pull retries the gap instead of silently losing it.
    const before = emptyHandleCache("github", "alice");
    before.coverage = { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-01T00:00:00.000Z") };

    const out = mergeHandleCache(before, fetched({ prs: [{ pr: pr(), commits: [] }] }), null);

    expect(out.prs.get(KEY)).toBeDefined();
    expect(out.coverage?.until.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("leaves a never-covered handle uncovered", () => {
    const out = mergeHandleCache(emptyHandleCache("github", "alice"), fetched(), null);
    expect(out.coverage).toBeUndefined();
  });
});

describe("mergeHandleCache — purity", () => {
  it("does not mutate the cache it was given", () => {
    const before: HandleCache = emptyHandleCache("github", "alice");
    before.prs.set(KEY, { pr: pr(), commits: [commit("old")] });
    before.coverage = { since: d("2026-06-01T00:00:00.000Z"), until: d("2026-09-01T00:00:00.000Z") };

    mergeHandleCache(before, fetched({ prs: [{ pr: pr({ state: "merged" }), commits: [] }] }), w("2026-09-01T00:00:00.000Z", "2026-09-15T00:00:00.000Z"));

    expect(before.prs.get(KEY)?.pr.state).toBe("open");
    expect(before.prs.get(KEY)?.commits.map((c) => c.sha)).toEqual(["old"]);
    expect(before.coverage?.until.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("carries source and handle through", () => {
    const out = mergeHandleCache(emptyHandleCache("github", "alice"), fetched(), w("2026-03-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"));
    expect(out.source).toBe("github");
    expect(out.handle).toBe("alice");
  });
});
