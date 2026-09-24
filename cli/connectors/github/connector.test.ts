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

    const prs = result.prs.map((c) => c.pr);
    expect(prs.map((p) => p.number).sort((a, b) => a - b)).toEqual([10, 11, 12]);

    const pr10 = prs.find((p) => p.number === 10)!;
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

    const pr11 = prs.find((p) => p.number === 11)!;
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

    // Commits ride their owning PR so the cache can replace a PR's whole commit
    // set on re-fetch; they are no longer a flat top-level list.
    const owned = result.prs.flatMap((c) => c.commits);
    expect(owned.map((c) => c.sha).sort()).toEqual(["aaa111", "aaa222", "bbb111", "ccc111"]);
    // ccc111 rides alice's PR #11 → attributed to alice; bbb111 rides bob's #12 → bob.
    expect(owned.find((c) => c.sha === "ccc111")?.authorHandle).toBe("alice");
    expect(owned.find((c) => c.sha === "bbb111")?.authorHandle).toBe("bob");

    // GitHub sources every commit from a PR, so the PR-less bucket stays empty.
    expect(result.commits).toEqual([]);

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

    expect(result.prs.flatMap((c) => c.commits).map((c) => c.sha)).toEqual(["cap1"]);
    expect(warnings.some((w) => w.includes("has 3 commits") && w.includes("only the first 1"))).toBe(true);
  });

  it("keeps a shared commit SHA in BOTH owning PRs, leaving dedupe to the flatten step", async () => {
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

    // Each PR carries its OWN complete commit set. Dropping dup1 from #20 here
    // would make the cached set for #20 depend on fetch order, and re-fetching
    // #10 alone would then lose the SHA entirely. Velocity's commit signal is
    // protected by the SHA dedupe in the flatten step, not here.
    const byNumber = new Map(result.prs.map((c) => [c.pr.number, c.commits.map((x) => x.sha).sort()]));
    expect(byNumber.get(10)).toEqual(["a10", "dup1"]);
    expect(byNumber.get(20)).toEqual(["a20", "dup1"]);
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
    expect(result.prs.every((c) => c.pr.authorHandle === "alice")).toBe(true);
  });
});
