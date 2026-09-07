import { describe, it, expect } from "vitest";
import { createGitHubConnector } from "./connector";
import { createFakeGitHubClient, type GitHubFixtures } from "./fake-client";
import fixturesJson from "./__fixtures__/github-fixtures.json";
import type { CollectContext, Logger } from "../types";
import type { Member, TeamConfig } from "../../../shared/schema/config";

const fixtures = fixturesJson as unknown as GitHubFixtures;

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

const alice: Member = { name: "Alice", github: "alice" };
const bob: Member = { name: "Bob", github: "bob" };
const carol: Member = { name: "Carol", bitbucket: "carol_bb" };

function context(members: Member[]): CollectContext {
  const team: TeamConfig = {
    id: "acme",
    name: "Acme",
    sprintStartsOn: "Mon",
    sprintStartHour: 0,
    members,
    repos: [],
  };
  return {
    team,
    members,
    since: new Date(2026, 7, 3),
    until: new Date(2026, 7, 31),
    explicitRepos: [],
    logger: silentLogger,
  };
}

describe("gitHub connector — supportsMember", () => {
  it("supports members with a github handle, rejects bitbucket-only", () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    expect(connector.supportsMember(alice)).toBe(true);
    expect(connector.supportsMember(carol)).toBe(false);
  });

  it("has the github id", () => {
    expect(createGitHubConnector(createFakeGitHubClient(fixtures)).id).toBe("github");
  });
});

describe("gitHub connector — collect over fixtures (no network)", () => {
  it("normalizes authored PRs from every member", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = await connector.collect(context([alice, bob]));

    expect(result.pullRequests.map((p) => p.number).sort((a, b) => a - b)).toEqual([10, 11, 12]);

    const pr10 = result.pullRequests.find((p) => p.number === 10)!;
    expect(pr10.state).toBe("merged");
    expect(pr10.authorHandle).toBe("alice");
    expect(pr10.additions).toBe(120);
    expect(pr10.deletions).toBe(30);
    expect(pr10.changedFiles).toBe(6);
    // reviewThreads.totalCount -> reviewCommentsCount proxy
    expect(pr10.reviewCommentsCount).toBe(3);
    expect(pr10.issueCommentsCount).toBe(2);
    expect(pr10.reviewsCount).toBe(1);
    expect(pr10.participants).toEqual(["alice", "bob"]);
    expect(pr10.linkedIssues).toBe(1);
    expect(pr10.repo.owner).toBe("acme");
    expect(pr10.repo.name).toBe("web");
    expect(pr10.mergedAt).toBeInstanceOf(Date);

    const pr11 = result.pullRequests.find((p) => p.number === 11)!;
    expect(pr11.state).toBe("open");
    expect(pr11.mergedAt).toBeUndefined();
  });

  it("emits a review_summary comment per reviewed PR", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = await connector.collect(context([alice, bob]));

    expect(result.comments).toHaveLength(2);
    for (const c of result.comments) {
      expect(c.kind).toBe("review_summary");
    }
    const aliceReview = result.comments.find((c) => c.authorHandle === "alice")!;
    expect(aliceReview.prNumber).toBe(12);
    expect(aliceReview.repo.name).toBe("api");
    expect(aliceReview.createdAt).toBeInstanceOf(Date);
  });

  it("collects each PR's own commits, attributed to the PR author, and unions repos", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = await connector.collect(context([alice, bob]));

    // Commits come from the PRs themselves now, not a repo commit log.
    expect(result.commits.map((c) => c.sha).sort()).toEqual(["aaa111", "aaa222", "bbb111", "ccc111"]);
    // ccc111 rides alice's PR #11 → attributed to alice; bbb111 rides bob's #12 → bob.
    expect(result.commits.find((c) => c.sha === "ccc111")?.authorHandle).toBe("alice");
    expect(result.commits.find((c) => c.sha === "bbb111")?.authorHandle).toBe("bob");

    const repoNames = result.repos.map((r) => `${r.owner}/${r.name}`).sort();
    expect(repoNames).toEqual(["acme/api", "acme/web"]);
  });

  it("warns instead of silently dropping when a PR has more commits than were fetched", async () => {
    const warnings: string[] = [];
    const capturingLogger: Logger = {
      info() {},
      warn: (m) => warnings.push(m),
      error() {},
      debug() {},
    };
    const capped: GitHubFixtures = {
      authored: {
        alice: [
          {
            ...fixtures.authored.alice[0],
            number: 99,
            commits: {
              totalCount: 3,
              nodes: [
                {
                  commit: {
                    oid: "cap1",
                    committedDate: "2026-08-10T00:00:00Z",
                    url: "https://github.com/acme/web/commit/cap1",
                  },
                },
              ],
            },
          },
        ],
      },
      reviewed: {},
    };
    const connector = createGitHubConnector(createFakeGitHubClient(capped));
    const result = await connector.collect({ ...context([alice]), logger: capturingLogger });

    expect(result.commits.map((c) => c.sha)).toEqual(["cap1"]);
    expect(warnings.some((w) => w.includes("has 3 commits") && w.includes("only the first 1"))).toBe(true);
  });

  it("dedupes a commit SHA shared across two of a member's PRs", async () => {
    const base = fixtures.authored.alice[0];
    const shared = {
      commit: { oid: "dup1", committedDate: "2026-08-05T10:00:00Z", url: "https://github.com/acme/web/commit/dup1" },
    };
    const dupFixtures: GitHubFixtures = {
      authored: {
        alice: [
          {
            ...base,
            number: 10,
            commits: {
              totalCount: 2,
              nodes: [
                shared,
                { commit: { oid: "a10", committedDate: "2026-08-05T11:00:00Z", url: "https://github.com/acme/web/commit/a10" } },
              ],
            },
          },
          {
            ...base,
            number: 20,
            commits: {
              totalCount: 2,
              nodes: [
                shared,
                { commit: { oid: "a20", committedDate: "2026-08-06T11:00:00Z", url: "https://github.com/acme/web/commit/a20" } },
              ],
            },
          },
        ],
      },
      reviewed: {},
    };
    const connector = createGitHubConnector(createFakeGitHubClient(dupFixtures));
    const result = await connector.collect(context([alice]));

    // dup1 rides both PRs but must appear exactly once (else velocity's commit signal inflates).
    expect(result.commits.filter((c) => c.sha === "dup1")).toHaveLength(1);
    expect(result.commits.map((c) => c.sha).sort()).toEqual(["a10", "a20", "dup1"]);
  });

  it("includes explicit repos even when no activity surfaces them", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const ctx = context([alice]);
    ctx.explicitRepos = [
      { source: "github", owner: "acme", name: "secret", url: "https://github.com/acme/secret" },
    ];
    const result = await connector.collect(ctx);
    expect(result.repos.some((r) => r.name === "secret")).toBe(true);
  });

  it("skips members without a github handle", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = await connector.collect(context([alice, carol]));
    // carol contributes nothing; only alice's PRs surface
    expect(result.pullRequests.every((p) => p.authorHandle === "alice")).toBe(true);
  });
});
