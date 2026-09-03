import { describe, it, expect } from "vitest";
import { buildTeamDataset, type DatasetInput, type DatasetTeam } from "./dataset";
import { TeamMetaSchema, TeamIndexSchema, WeekDetailSchema } from "../schema/data";
import type { Commit, Comment, PullRequest, RepoRef } from "../types";

const web: RepoRef = { source: "github", owner: "acme", name: "web", url: "https://github.com/acme/web" };
const api: RepoRef = { source: "github", owner: "acme", name: "api", url: "https://github.com/acme/api" };

function makePr(overrides: Partial<PullRequest> & Pick<PullRequest, "number" | "authorHandle" | "createdAt">): PullRequest {
  return {
    source: "github",
    repo: web,
    title: `PR ${overrides.number}`,
    state: "open",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commits: 0,
    reviewCommentsCount: 0,
    issueCommentsCount: 0,
    reviewsCount: 0,
    participants: [],
    linkedIssues: 0,
    url: `https://github.com/acme/web/pull/${overrides.number}`,
    ...overrides,
  };
}

const team: DatasetTeam = {
  id: "acme",
  name: "Acme",
  source: "github",
  sprintStartsOn: "Mon",
  sprintStartHour: 0,
  thresholds: { red: 40, green: 70 },
  members: [
    { name: "Alice", handle: "alice" },
    { name: "Bob", handle: "bob" },
  ],
};

function sampleInput(): DatasetInput {
  const prs: PullRequest[] = [
    makePr({
      number: 1,
      authorHandle: "alice",
      state: "merged",
      createdAt: new Date(2026, 7, 4, 10),
      mergedAt: new Date(2026, 7, 5, 12),
      additions: 100,
      deletions: 20,
      changedFiles: 5,
      reviewCommentsCount: 3,
      issueCommentsCount: 2,
      reviewsCount: 1,
      participants: ["alice", "bob"],
      commits: 4,
      linkedIssues: 1,
    }),
    makePr({
      number: 2,
      repo: api,
      authorHandle: "bob",
      state: "open",
      createdAt: new Date(2026, 7, 12, 9),
      additions: 50,
      deletions: 10,
      changedFiles: 3,
      participants: ["bob"],
      commits: 2,
      url: "https://github.com/acme/api/pull/2",
    }),
    makePr({
      number: 3,
      authorHandle: "alice",
      state: "closed",
      createdAt: new Date(2026, 7, 18, 8),
      closedAt: new Date(2026, 7, 19, 8),
      additions: 10,
      deletions: 5,
      changedFiles: 1,
    }),
  ];
  const commits: Commit[] = [
    { source: "github", repo: web, sha: "a1", authorHandle: "alice", committedAt: new Date(2026, 7, 5, 11), additions: 100, deletions: 20, url: "https://github.com/acme/web/commit/a1" },
    { source: "github", repo: api, sha: "b1", authorHandle: "bob", committedAt: new Date(2026, 7, 12, 9), additions: 50, deletions: 10, url: "https://github.com/acme/api/commit/b1" },
  ];
  const comments: Comment[] = [
    { source: "github", repo: web, kind: "review", authorHandle: "bob", createdAt: new Date(2026, 7, 5, 12), prNumber: 1, url: "https://github.com/acme/web/pull/1#c1" },
    { source: "github", repo: api, kind: "issue", authorHandle: "alice", createdAt: new Date(2026, 7, 12, 10), prNumber: 2, url: "https://github.com/acme/api/pull/2#c2" },
  ];
  return {
    team,
    since: new Date(2026, 7, 3),
    until: new Date(2026, 7, 30),
    pullRequests: prs,
    commits,
    comments,
    now: new Date(2026, 7, 31, 8, 0, 0),
  };
}

describe("buildTeamDataset — schema validity", () => {
  it("produces schema-valid meta, index, and every week detail", () => {
    const ds = buildTeamDataset(sampleInput());
    expect(() => TeamMetaSchema.parse(ds.meta)).not.toThrow();
    expect(() => TeamIndexSchema.parse(ds.index)).not.toThrow();
    for (const key of Object.keys(ds.weeks)) {
      expect(() => WeekDetailSchema.parse(ds.weeks[key])).not.toThrow();
    }
  });
});

