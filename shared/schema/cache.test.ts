import { describe, it, expect } from "vitest";
import {
  CACHE_VERSION,
  emptyHandleCache,
  parseHandleCache,
  serializeHandleCache,
  type HandleCache,
} from "./cache";
import type { Comment, Commit, PullRequest, RepoRef } from "../types";

const web: RepoRef = { source: "github", owner: "acme", name: "web", url: "https://github.com/acme/web" };

const pr: PullRequest = {
  source: "github",
  repo: web,
  number: 42,
  title: "Add widget",
  authorHandle: "alice",
  state: "merged",
  createdAt: new Date("2026-08-01T09:00:00.000Z"),
  mergedAt: new Date("2026-08-03T17:30:00.000Z"),
  additions: 120,
  deletions: 30,
  changedFiles: 6,
  commits: 2,
  reviewCommentsCount: 3,
  issueCommentsCount: 2,
  reviewsCount: 1,
  participants: ["alice", "bob"],
  linkedIssues: 1,
  url: "https://github.com/acme/web/pull/42",
};

const commit: Commit = {
  source: "github",
  repo: web,
  sha: "aaa111",
  authorHandle: "alice",
  committedAt: new Date("2026-08-02T10:00:00.000Z"),
  additions: 0,
  deletions: 0,
  url: "https://github.com/acme/web/commit/aaa111",
};

const comment: Comment = {
  source: "github",
  repo: web,
  kind: "review_summary",
  authorHandle: "alice",
  createdAt: new Date("2026-08-04T08:00:00.000Z"),
  prNumber: 42,
  url: "https://github.com/acme/web/pull/42",
};

function populated(): HandleCache {
  const cache = emptyHandleCache("github", "alice");
  cache.coverage = { since: new Date("2026-03-01T00:00:00.000Z"), until: new Date("2026-09-01T00:00:00.000Z") };
  cache.prs.set("github:acme/web#42", { pr, commits: [commit] });
  cache.comments.set(comment.url, comment);
  cache.repos = [web];
  return cache;
}

describe("handle cache — round trip", () => {
  it("survives serialize → JSON → parse unchanged", () => {
    const before = populated();
    const after = parseHandleCache(JSON.parse(JSON.stringify(serializeHandleCache(before))));
    expect(after).toEqual(before);
  });

  it("writes dates as ISO strings on disk, not Date objects", () => {
    const raw = JSON.parse(JSON.stringify(serializeHandleCache(populated()))) as Record<string, never>;
    const json = raw as unknown as {
      coverage: { since: string };
      prs: Record<string, { pr: { createdAt: string; mergedAt: string | null } }>;
    };
    expect(json.coverage.since).toBe("2026-03-01T00:00:00.000Z");
    expect(json.prs["github:acme/web#42"].pr.createdAt).toBe("2026-08-01T09:00:00.000Z");
    expect(json.prs["github:acme/web#42"].pr.mergedAt).toBe("2026-08-03T17:30:00.000Z");
  });

  it("keeps an absent mergedAt/closedAt absent rather than inventing a date", () => {
    const cache = emptyHandleCache("github", "alice");
    const open: PullRequest = { ...pr, state: "open", mergedAt: undefined, closedAt: undefined };
    cache.prs.set("github:acme/web#43", { pr: open, commits: [] });

    const back = parseHandleCache(JSON.parse(JSON.stringify(serializeHandleCache(cache))));
    const restored = back.prs.get("github:acme/web#43")!.pr;
    expect(restored.mergedAt).toBeUndefined();
    expect(restored.closedAt).toBeUndefined();
  });

  it("keeps a comment with no PR number", () => {
    const cache = emptyHandleCache("github", "alice");
    const loose: Comment = { ...comment, prNumber: undefined, url: "https://github.com/acme/web/discussions/9" };
    cache.comments.set(loose.url, loose);

    const back = parseHandleCache(JSON.parse(JSON.stringify(serializeHandleCache(cache))));
    expect(back.comments.get(loose.url)?.prNumber).toBeUndefined();
  });

  it("round-trips a PR-less commit in its own bucket", () => {
    const cache = emptyHandleCache("github", "alice");
    cache.commits.set(commit.sha, commit);

    const back = parseHandleCache(JSON.parse(JSON.stringify(serializeHandleCache(cache))));
    expect(back.commits.get("aaa111")).toEqual(commit);
  });
});

describe("handle cache — rejection", () => {
  const valid = (): unknown => JSON.parse(JSON.stringify(serializeHandleCache(populated())));

  it("rejects a cache written by a different version", () => {
    const raw = valid() as { version: number };
    raw.version = CACHE_VERSION + 1;
    expect(() => parseHandleCache(raw)).toThrow();
  });

  it("rejects a malformed entity", () => {
    const raw = valid() as { prs: Record<string, { pr: Record<string, unknown> }> };
    raw.prs["github:acme/web#42"].pr.additions = "lots";
    expect(() => parseHandleCache(raw)).toThrow();
  });

  it("rejects a non-ISO coverage bound", () => {
    const raw = valid() as { coverage: { since: string } };
    raw.coverage.since = "march";
    expect(() => parseHandleCache(raw)).toThrow();
  });

  it("rejects an unknown extra field rather than silently dropping it", () => {
    const raw = valid() as Record<string, unknown>;
    raw.surprise = true;
    expect(() => parseHandleCache(raw)).toThrow();
  });

  it("rejects junk", () => {
    expect(() => parseHandleCache(null)).toThrow();
    expect(() => parseHandleCache("nope")).toThrow();
  });
});

describe("emptyHandleCache", () => {
  it("starts with no coverage, so the handle reads as never fetched", () => {
    const cache = emptyHandleCache("github", "alice");
    expect(cache.coverage).toBeUndefined();
    expect(cache.prs.size).toBe(0);
    expect(cache.handle).toBe("alice");
    expect(cache.source).toBe("github");
  });

  it("round-trips while still uncovered", () => {
    const cache = emptyHandleCache("github", "alice");
    const back = parseHandleCache(JSON.parse(JSON.stringify(serializeHandleCache(cache))));
    expect(back.coverage).toBeUndefined();
  });
});
