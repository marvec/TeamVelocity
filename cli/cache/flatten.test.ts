import { describe, it, expect } from "vitest";
import { flattenCollected } from "./flatten";
import type { CollectResult } from "../connectors/types";
import type { Comment, Commit, PullRequest, RepoRef } from "../../shared/types";

const web: RepoRef = { source: "github", owner: "acme", name: "web", url: "https://github.com/acme/web" };
const api: RepoRef = { source: "github", owner: "acme", name: "api", url: "https://github.com/acme/api" };

function pr(number: number, over: Partial<PullRequest> = {}): PullRequest {
  return {
    source: "github",
    repo: web,
    number,
    title: `PR ${String(number)}`,
    authorHandle: "alice",
    state: "merged",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    mergedAt: new Date("2026-08-02T00:00:00Z"),
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commits: 1,
    reviewCommentsCount: 0,
    issueCommentsCount: 0,
    reviewsCount: 0,
    participants: ["alice"],
    linkedIssues: 0,
    url: `https://github.com/acme/web/pull/${String(number)}`,
    ...over,
  };
}

function commit(sha: string, over: Partial<Commit> = {}): Commit {
  return {
    source: "github",
    repo: web,
    sha,
    authorHandle: "alice",
    committedAt: new Date("2026-08-01T12:00:00Z"),
    additions: 0,
    deletions: 0,
    url: `https://github.com/acme/web/commit/${sha}`,
    ...over,
  };
}

function comment(url: string, over: Partial<Comment> = {}): Comment {
  return {
    source: "github",
    repo: web,
    kind: "review_summary",
    authorHandle: "bob",
    createdAt: new Date("2026-08-03T00:00:00Z"),
    prNumber: 1,
    url,
    ...over,
  };
}

function source(over: Partial<CollectResult> = {}): CollectResult {
  return { prs: [], commits: [], comments: [], repos: [], complete: true, ...over };
}

describe("flattenCollected", () => {
  it("unwraps PR groups into a flat pull-request list", () => {
    const flat = flattenCollected([
      source({ prs: [{ pr: pr(1), commits: [] }, { pr: pr(2), commits: [] }] }),
    ]);
    expect(flat.pullRequests.map((p) => p.number)).toEqual([1, 2]);
  });

  it("dedupes a commit SHA that rides two different PRs", () => {
    // The connector deliberately keeps a shared SHA in both owning groups, so
    // the dedupe that protects velocity's commit signal has to happen here.
    const flat = flattenCollected([
      source({
        prs: [
          { pr: pr(1), commits: [commit("dup1"), commit("a10")] },
          { pr: pr(2), commits: [commit("dup1"), commit("a20")] },
        ],
      }),
    ]);
    expect(flat.commits.map((c) => c.sha).sort()).toEqual(["a10", "a20", "dup1"]);
  });

  it("includes PR-less commits alongside PR-owned ones", () => {
    const flat = flattenCollected([
      source({ prs: [{ pr: pr(1), commits: [commit("owned")] }], commits: [commit("loose")] }),
    ]);
    expect(flat.commits.map((c) => c.sha).sort()).toEqual(["loose", "owned"]);
  });

  it("dedupes the same PR arriving from two handles", () => {
    const flat = flattenCollected([
      source({ prs: [{ pr: pr(7), commits: [] }] }),
      source({ prs: [{ pr: pr(7), commits: [] }] }),
    ]);
    expect(flat.pullRequests).toHaveLength(1);
  });

  it("keeps same-numbered PRs from different repos apart", () => {
    const flat = flattenCollected([
      source({ prs: [{ pr: pr(5), commits: [] }, { pr: pr(5, { repo: api }), commits: [] }] }),
    ]);
    expect(flat.pullRequests).toHaveLength(2);
  });

  it("dedupes the same author's comment seen twice, and dedupes repos by repo key", () => {
    const url = "https://github.com/acme/web/pull/1";
    const flat = flattenCollected([
      source({ comments: [comment(url)], repos: [web, api] }),
      source({ comments: [comment(url)], repos: [web] }),
    ]);
    expect(flat.comments).toHaveLength(1);
    expect(flat.repos.map((r) => r.name).sort()).toEqual(["api", "web"]);
  });

  it("keeps BOTH members' reviews of one PR", () => {
    // A review_summary is stamped with the PR's own url, so every reviewer of a
    // PR shares it. Keying on url alone would credit only one of them and
    // undercount the other's review activity in the velocity signal.
    const url = "https://github.com/acme/web/pull/1";
    const flat = flattenCollected([
      source({ comments: [comment(url, { authorHandle: "alice" })] }),
      source({ comments: [comment(url, { authorHandle: "bob" })] }),
    ]);
    expect(flat.comments.map((c) => c.authorHandle).sort()).toEqual(["alice", "bob"]);
  });

  it("returns empty collections for no sources", () => {
    expect(flattenCollected([])).toEqual({
      pullRequests: [],
      commits: [],
      comments: [],
      repos: [],
    });
  });
});