describe("buildTeamDataset — weeks & totals", () => {
  it("enumerates every week in range including empty ones", () => {
    const ds = buildTeamDataset(sampleInput());
    expect(ds.index.weeks.map((w) => w.weekStart)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
    ]);
  });

  it("aggregates team totals into the correct weeks", () => {
    const ds = buildTeamDataset(sampleInput());
    const w0 = ds.index.weeks[0].totals; // 2026-08-03
    expect(w0.prsOpened).toBe(1);
    expect(w0.prsMerged).toBe(1);
    expect(w0.commits).toBe(1);
    expect(w0.comments).toBe(1);
    expect(w0.locAdded).toBe(100);
    expect(w0.locRemoved).toBe(20);

    const w2 = ds.index.weeks[2].totals; // 2026-08-17 (rejected PR closed here)
    expect(w2.prsClosed).toBe(1);
  });

  it("attributes contributions to the right member", () => {
    const ds = buildTeamDataset(sampleInput());
    const w0 = ds.index.weeks[0];
    const alice = w0.members.find((m) => m.handle === "alice")!;
    const bob = w0.members.find((m) => m.handle === "bob")!;
    expect(alice.totals.prsMerged).toBe(1);
    expect(alice.totals.commits).toBe(1);
    expect(bob.totals.comments).toBe(1); // bob's review comment
    expect(bob.totals.prsMerged).toBe(0);
  });
});

describe("buildTeamDataset — PR detail & scoring", () => {
  it("places each PR in its primary week and scores it", () => {
    const ds = buildTeamDataset(sampleInput());
    const w0 = ds.weeks["2026-08-03"];
    expect(w0.prs.map((p) => p.number)).toEqual([1]); // PR1 merged here
    expect(w0.prs[0].score).toBeGreaterThan(0);
    // single PR in the week → normalized to 100
    expect(w0.prs[0].score).toBeCloseTo(100, 4);

    const w1 = ds.weeks["2026-08-10"];
    expect(w1.prs.map((p) => p.number)).toEqual([2]); // PR2 opened, not merged

    const w2 = ds.weeks["2026-08-17"];
    expect(w2.prs.map((p) => p.number)).toEqual([3]); // PR3 closed here
    expect(w2.prs[0].state).toBe("closed");
  });

  it("breakdown contributions sum to the score", () => {
    const ds = buildTeamDataset(sampleInput());
    const pr = ds.weeks["2026-08-03"].prs[0];
    const sum =
      pr.breakdown.loc +
      pr.breakdown.reviewActivity +
      pr.breakdown.participants +
      pr.breakdown.files +
      pr.breakdown.commits +
      pr.breakdown.linkedIssues;
    expect(sum).toBeCloseTo(pr.score, 1);
  });

  it("exposes a member's PRs, comments, and commits in the week detail", () => {
    const ds = buildTeamDataset(sampleInput());
    const w0 = ds.weeks["2026-08-03"];
    const alice = w0.members.find((m) => m.handle === "alice")!;
    expect(alice.prs.map((p) => p.number)).toEqual([1]);
    expect(alice.repos.map((r) => r.repo.name)).toContain("web");
    // alice's commit lands in this week, carried as a row (sha + date + url, no LOC).
    expect(alice.commits.map((c) => c.sha)).toEqual(["a1"]);
    expect(alice.commits[0].authorHandle).toBe("alice");
    expect(alice.commits[0]).not.toHaveProperty("additions");
    const bob = w0.members.find((m) => m.handle === "bob")!;
    expect(bob.comments).toHaveLength(1);
    expect(bob.comments[0].kind).toBe("review");
    expect(bob.commits).toHaveLength(0); // bob's commit is in the next week
  });
});

describe("buildTeamDataset — warming up & determinism", () => {
  it("flags the first 3 weeks warming up and sets warmingUpUntil", () => {
    const ds = buildTeamDataset(sampleInput());
    expect(ds.index.weeks.map((w) => w.warmingUp)).toEqual([true, true, true, false]);
    expect(ds.meta.warmingUpUntil).toBe("2026-08-24");
  });

  it("is deterministic — identical inputs produce identical JSON", () => {
    const a = JSON.stringify(buildTeamDataset(sampleInput()));
    const b = JSON.stringify(buildTeamDataset(sampleInput()));
    expect(a).toBe(b);
  });
});
